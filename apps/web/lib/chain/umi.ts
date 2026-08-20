import "server-only";

import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import { keypairIdentity, type Umi } from "@metaplex-foundation/umi";
import { mplCore } from "@metaplex-foundation/mpl-core";
import { mplBubblegum } from "@metaplex-foundation/mpl-bubblegum";
import { mplAccountCompression } from "@metaplex-foundation/mpl-account-compression";
import { fail } from "@/lib/errors";
import { loadKeypairBytes } from "@/lib/chain/server-tx";
import { resolveRpcUrl } from "@/lib/chain/rpc";

let umiSingleton: Umi | null = null;

/**
 * Umi with OPERATOR as identity + payer (funded). Shared singleton behind the
 * certificate mint/burn flows (mint.ts) and attendance mints (attendance.ts).
 */
export function getOperatorUmi(): Umi {
  const rpcUrl = resolveRpcUrl();
  if (!rpcUrl) {
    fail("CHAIN_RPC_UNAVAILABLE", "NEXT_PUBLIC_RPC_URL não configurado.");
  }
  const operatorEnv = process.env.OPERATOR_SECRET_KEY;
  if (!operatorEnv) {
    fail("INTERNAL", "OPERATOR_SECRET_KEY não configurado.");
  }
  if (!umiSingleton) {
    const umi = createUmi(rpcUrl)
      .use(mplCore())
      .use(mplBubblegum())
      .use(mplAccountCompression());
    const operatorKp = umi.eddsa.createKeypairFromSecretKey(
      loadKeypairBytes(operatorEnv),
    );
    umi.use(keypairIdentity(operatorKp)); // setPayer: true — identity == payer
    umiSingleton = umi;
  }
  return umiSingleton;
}

const sleep = (ms: number): Promise<void> =>
  new Promise((r) => setTimeout(r, ms));

/** Spike-A read-after-write backoff: public devnet RPC needs ~7 tries at 1.5s. */
export async function retryFetch<T>(
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
