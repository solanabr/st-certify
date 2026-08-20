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

const EVENT_ATTEMPTS = 3;
const EVENT_BACKOFF_MS = [300, 900];

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Writes the `certificate_asset_minted` idempotency record, retrying transient
 * insert failures. Deliberately never throws: the mint has already landed by the
 * time this runs, so aborting would strand a paid asset with no record at all,
 * while returning lets the caller's `record_asset` still land the durable
 * on-chain guard. Exhausting the retries prints a reconciliation line — the only
 * remaining trace of the asset address.
 */
async function recordMintEvent(
  certificateAddress: string,
  asset: string,
): Promise<void> {
  for (let attempt = 0; attempt < EVENT_ATTEMPTS; attempt++) {
    try {
      await logEvent({
        type: "certificate_asset_minted",
        certAddress: certificateAddress,
        payload: { asset },
      });
      return;
    } catch {
      const delay = EVENT_BACKOFF_MS[attempt];
      if (delay !== undefined) await sleep(delay);
    }
  }
  console.error(
    `[mint:reconcile] cert=${certificateAddress} asset=${asset} — asset minted but idempotency event not persisted`,
  );
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

  // Record FIRST, before anything else that can throw. The operator has already
  // paid for this asset and the guard at the top of this function is the only
  // thing standing between a re-POSTed claim-submit and a second mint, so the
  // address has to reach the events table the instant it exists.
  await recordMintEvent(input.certificateAddress, assetAddress);

  // Then wait for visibility — the record_asset ix that follows expects the
  // asset resolvable, and public devnet RPC lags ~10s. Best-effort: the record
  // above already survives a failure here, and record_asset's own error is
  // retryable and now idempotent.
  try {
    await retryFetch(() => fetchAsset(umi, assetSigner.publicKey));
  } catch {
    // Falls through — a slow RPC must not cost us the recorded address.
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
