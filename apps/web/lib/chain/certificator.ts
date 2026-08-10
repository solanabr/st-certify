// Certificator (M4) chain builders — client-safe. Under lib/chain/** so the
// @solana/kit + @certify/client import fences are satisfied; a separate file
// (not index.ts) to stay collision-free with M3. Boundary types are plain
// string/Uint8Array/bigint — kit branding never leaks to hooks/routes.

import {
  address as toAddress,
  appendTransactionMessageInstructions,
  compileTransaction,
  createNoopSigner,
  createTransactionMessage,
  getTransactionEncoder,
  setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash,
  type Address,
  type Instruction,
} from "@solana/kit";
import {
  CU_BUDGETS,
  findConfigPda,
  getRejectRequestInstruction,
  getSignCertificateInstruction,
} from "@certify/client";
import { fail } from "@/lib/errors";
import { getRpc, rpcConfigured } from "./rpc";

const programDeployed = Boolean(process.env.NEXT_PUBLIC_PROGRAM_ID);

/** Batch capacity (plan §8): 39 B/cert marginal, 26 ceiling — ship 20 with headroom. */
const MAX_SIGNS_PER_TX = 20;
const MAX_TX_BYTES = 1232;
const COMPUTE_BUDGET_PROGRAM = toAddress(
  "ComputeBudget111111111111111111111111111111",
);

function assertChainReady(): void {
  if (!rpcConfigured) fail("CHAIN_RPC_UNAVAILABLE", "RPC não configurado.");
  if (!programDeployed) {
    fail(
      "CHAIN_PROGRAM_NOT_DEPLOYED",
      "O programa on-chain ainda não foi implantado. Tente novamente em breve.",
      { retryable: true },
    );
  }
}

/** Hand-built ComputeBudget SetComputeUnitLimit ix (no @solana-program/compute-budget dep). */
function setComputeUnitLimitIx(units: number): Instruction {
  const data = new Uint8Array(5);
  data[0] = 0x02; // SetComputeUnitLimit discriminator
  new DataView(data.buffer).setUint32(1, units, true);
  return { programAddress: COMPUTE_BUDGET_PROGRAM, accounts: [], data };
}

export interface SignChunkPlan {
  editionAddress: string;
  /** The wallet this chunk must be signed by (an edition's caller-signer slot
   *  — a certifier can be registered under different wallets across editions). */
  signerWallet: string;
  /** Certs in THIS tx, in ix order — used to sync + render per-chunk progress. */
  certificateAddresses: string[];
  /** Unsigned wire bytes — sign via wallet-standard, then base64 for /api/certificator/submit. */
  wireBytes: Uint8Array;
  lastValidBlockHeight: bigint;
}

export interface SignBatchGroup {
  editionAddress: string;
  /** The caller's registered signer wallet for THIS edition — never reuse one
   *  wallet across groups (see buildSignBatchTxs). */
  signerWallet: string;
  certificateAddresses: string[];
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size)
    out.push(items.slice(i, i + size));
  return out;
}

interface Blockhash {
  blockhash: Parameters<
    typeof setTransactionMessageLifetimeUsingBlockhash
  >[0]["blockhash"];
  lastValidBlockHeight: bigint;
}

function compileSignChunk(
  feePayer: Address,
  signerWallet: string,
  edition: Address,
  editionAddress: string,
  certs: string[],
  blockhash: Blockhash,
): SignChunkPlan {
  const cuLimit = certs.length * CU_BUDGETS.signCertificate + 10_000;
  const instructions: Instruction[] = [
    setComputeUnitLimitIx(cuLimit),
    ...certs.map((c) =>
      getSignCertificateInstruction({
        signer: createNoopSigner(feePayer),
        edition,
        certificate: toAddress(c),
      }),
    ),
  ];
  const message = appendTransactionMessageInstructions(
    instructions,
    setTransactionMessageLifetimeUsingBlockhash(
      blockhash,
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
    editionAddress,
    signerWallet,
    certificateAddresses: certs,
    wireBytes,
    lastValidBlockHeight: blockhash.lastValidBlockHeight,
  };
}

export interface SignChunkTarget {
  editionAddress: string;
  signerWallet: string;
  certificateAddresses: string[];
}

/**
 * Pure 20-per-edition chunk plan (the byte-size guard is applied later, at
 * compile time). Exported for unit testing the chunking math.
 */
export function chunkCertificates(
  groups: SignBatchGroup[],
  max: number = MAX_SIGNS_PER_TX,
): SignChunkTarget[] {
  const out: SignChunkTarget[] = [];
  for (const group of groups) {
    for (const certs of chunk(group.certificateAddresses, max)) {
      if (certs.length > 0) {
        out.push({
          editionAddress: group.editionAddress,
          signerWallet: group.signerWallet,
          certificateAddresses: certs,
        });
      }
    }
  }
  return out;
}

function compileWithGuard(
  feePayer: Address,
  signerWallet: string,
  edition: Address,
  editionAddress: string,
  certs: string[],
  blockhash: Blockhash,
  maxBytes: number,
): SignChunkPlan[] {
  const plan = compileSignChunk(
    feePayer,
    signerWallet,
    edition,
    editionAddress,
    certs,
    blockhash,
  );
  if (plan.wireBytes.length <= maxBytes) return [plan];
  if (certs.length <= 1) {
    fail("VALIDATION", "Transação de assinatura excede 1232 bytes.");
  }
  const mid = Math.ceil(certs.length / 2);
  return [
    ...compileWithGuard(
      feePayer,
      signerWallet,
      edition,
      editionAddress,
      certs.slice(0, mid),
      blockhash,
      maxBytes,
    ),
    ...compileWithGuard(
      feePayer,
      signerWallet,
      edition,
      editionAddress,
      certs.slice(mid),
      blockhash,
      maxBytes,
    ),
  ];
}

/**
 * Builds the unsigned sign-batch transactions: one `sign_certificate` ix per
 * cert, chunked 20/tx per edition (edition read-only → no write contention),
 * each with a `setComputeUnitLimit` from CU_BUDGETS, all off ONE blockhash so a
 * single wallet-standard round trip signs them. Each tx is asserted < 1232 bytes
 * (recursively split if a chunk somehow exceeds it — never at 20 in practice).
 * Each group carries ITS OWN signer wallet (a certifier can be registered
 * under different wallets across editions — see useMassSign, which signs each
 * distinct wallet's chunks in a separate variadic call).
 */
export async function buildSignBatchTxs(input: {
  groups: SignBatchGroup[];
  /** Test-only override for the 1232 B wire-size ceiling. */
  maxTxBytes?: number;
}): Promise<SignChunkPlan[]> {
  assertChainReady();
  const { value: blockhash } = await getRpc().getLatestBlockhash().send();
  const maxBytes = input.maxTxBytes ?? MAX_TX_BYTES;

  const plans: SignChunkPlan[] = [];
  for (const target of chunkCertificates(input.groups)) {
    plans.push(
      ...compileWithGuard(
        toAddress(target.signerWallet),
        target.signerWallet,
        toAddress(target.editionAddress),
        target.editionAddress,
        target.certificateAddresses,
        blockhash,
        maxBytes,
      ),
    );
  }
  return plans;
}

export interface PreparedRejectTx {
  editionAddress: string;
  certificateAddress: string;
  wireBytes: Uint8Array;
  lastValidBlockHeight: bigint;
}

/**
 * Builds the unsigned `reject_request` (merged reject+close) transaction. Fee
 * payer + authority = the certifier (an edition signer signs their own reject —
 * program allows any single edition-signer OR admin). Refund is address-targeted
 * to `studentRefund` (== cert.student); no student signature required.
 */
export async function buildRejectTx(input: {
  authority: string;
  edition: string;
  certificate: string;
  studentRefund: string;
}): Promise<PreparedRejectTx> {
  assertChainReady();
  const { value: blockhash } = await getRpc().getLatestBlockhash().send();
  const [config] = await findConfigPda();
  const authority = toAddress(input.authority);

  const instruction = getRejectRequestInstruction({
    config,
    edition: toAddress(input.edition),
    certificate: toAddress(input.certificate),
    studentRefund: toAddress(input.studentRefund),
    authoritySigners: [createNoopSigner(authority)],
  });

  const message = appendTransactionMessageInstructions(
    [instruction],
    setTransactionMessageLifetimeUsingBlockhash(
      blockhash,
      setTransactionMessageFeePayer(
        authority,
        createTransactionMessage({ version: 0 }),
      ),
    ),
  );
  const wireBytes = new Uint8Array(
    getTransactionEncoder().encode(compileTransaction(message)),
  );
  return {
    editionAddress: input.edition,
    certificateAddress: input.certificate,
    wireBytes,
    lastValidBlockHeight: blockhash.lastValidBlockHeight,
  };
}
