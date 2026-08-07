import "server-only";

// The ONLY module that talks to Metaplex Core (Umi + mpl-core), server-side.
// Mints the soulbound certificate asset at claim time and burns it on revoke.
// Every shape here is the one proven live on devnet by scripts/e2e-devnet.ts +
// the spike-A report: plugins flattened (not nested under `data`); the fetched
// `collection` object threaded into every post-create op (MissingCollection
// 0x19 trap); retry-with-backoff on read-after-write (public devnet RPC lags
// ~10s); mint idempotency via a persisted `certificate_asset_minted` event.

import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import {
  generateSigner,
  keypairIdentity,
  publicKey,
  type Umi,
} from "@metaplex-foundation/umi";
import { base58 } from "@metaplex-foundation/umi/serializers";
import {
  burn,
  create,
  fetchAsset,
  fetchCollection,
  mplCore,
} from "@metaplex-foundation/mpl-core";
import { fail } from "@/lib/errors";
import { dbConfigured, logEvent } from "@/lib/db/mutations";
import { loadKeypairBytes } from "@/lib/chain/server-tx";
import { getMintedAssetFromEvents } from "@/lib/db/claim-verify-mutations";

const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL;
const COLLECTION = process.env.CORE_COLLECTION_ADDRESS;

let umiSingleton: Umi | null = null;

/** Umi with OPERATOR as identity + payer (funded; holds the PermanentBurnDelegate). */
function getUmi(): Umi {
  if (!RPC_URL) {
    fail("CHAIN_RPC_UNAVAILABLE", "NEXT_PUBLIC_RPC_URL não configurado.");
  }
  const operatorEnv = process.env.OPERATOR_SECRET_KEY;
  if (!operatorEnv) {
    fail("INTERNAL", "OPERATOR_SECRET_KEY não configurado.");
  }
  if (!umiSingleton) {
    const umi = createUmi(RPC_URL).use(mplCore());
    const operatorKp = umi.eddsa.createKeypairFromSecretKey(
      loadKeypairBytes(operatorEnv),
    );
    umi.use(keypairIdentity(operatorKp)); // setPayer: true — identity == payer
    umiSingleton = umi;
  }
  return umiSingleton;
}

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

const sleep = (ms: number): Promise<void> =>
  new Promise((r) => setTimeout(r, ms));

/** Spike-A read-after-write backoff: the public devnet RPC needs ~7 tries at 1.5s. */
async function retryFetch<T>(
  fn: () => Promise<T>,
  attempts = 8,
  delayMs = 1500,
): Promise<T> {
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      last = err;
      if (i < attempts - 1) await sleep(delayMs);
    }
  }
  throw last instanceof Error ? last : new Error(String(last));
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
  const umi = getUmi();

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
  const umi = getUmi();

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
