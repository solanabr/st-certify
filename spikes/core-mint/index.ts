/**
 * M0-spikeA: de-risking spike proving the Metaplex Core soulbound mint
 * pipeline on devnet with @metaplex-foundation/mpl-core@1.10.0 via Umi.
 *
 * Steps: create collection -> create soulbound asset (frozen + permanent
 * burn delegate + attributes) -> assert frozen -> attempt owner transfer
 * (expect failure) -> burn via operator's permanent burn delegate (expect
 * success despite being frozen).
 */
import { readFileSync } from "node:fs";
import {
  generateSigner,
  keypairIdentity,
  type PublicKey,
  type Signer,
} from "@metaplex-foundation/umi";
import { base58 } from "@metaplex-foundation/umi/serializers";
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import {
  burn,
  create,
  createCollection,
  fetchAsset,
  fetchCollection,
  mplCore,
  transfer,
} from "@metaplex-foundation/mpl-core";

const RPC_URL = "https://api.devnet.solana.com";
// Production mint pipeline (M5) uses the operator keypair. This spike
// accepts an override via KEYPAIR_PATH so it can run against a funded
// devnet wallet when the operator's devnet airdrop is rate-limited — see
// report "Concerns" for the run-specific substitution used.
const KEYPAIR_PATH =
  process.env.KEYPAIR_PATH ??
  "/Users/azrael/Developer/GigaClaude/st-certify/.keys/operator.json";

function explorerTx(signature: string): string {
  return `https://explorer.solana.com/tx/${signature}?cluster=devnet`;
}

function decodeSignature(signature: Uint8Array): string {
  return base58.deserialize(signature)[0];
}

// Plugin objects carry a `offset: bigint` field (BasePlugin) that
// JSON.stringify cannot serialize natively.
function stringify(value: unknown): string {
  return JSON.stringify(value, (_key, v) =>
    typeof v === "bigint" ? v.toString() : v,
  );
}

function describeError(err: unknown): string {
  if (err instanceof Error) {
    const logs = (err as { logs?: unknown }).logs;
    const logsText = Array.isArray(logs)
      ? `\n  logs: ${logs.join("\n        ")}`
      : "";
    return `${err.message}${logsText}`;
  }
  return String(err);
}

// api.devnet.solana.com is a load-balanced multi-node RPC cluster; a fetch
// immediately after sendAndConfirm's default 'confirmed' commitment can land
// on a node that hasn't replicated the write yet. Retry with backoff rather
// than escalating every sendAndConfirm to 'finalized' commitment.
async function retryFetch<T>(
  fn: () => Promise<T>,
  attempts = 8,
  delayMs = 1500,
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      console.log(
        `      (retry ${attempt}/${attempts} after: ${describeError(err)})`,
      );
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw lastErr;
}

async function main(): Promise<void> {
  const umi = createUmi(RPC_URL).use(mplCore());

  const secretKeyArray: number[] = JSON.parse(
    readFileSync(KEYPAIR_PATH, "utf-8"),
  );
  const identityKeypair = umi.eddsa.createKeypairFromSecretKey(
    Uint8Array.from(secretKeyArray),
  );
  umi.use(keypairIdentity(identityKeypair));

  console.log(`Keypair path: ${KEYPAIR_PATH}`);
  console.log(
    `Umi identity (payer + PermanentBurnDelegate authority): ${umi.identity.publicKey}`,
  );
  console.log(`RPC: ${RPC_URL}`);
  console.log("");

  // --- Step 2: createCollection ---
  const collectionSigner = generateSigner(umi);
  const { signature: createCollectionSigRaw } = await createCollection(umi, {
    collection: collectionSigner,
    name: "Superteam Certify (spike)",
    uri: "https://example.com/collection.json",
  }).sendAndConfirm(umi);
  const createCollectionSig = decodeSignature(createCollectionSigRaw);
  console.log(`[1/6] Collection created: ${collectionSigner.publicKey}`);
  console.log(`      tx: ${explorerTx(createCollectionSig)}`);

  const collection = await retryFetch(() =>
    fetchCollection(umi, collectionSigner.publicKey),
  );

  // --- Step 3: create soulbound asset in the collection ---
  const throwawayOwner: Signer = generateSigner(umi);
  const assetSigner = generateSigner(umi);

  const { signature: createAssetSigRaw } = await create(umi, {
    asset: assetSigner,
    collection,
    name: "Spike Cert #1",
    uri: "https://example.com/cert-1.json",
    owner: throwawayOwner.publicKey,
    plugins: [
      {
        type: "PermanentFreezeDelegate",
        frozen: true,
        authority: { type: "None" }, // soulbound: no one can thaw
      },
      {
        type: "PermanentBurnDelegate",
        authority: { type: "Address", address: umi.identity.publicKey }, // identity can always revoke (production: operator)
      },
      {
        type: "Attributes",
        attributeList: [
          { key: "cert_pda", value: "SPIKE" },
          { key: "cert_number", value: "1" },
        ],
      },
    ],
  }).sendAndConfirm(umi);
  const createAssetSig = decodeSignature(createAssetSigRaw);
  console.log(`[2/6] Asset created: ${assetSigner.publicKey}`);
  console.log(`      owner (throwaway): ${throwawayOwner.publicKey}`);
  console.log(`      tx: ${explorerTx(createAssetSig)}`);

  // --- Step 4: fetch asset, print plugin state, assert frozen ---
  const asset = await retryFetch(() => fetchAsset(umi, assetSigner.publicKey));
  console.log("[3/6] Fetched asset plugin state:");
  console.log(
    `      permanentFreezeDelegate: ${stringify(asset.permanentFreezeDelegate)}`,
  );
  console.log(
    `      permanentBurnDelegate:   ${stringify(asset.permanentBurnDelegate)}`,
  );
  console.log(`      attributes:              ${stringify(asset.attributes)}`);

  const isFrozen = asset.permanentFreezeDelegate?.frozen === true;
  if (!isFrozen) {
    throw new Error(
      `ASSERTION FAILED: expected permanentFreezeDelegate.frozen === true, got ${stringify(asset.permanentFreezeDelegate)}`,
    );
  }
  console.log("      assert frozen === true: OK");
  console.log("");

  // --- Step 5: negative test - owner-signed transfer must fail (frozen) ---
  const transferRecipient: PublicKey = generateSigner(umi).publicKey;
  let transferBlocked = false;
  let transferErrorText = "";
  try {
    await transfer(umi, {
      asset,
      collection,
      newOwner: transferRecipient,
      authority: throwawayOwner,
    }).sendAndConfirm(umi);
    console.log(
      "[4/6] UNEXPECTED: transfer succeeded (should have been blocked by freeze)",
    );
  } catch (err) {
    transferBlocked = true;
    transferErrorText = describeError(err);
    console.log("[4/6] Transfer blocked as expected (soulbound proof):");
    console.log(`      error: ${transferErrorText}`);
  }
  console.log("");

  if (!transferBlocked) {
    throw new Error(
      "ASSERTION FAILED: transfer by owner should have failed on a frozen asset",
    );
  }

  // --- Step 6: burn while frozen via identity's permanent burn delegate ---
  let burnSig = "";
  let burnSucceeded = false;
  try {
    const { signature: burnSigRaw } = await burn(umi, {
      asset,
      collection,
    }).sendAndConfirm(umi);
    burnSig = decodeSignature(burnSigRaw);
    burnSucceeded = true;
    console.log("[5/6] Burn via identity's PermanentBurnDelegate succeeded:");
    console.log(`      tx: ${explorerTx(burnSig)}`);
  } catch (err) {
    console.log("[5/6] UNEXPECTED: burn via PermanentBurnDelegate failed:");
    console.log(`      error: ${describeError(err)}`);
  }
  console.log("");

  if (!burnSucceeded) {
    throw new Error(
      "ASSERTION FAILED: burn via PermanentBurnDelegate should succeed even while frozen",
    );
  }

  // --- Step 7: summary ---
  console.log("[6/6] Summary");
  console.log(
    `SPIKE_A: PASS collection=${collectionSigner.publicKey} asset=${assetSigner.publicKey} transferBlocked=yes burnWhileFrozen=yes`,
  );
  console.log("");
  console.log("Devnet tx signatures:");
  console.log(
    `  createCollection: ${createCollectionSig}  ${explorerTx(createCollectionSig)}`,
  );
  console.log(
    `  create (asset):   ${createAssetSig}  ${explorerTx(createAssetSig)}`,
  );
  console.log(`  burn:             ${burnSig}  ${explorerTx(burnSig)}`);
}

main().catch((err) => {
  console.error("SPIKE_A: FAIL");
  console.error(describeError(err));
  process.exit(1);
});
