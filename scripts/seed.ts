/**
 * M1b seed — one-time devnet setup, idempotent (skip-if-exists on both steps):
 *   1. init_config (kit): admins {deployer, operator, BOOTSTRAP}, notary = notary pubkey.
 *      payer = deployer.
 *   2. global Metaplex Core collection "Superteam Certify" (Umi): authority = operator
 *      (identity), payer = deployer (identity/payer split per the deploy brief + spike-A).
 * Then writes NEXT_PUBLIC_PROGRAM_ID + CORE_COLLECTION_ADDRESS into .env (value-fill only).
 */

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import {
  appendTransactionMessageInstructions,
  createKeyPairSignerFromBytes,
  createSolanaRpc,
  createTransactionMessage,
  getBase64EncodedWireTransaction,
  getSignatureFromTransaction,
  pipe,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  signTransactionMessageWithSigners,
  address,
  type Address,
  type Instruction,
  type TransactionSigner,
} from "@solana/kit";
import {
  fetchConfig,
  findConfigPda,
  getInitConfigInstruction,
  PROGRAM_ID,
} from "@certify/client";
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import {
  createSignerFromKeypair,
  generateSigner,
  keypairIdentity,
  publicKey,
} from "@metaplex-foundation/umi";
import { base58 } from "@metaplex-foundation/umi/serializers";
import {
  createCollection,
  fetchCollection,
  mplCore,
} from "@metaplex-foundation/mpl-core";

const ROOT = join(import.meta.dirname, "..");
const RPC_URL = env("NEXT_PUBLIC_RPC_URL", "https://api.devnet.solana.com");
const APP_URL = env("NEXT_PUBLIC_APP_URL", "https://superteam.com.br/certify");
const BOOTSTRAP_ADMIN = address("Eccp5WL2sBcQGzxCPekX2FubvCzqz2RqAFZ6ieGZyMU9");
const COLLECTION_NAME = "Superteam Certify";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const explorer = (sig: string) =>
  `https://explorer.solana.com/tx/${sig}?cluster=devnet`;

function keyPath(name: string): string {
  return join(ROOT, ".keys", `${name}.json`);
}
function readSecret(name: string): Uint8Array {
  return Uint8Array.from(JSON.parse(readFileSync(keyPath(name), "utf8")));
}
function env(key: string, fallback = ""): string {
  const line = readFileSync(join(ROOT, ".env"), "utf8")
    .split("\n")
    .find((l) => l.startsWith(`${key}=`));
  const v = line?.slice(key.length + 1).trim();
  return v && v.length > 0 ? v : fallback;
}
function setEnv(updates: Record<string, string>): void {
  const path = join(ROOT, ".env");
  let text = readFileSync(path, "utf8");
  for (const [k, v] of Object.entries(updates)) {
    const re = new RegExp(`^${k}=.*$`, "m");
    text = re.test(text)
      ? text.replace(re, `${k}=${v}`)
      : `${text.trimEnd()}\n${k}=${v}\n`;
  }
  writeFileSync(path, text);
}

async function retry<T>(
  fn: () => Promise<T>,
  label: string,
  attempts = 8,
  delayMs = 1500,
): Promise<T> {
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      if (i < attempts - 1) await sleep(delayMs);
    }
  }
  throw new Error(
    `${label}: gave up after ${attempts} attempts — ${String(last)}`,
  );
}

type Rpc = ReturnType<typeof createSolanaRpc>;

async function sendKit(
  rpc: Rpc,
  feePayer: TransactionSigner,
  instructions: Instruction[],
  label: string,
): Promise<string> {
  const { value: blockhash } = await rpc
    .getLatestBlockhash({ commitment: "confirmed" })
    .send();
  const message = pipe(
    createTransactionMessage({ version: 0 }),
    (m) => setTransactionMessageFeePayerSigner(feePayer, m),
    (m) => setTransactionMessageLifetimeUsingBlockhash(blockhash, m),
    (m) => appendTransactionMessageInstructions(instructions, m),
  );
  const signed = await signTransactionMessageWithSigners(message);
  const sig = getSignatureFromTransaction(signed);
  await rpc
    .sendTransaction(getBase64EncodedWireTransaction(signed), {
      encoding: "base64",
      preflightCommitment: "confirmed",
      maxRetries: 5n,
    })
    .send();
  for (let i = 0; i < 45; i++) {
    await sleep(1000);
    const { value } = await rpc.getSignatureStatuses([sig]).send();
    const st = value[0];
    if (st?.err) throw new Error(`${label} failed: ${JSON.stringify(st.err)}`);
    if (
      st &&
      (st.confirmationStatus === "confirmed" ||
        st.confirmationStatus === "finalized")
    ) {
      return sig;
    }
  }
  throw new Error(`${label}: not confirmed within timeout (sig ${sig})`);
}

function makeUmi() {
  const umi = createUmi(RPC_URL).use(mplCore());
  const operatorKp = umi.eddsa.createKeypairFromSecretKey(
    readSecret("operator"),
  );
  const deployerKp = umi.eddsa.createKeypairFromSecretKey(
    readSecret("deployer"),
  );
  umi.use(keypairIdentity(operatorKp, false)); // identity/authority = operator, do NOT set payer
  umi.payer = createSignerFromKeypair(umi, deployerKp); // fee payer = deployer
  return umi;
}

async function main(): Promise<void> {
  const rpc = createSolanaRpc(RPC_URL);
  const deployer = await createKeyPairSignerFromBytes(readSecret("deployer"));
  const operator = await createKeyPairSignerFromBytes(readSecret("operator"));
  const notary = await createKeyPairSignerFromBytes(readSecret("notary"));

  console.log("== Certify seed (devnet) ==");
  console.log(`   program : ${PROGRAM_ID}`);
  console.log(`   deployer: ${deployer.address}`);
  console.log(`   operator: ${operator.address}`);
  console.log(`   notary  : ${notary.address}`);

  // 1) init_config -----------------------------------------------------------
  const [config] = await findConfigPda();
  const existingConfig = await fetchConfig(rpc, config);
  if (existingConfig) {
    console.log(
      `\n[1/2] Config exists (${config}) — admins=${existingConfig.adminCount}, notary=${existingConfig.notary}. Skipping.`,
    );
  } else {
    const admins: Address[] = dedupe([
      deployer.address,
      operator.address,
      BOOTSTRAP_ADMIN,
    ]);
    const ix = getInitConfigInstruction({
      payer: deployer,
      config,
      notary: notary.address,
      admins,
    });
    const sig = await sendKit(rpc, deployer, [ix], "init_config");
    console.log(
      `\n[1/2] init_config: config=${config} admins=[${admins.join(", ")}]`,
    );
    console.log(`      tx: ${explorer(sig)}`);
  }

  // 2) global Core collection ------------------------------------------------
  const umi = makeUmi();
  const existingCollection = env("CORE_COLLECTION_ADDRESS");
  let collectionAddress: string;
  const stillExists =
    existingCollection.length > 0 &&
    (await retry(
      () => fetchCollection(umi, publicKey(existingCollection)),
      "fetchCollection",
      2,
      500,
    ).then(
      () => true,
      () => false,
    ));
  if (stillExists) {
    collectionAddress = existingCollection;
    console.log(`\n[2/2] Collection exists (${collectionAddress}). Skipping.`);
  } else {
    const collectionSigner = generateSigner(umi);
    const res = await createCollection(umi, {
      collection: collectionSigner,
      name: COLLECTION_NAME,
      uri: `${APP_URL}/collection.json`,
    }).sendAndConfirm(umi);
    collectionAddress = collectionSigner.publicKey.toString();
    await retry(
      () => fetchCollection(umi, collectionSigner.publicKey),
      "confirm collection visible",
    );
    console.log(`\n[2/2] Collection created: ${collectionAddress}`);
    console.log(
      `      authority: ${operator.address} (operator)  payer: ${deployer.address}`,
    );
    console.log(`      tx: ${explorer(base58.deserialize(res.signature)[0])}`);
  }

  // 3) persist to .env -------------------------------------------------------
  setEnv({
    NEXT_PUBLIC_PROGRAM_ID: PROGRAM_ID,
    CORE_COLLECTION_ADDRESS: collectionAddress,
  });

  console.log("\n== Seed complete ==");
  console.log(`   NEXT_PUBLIC_PROGRAM_ID=${PROGRAM_ID}`);
  console.log(`   CORE_COLLECTION_ADDRESS=${collectionAddress}`);
}

function dedupe(addrs: Address[]): Address[] {
  return [...new Set(addrs)];
}

main().catch((e) => {
  console.error("SEED FAILED:", e);
  process.exit(1);
});
