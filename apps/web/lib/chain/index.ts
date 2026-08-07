// Client-safe entry point for on-chain helpers. Server-only signer loading
// lives in `@/lib/chain/server` (imports `node:fs`, must never reach the
// client bundle) — import that explicitly where needed.
//
// Every exported function here takes/returns plain `string`/`Uint8Array` at
// its boundary, never kit's branded `Address`/`ReadonlyUint8Array` types —
// callers (route handlers, hooks) are fenced off from importing `@solana/kit`
// themselves, so the branding happens entirely inside this module.

import {
  address as toAddress,
  appendTransactionMessageInstruction,
  compileTransaction,
  createNoopSigner,
  createTransactionMessage,
  getTransactionEncoder,
  setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash,
  type Address,
  type Instruction,
} from "@solana/kit";
import { findCertPda, getRequestCertificateInstruction } from "@certify/client";
import { fail } from "@/lib/errors";
import { getRpc, rpcConfigured } from "./rpc";

export { getRpc, getRpcSubscriptions, rpcConfigured } from "./rpc";

/** True once the program has been deployed and its address written to .env. */
export const programDeployed = Boolean(process.env.NEXT_PUBLIC_PROGRAM_ID);

function assertChainReady(): void {
  if (!rpcConfigured) {
    fail("CHAIN_RPC_UNAVAILABLE", "RPC não configurado.");
  }
  if (!programDeployed) {
    fail(
      "CHAIN_PROGRAM_NOT_DEPLOYED",
      "O programa on-chain ainda não foi implantado. Tente novamente em breve.",
      { retryable: true },
    );
  }
}

/** Certificate PDA for an (edition, student) pair — used by prepare-request to key the pending DB row. */
export async function deriveCertificatePda(
  editionAddress: string,
  studentAddress: string,
): Promise<string> {
  const [pda] = await findCertPda(
    toAddress(editionAddress),
    toAddress(studentAddress),
  );
  return pda;
}

export interface PreparedTransaction {
  /** Raw unsigned wire bytes — sign via the wallet-standard feature, then base64-encode (lib/bytes.ts) for /api/tx/submit. */
  wireBytes: Uint8Array;
  /** Ceiling block height for the blockhash used — pass through to /api/tx/submit. */
  lastValidBlockHeight: bigint;
}

/** Compiles a single-instruction, one-signer v0 transaction against a fresh blockhash. */
async function prepareTransaction(
  feePayer: Address,
  instruction: Instruction,
): Promise<PreparedTransaction> {
  assertChainReady();
  const rpc = getRpc();
  const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();

  const message = appendTransactionMessageInstruction(
    instruction,
    setTransactionMessageLifetimeUsingBlockhash(
      latestBlockhash,
      setTransactionMessageFeePayer(
        feePayer,
        createTransactionMessage({ version: 0 }),
      ),
    ),
  );

  const wireBytes = new Uint8Array(
    getTransactionEncoder().encode(compileTransaction(message)),
  );

  return {
    wireBytes,
    lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
  };
}

export interface PrepareRequestCertificateInput {
  student: string;
  edition: string;
  /** 32-byte sha256(salt ‖ NFC(name)) commitment, from POST /api/certificates/prepare-request. */
  nameCommitment: Uint8Array;
}

export interface PrepareRequestCertificateResult extends PreparedTransaction {
  certificate: string;
}

/**
 * Builds the unsigned `request_certificate` transaction. The student address
 * is wrapped in `createNoopSigner` purely so `@certify/client`'s instruction
 * builder can produce a correctly-typed signer account meta — the actual
 * signature comes from the wallet-standard `signTransaction` feature on the
 * compiled bytes (Privy v3's verified integration path), never from kit's own
 * signer machinery.
 */
export async function prepareRequestCertificateTransaction(
  input: PrepareRequestCertificateInput,
): Promise<PrepareRequestCertificateResult> {
  const student = toAddress(input.student);
  const edition = toAddress(input.edition);
  const [certificate] = await findCertPda(edition, student);
  const instruction = getRequestCertificateInstruction({
    student: createNoopSigner(student),
    edition,
    certificate,
    nameCommitment: input.nameCommitment,
  });
  const prepared = await prepareTransaction(student, instruction);
  return { ...prepared, certificate };
}
