import "server-only";

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  appendTransactionMessageInstruction,
  createKeyPairSignerFromBytes,
  createTransactionMessage,
  getBase64Decoder,
  getTransactionEncoder,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  signTransactionMessageWithSigners,
  type Instruction,
  type KeyPairSigner,
} from "@solana/kit";
import { fail } from "@/lib/errors";
import { getRpc } from "@/lib/chain";

/**
 * Server-side signer loading + one-instruction transaction signing, shared by
 * the M5 claim/mint/revoke flows. Kept in its own module (not folded into M3's
 * `server.ts`) so the two milestones stay collision-free.
 *
 * The keypair env values are either an inline JSON byte array (`[12,34,...]`) or
 * a path to such a file. Paths in the root `.env` are repo-root-relative, but
 * the app's runtime cwd is `apps/web/`, so a bare `readFileSync` would ENOENT —
 * `resolveKeyPath` therefore also tries the workspace root (cwd/../..), the same
 * root `next.config.ts` points `loadEnvConfig` at.
 */
function resolveKeyPath(p: string): string {
  if (existsSync(p)) return p; // absolute, or already resolvable from cwd
  const fromWorkspaceRoot = path.join(process.cwd(), "..", "..", p);
  if (existsSync(fromWorkspaceRoot)) return fromWorkspaceRoot;
  return p; // let readFileSync throw a clear ENOENT
}

export function loadKeypairBytes(envVal: string): Uint8Array {
  const raw = envVal.trim().startsWith("[")
    ? envVal
    : readFileSync(resolveKeyPath(envVal), "utf8");

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    fail("INTERNAL", "Chave inválida: JSON malformado.");
  }

  if (!Array.isArray(parsed) || !parsed.every((n) => typeof n === "number")) {
    fail("INTERNAL", "Chave inválida: formato inesperado.");
  }

  return new Uint8Array(parsed);
}

export type ServerSignerRole = "operator" | "notary" | "deployer";

const ENV_BY_ROLE: Record<ServerSignerRole, string> = {
  operator: "OPERATOR_SECRET_KEY",
  notary: "NOTARY_SECRET_KEY",
  deployer: "DEPLOYER_SECRET_KEY",
};

const signerCache = new Map<ServerSignerRole, KeyPairSigner>();

/**
 * Loads (and memoizes) one of the three server keypairs by role. OPERATOR mints
 * + records + is the first admin; NOTARY co-signs claims; DEPLOYER is the second
 * distinct admin for the destructive (revoke) class.
 */
export async function getServerSigner(
  role: ServerSignerRole,
): Promise<KeyPairSigner> {
  const cached = signerCache.get(role);
  if (cached) return cached;

  const envVal = process.env[ENV_BY_ROLE[role]];
  if (!envVal) {
    fail("INTERNAL", `${ENV_BY_ROLE[role]} não configurado.`);
  }
  const signer = await createKeyPairSignerFromBytes(loadKeypairBytes(envVal));
  signerCache.set(role, signer);
  return signer;
}

export interface SignedServerTx {
  wireBytesBase64: string;
  lastValidBlockHeight: bigint;
}

/**
 * Builds a single-instruction v0 transaction against a fresh blockhash, signs it
 * with `feePayer` plus every `TransactionSigner` attached to the instruction's
 * account metas, and returns base64 wire bytes ready for
 * `submitAndSyncTransaction`. Mirrors `server.ts`'s private `signAndEncode`.
 */
export async function signServerTx(
  instruction: Instruction,
  feePayer: KeyPairSigner,
): Promise<SignedServerTx> {
  const rpc = getRpc();
  const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();

  const message = appendTransactionMessageInstruction(
    instruction,
    setTransactionMessageLifetimeUsingBlockhash(
      latestBlockhash,
      setTransactionMessageFeePayerSigner(
        feePayer,
        createTransactionMessage({ version: 0 }),
      ),
    ),
  );

  const signedTransaction = await signTransactionMessageWithSigners(message);
  const wireBytes = getTransactionEncoder().encode(signedTransaction);

  return {
    wireBytesBase64: getBase64Decoder().decode(wireBytes),
    lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
  };
}
