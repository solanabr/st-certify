// Standalone long-horizon airdrop retry loop for the R4 fallback signer. Split out from
// r4-local-signer.mjs so it can run unattended with realistic backoff (the devnet faucet
// rate-limits per IP and this machine has several sibling agents also requesting airdrops
// tonight) while other work continues.
import { readFileSync } from "node:fs";
import { createSolanaRpc, createKeyPairSignerFromPrivateKeyBytes } from "@solana/kit";

const DEVNET_RPC_URL = "https://api.devnet.solana.com";
const rpc = createSolanaRpc(DEVNET_RPC_URL);
const KEY_PATH = new URL("../.keys/devnet-signer.json", import.meta.url).pathname;

const seed = new Uint8Array(JSON.parse(readFileSync(KEY_PATH, "utf8")));
const signer = await createKeyPairSignerFromPrivateKeyBytes(seed);
console.log(`Target address: ${signer.address}`);

const MIN_LAMPORTS = 5_000_000n;
const MAX_ATTEMPTS = 20;
const DELAY_MS = 45_000;

for (let i = 1; i <= MAX_ATTEMPTS; i++) {
  const { value: balance } = await rpc.getBalance(signer.address).send();
  console.log(`[${new Date().toISOString()}] attempt ${i}/${MAX_ATTEMPTS} — balance ${balance}`);
  if (balance >= MIN_LAMPORTS) {
    console.log("FUNDED");
    process.exit(0);
  }
  try {
    const sig = await rpc.requestAirdrop(signer.address, 1_000_000_000n).send();
    console.log(`  airdrop accepted: ${sig}`);
  } catch (err) {
    console.log(`  airdrop rejected: ${err instanceof Error ? err.message : String(err)}`);
  }
  await new Promise((r) => setTimeout(r, DELAY_MS));
}

const { value: finalBalance } = await rpc.getBalance(signer.address).send();
console.log(`PENDING_FUNDS: gave up after ${MAX_ATTEMPTS} attempts, balance ${finalBalance}`);
process.exit(finalBalance >= MIN_LAMPORTS ? 0 : 2);
