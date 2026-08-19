import "server-only";

// The ONLY module that talks to Metaplex Core (Umi + mpl-core), server-side.
// Mints the soulbound certificate asset at claim time and burns it on revoke.
// Every shape here is the one proven live on devnet by scripts/e2e-devnet.ts +
// the spike-A report: plugins flattened (not nested under `data`); the fetched
// `collection` object threaded into every post-create op (MissingCollection
// 0x19 trap); retry-with-backoff on read-after-write (public devnet RPC lags
// ~10s); mint idempotency via a persisted `certificate_asset_minted` event.

import { generateSigner, publicKey } from "@metaplex-foundation/umi";
import { base58 } from "@metaplex-foundation/umi/serializers";
import {
  burn,
  create,
  fetchAsset,
  fetchCollection,
} from "@metaplex-foundation/mpl-core";
import { fail } from "@/lib/errors";
import { dbConfigured, logEvent } from "@/lib/db/mutations";
import { getMintedAssetFromEvents } from "@/lib/db/claim-verify-mutations";
import { getOperatorUmi, retryFetch } from "@/lib/chain/umi";

const COLLECTION = process.env.CORE_COLLECTION_ADDRESS;

function assertCollectionConfigured(): string {
  if (!COLLECTION) {
    fail(
      "CHAIN_PROGRAM_NOT_DEPLOYED",
      "Coleção Core não configurada (CORE_COLLECTION_ADDRESS).",
      { retryable: true },
    );
  }
  return COLLECTION;
}

export interface MintCertificateAssetInput {
  certificateAddress: string;
  editionId: string;
  editionName: string;
  certNumber: number;
  /** The student's wallet — asset owner (bare pubkey; no claimant signature at mint). */
  owner: string;
  artifactSha256Hex: string;
  verifyUrl: string;
  /** Content-addressed metadata JSON URL — the asset's `uri`. */
  metadataUri: string;
}

/**
 * Mints (or, if a prior attempt already minted for this cert, returns) the
 * soulbound Core asset: PermanentFreezeDelegate frozen with authority None
 * (truly soulbound — no thaw, revocation is burn) + PermanentBurnDelegate held
 * by OPERATOR + Attributes back-referencing the cert. Idempotent: a persisted
 * mint event means a re-POSTed claim-submit reuses that asset instead of
 * minting a duplicate.
 */
export async function mintCertificateAsset(
  input: MintCertificateAssetInput,
): Promise<string> {
  const existing = await getMintedAssetFromEvents(input.certificateAddress);
  if (existing) return existing;

  const collectionAddress = assertCollectionConfigured();
  const umi = getOperatorUmi();

  const collection = await retryFetch(() =>
    fetchCollection(umi, publicKey(collectionAddress)),
  );

  const assetSigner = generateSigner(umi);

  await create(umi, {
    asset: assetSigner,
    collection,
    owner: publicKey(input.owner),
    name: `${input.editionName} #${input.certNumber}`,
    uri: input.metadataUri,
    plugins: [
      {
        type: "PermanentFreezeDelegate",
        frozen: true,
        authority: { type: "None" },
      },
      {
        type: "PermanentBurnDelegate",
        authority: { type: "Address", address: umi.identity.publicKey },
      },
      {
        type: "Attributes",
        attributeList: [
          { key: "cert_pda", value: input.certificateAddress },
          { key: "edition_id", value: input.editionId },
          { key: "cert_number", value: String(input.certNumber) },
          { key: "artifact_sha256", value: input.artifactSha256Hex },
          { key: "verify_url", value: input.verifyUrl },
        ],
      },
    ],
  }).sendAndConfirm(umi);

  const assetAddress = assetSigner.publicKey.toString();

  // Confirm visibility before recording — the record_asset ix that follows
  // fetches the cert, and downstream /me reads expect the asset resolvable.
  await retryFetch(() => fetchAsset(umi, assetSigner.publicKey));

  if (dbConfigured) {
    await logEvent({
      type: "certificate_asset_minted",
      certAddress: input.certificateAddress,
      payload: { asset: assetAddress },
    });
  }

  return assetAddress;
}

export interface BurnCertificateAssetInput {
  asset: string;
  certificateAddress: string;
}

/**
 * Burns a revoked cert's asset via OPERATOR's PermanentBurnDelegate (works
 * despite the permanent freeze — spike-A #5). Best-effort: the caller treats a
 * throw as non-fatal (REVOKED stands regardless). The fetched collection MUST
 * be threaded in (MissingCollection trap).
 */
export async function burnCertificateAsset(
  input: BurnCertificateAssetInput,
): Promise<string> {
  const collectionAddress = assertCollectionConfigured();
  const umi = getOperatorUmi();

  const [collection, asset] = await Promise.all([
    retryFetch(() => fetchCollection(umi, publicKey(collectionAddress))),
    retryFetch(() => fetchAsset(umi, publicKey(input.asset))),
  ]);

  const result = await burn(umi, { asset, collection }).sendAndConfirm(umi);
  const signature = base58.deserialize(result.signature)[0];

  if (dbConfigured) {
    await logEvent({
      type: "certificate_asset_burned",
      certAddress: input.certificateAddress,
      txSig: signature,
      payload: { asset: input.asset },
    });
  }

  return signature;
}
