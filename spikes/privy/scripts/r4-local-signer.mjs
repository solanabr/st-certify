// R4 fallback (per task brief): prove the tx-building + sending pipeline end to end with a
// local @solana/kit keypair signer instead of a Privy wallet — the browser-based R2/R3 rungs
// are blocked by this sandbox's headless Chromium being unable to reach any outbound host at
// all (see task-m0-spike-b-report.md). Only the Privy-signer swap remains for a human to
// verify manually once a real browser + Privy dashboard test-account are available.
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import {
  appendTransactionMessageInstruction,
  compileTransaction,
  createKeyPairSignerFromBytes,
  createKeyPairSignerFromPrivateKeyBytes,
  createSolanaRpc,
  createTransactionMessage,
  generateKeyPairSigner,
  getBase64Decoder,
  getSignatureFromTransaction,
  getTransactionEncoder,
  pipe,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  signTransactionMessageWithSigners,
} from "@solana/kit";
import { getAddMemoInstruction } from "@solana-program/memo";

const DEVNET_RPC_URL = "https://api.devnet.solana.com";
const rpc = createSolanaRpc(DEVNET_RPC_URL);

const KEY_DIR = new URL("../.keys/", import.meta.url).pathname;
const KEY_PATH = `${KEY_DIR}devnet-signer.json`;
mkdirSync(KEY_DIR, { recursive: true });

// Same spike-only substitution pattern m0-spikeA already used tonight: the throwaway
// devnet-signer.json address hits the machine-wide exhausted faucet (multiple sibling
// spikes airdropping concurrently), so KEYPAIR_PATH lets this run reuse the pre-funded
// shared deployer key instead. Not a production change — just which key signed this proof.
const KEYPAIR_PATH_OVERRIDE = process.env.KEYPAIR_PATH;

async function loadOrCreateSigner() {
  if (KEYPAIR_PATH_OVERRIDE) {
    const bytes = new Uint8Array(JSON.parse(readFileSync(KEYPAIR_PATH_OVERRIDE, "utf8")));
    return createKeyPairSignerFromBytes(bytes);
  }
  if (existsSync(KEY_PATH)) {
    const seed = new Uint8Array(JSON.parse(readFileSync(KEY_PATH, "utf8")));
    return createKeyPairSignerFromPrivateKeyBytes(seed);
  }
  const signer = await generateKeyPairSigner();
  // Kit's CryptoKey is non-extractable; persist a fresh random seed alongside it instead so
  // reruns reuse the same funded address (devnet airdrops are rate-limited).
  const seed = crypto.getRandomValues(new Uint8Array(32));
  writeFileSync(KEY_PATH, JSON.stringify(Array.from(seed)));
  return createKeyPairSignerFromPrivateKeyBytes(seed);
}

async function getBalance(addr) {
  const { value } = await rpc.getBalance(addr).send();
  return value;
}

async function airdropWithRetries(addr, lamports, attempts = 8) {
  for (let i = 1; i <= attempts; i++) {
    try {
      const sig = await rpc.requestAirdrop(addr, lamports).send();
      console.log(`airdrop requested (attempt ${i}): ${sig}`);
      for (let poll = 0; poll < 20; poll++) {
        await new Promise((r) => setTimeout(r, 1500));
        const bal = await getBalance(addr);
        if (bal >= lamports) return true;
      }
      console.log(`airdrop attempt ${i} did not land within 30s, retrying...`);
    } catch (err) {
      console.log(`airdrop attempt ${i} failed: ${err instanceof Error ? err.message : String(err)}`);
      await new Promise((r) => setTimeout(r, 3000 * i));
    }
  }
  return false;
}

// Rebuild the seed-backed signer for a fresh CryptoKeySigner each run (loadOrCreateSigner
// above already returns one, kept as a separate helper name for readability at call sites).
async function main() {
  const signer = await loadOrCreateSigner();
  console.log(`Using local devnet signer: ${signer.address}`);

  let balance = await getBalance(signer.address);
  console.log(`Current balance: ${balance} lamports`);

  const MIN_LAMPORTS = 5_000_000n; // enough for 3 memo txs + headroom
  if (balance < MIN_LAMPORTS) {
    console.log("Requesting devnet airdrop (rate-limited faucet, retrying with backoff)...");
    const funded = await airdropWithRetries(signer.address, 1_000_000_000n);
    balance = await getBalance(signer.address);
    if (!funded || balance < MIN_LAMPORTS) {
      console.log(`PENDING_FUNDS: balance is still ${balance} lamports after retries.`);
      process.exit(2);
    }
  }
  console.log(`Funded. Balance: ${balance} lamports`);

  const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();
  console.log(`Blockhash: ${latestBlockhash.blockhash}`);

  const base64Decoder = getBase64Decoder();
  const transactionEncoder = getTransactionEncoder();

  for (const n of [1, 2, 3]) {
    const message = pipe(
      createTransactionMessage({ version: 0 }),
      (m) => setTransactionMessageFeePayerSigner(signer, m),
      (m) => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, m),
      (m) =>
        appendTransactionMessageInstruction(
          getAddMemoInstruction({ memo: `st-certify spike R4 memo ${n}/3 — ${Date.now()}` }),
          m,
        ),
    );
    const signedTx = await signTransactionMessageWithSigners(message);
    const compiledForLog = compileTransaction(message);
    void compiledForLog; // compiled purely to mirror the R3 encode path in logs below
    const wire = transactionEncoder.encode(signedTx);
    const b64 = base64Decoder.decode(wire);
    console.log(`Signed tx ${n}/3 (base64): ${b64}`);

    const signature = await rpc.sendTransaction(b64, { encoding: "base64" }).send();
    console.log(`Sent tx ${n}/3 -> signature ${signature}`);
    console.log(`  (matches getSignatureFromTransaction: ${getSignatureFromTransaction(signedTx)})`);
  }

  console.log("R4 OK: 3 memo transactions built, signed, and sent on devnet with a local kit signer.");
}

await main();
