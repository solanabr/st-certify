import "server-only";

import { readFileSync } from "node:fs";
import {
  address as toAddress,
  airdropFactory,
  appendTransactionMessageInstruction,
  createKeyPairSignerFromBytes,
  createTransactionMessage,
  getBase64Decoder,
  getBase64Encoder,
  getSignatureFromTransaction,
  getTransactionDecoder,
  getTransactionEncoder,
  isSendableTransaction,
  lamports,
  sendAndConfirmTransactionFactory,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  signTransactionMessageWithSigners,
  type Address,
  type KeyPairSigner,
  type ReadonlyUint8Array,
} from "@solana/kit";
import {
  EditionStatus,
  fetchCertificate,
  fetchConfig,
  fetchEdition,
  findConfigPda,
  findEditionPda,
  getCreateEditionInstruction,
  getSetEditionStatusInstruction,
  type EditionSignerInput,
} from "@certify/client";
import { fail } from "@/lib/errors";
import { failFromChainError } from "@/lib/chain/errors";
import { getRpc, getRpcSubscriptions, programDeployed } from "@/lib/chain";
import {
  hasProcessedSignature,
  logEvent,
  syncCertificateMirrorFromChain,
  syncEditionMirrorFromChain,
} from "@/lib/db/mutations";

/**
 * Reads a keypair from an env value that is either a JSON byte array
 * (`[12,34,...]`, 64 bytes — a solana-keygen secret key) inlined directly,
 * or a path to a file containing that same JSON array.
 */
function loadKeypairBytes(envVal: string): Uint8Array {
  const raw = envVal.trim().startsWith("[")
    ? envVal
    : readFileSync(envVal, "utf8");

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

let notarySigner: KeyPairSigner | null = null;
let operatorSigner: KeyPairSigner | null = null;

/** The signer that co-signs certificates on behalf of edition signatories. */
export async function getNotarySigner(): Promise<KeyPairSigner> {
  const envVal = process.env.NOTARY_SECRET_KEY;
  if (!envVal) {
    fail("INTERNAL", "NOTARY_SECRET_KEY não configurado.");
  }
  notarySigner ??= await createKeyPairSignerFromBytes(loadKeypairBytes(envVal));
  return notarySigner;
}

/** The signer that pays for and submits server-initiated transactions (e.g. minting). */
export async function getOperatorSigner(): Promise<KeyPairSigner> {
  const envVal = process.env.OPERATOR_SECRET_KEY;
  if (!envVal) {
    fail("INTERNAL", "OPERATOR_SECRET_KEY não configurado.");
  }
  operatorSigner ??= await createKeyPairSignerFromBytes(
    loadKeypairBytes(envVal),
  );
  return operatorSigner;
}

// ---------------------------------------------------------------------------
// tx/submit internals — the single choke point for send + confirm + mirror
// sync + idempotent event logging (plan §"Sync"), shared by the client-facing
// POST /api/tx/submit route AND server-authored txs (create_edition, etc.)
// ---------------------------------------------------------------------------

export interface SyncTarget {
  kind: "edition" | "certificate";
  /** Plain string — callers (route handlers) are fenced off from `@solana/kit`'s Address branding. */
  address: string;
}

export interface SubmitAndSyncInput {
  /** Base64-encoded, fully-signed wire transaction. */
  wireBytesBase64: string;
  lastValidBlockHeight: bigint;
  /** Program accounts to refetch + mirror after confirmation. */
  syncTargets: SyncTarget[];
  eventType: string;
  actor?: string;
  eventPayload?: Record<string, unknown>;
  /** Which certificate tx-sig column to stamp with THIS tx's own (just-computed) signature. */
  certificateTxField?: "request_tx" | "claim_tx" | "revoke_tx";
  /** Set on the edition row's tx_sig alongside its chain-derived columns. */
  editionTxSig?: string;
}

export interface SubmitAndSyncResult {
  signature: string;
  alreadyProcessed: boolean;
}

export async function submitAndSyncTransaction(
  input: SubmitAndSyncInput,
): Promise<SubmitAndSyncResult> {
  const bytes = getBase64Encoder().encode(input.wireBytesBase64);
  const transaction = getTransactionDecoder().decode(bytes);

  if (!isSendableTransaction(transaction)) {
    fail("VALIDATION", "Transação incompleta: faltam assinaturas.");
  }

  const signature = getSignatureFromTransaction(transaction);

  if (await hasProcessedSignature(signature)) {
    return { signature, alreadyProcessed: true };
  }

  const rpc = getRpc();
  const rpcSubscriptions = getRpcSubscriptions();
  const sendAndConfirm = sendAndConfirmTransactionFactory({
    rpc,
    rpcSubscriptions,
  });

  const transactionWithLifetime = {
    ...transaction,
    lifetimeConstraint: { lastValidBlockHeight: input.lastValidBlockHeight },
  };

  try {
    await sendAndConfirm(transactionWithLifetime, { commitment: "confirmed" });
  } catch (err) {
    failFromChainError(err);
  }

  const certificateTxPatch = input.certificateTxField
    ? { [input.certificateTxField]: signature }
    : undefined;

  for (const target of input.syncTargets) {
    if (target.kind === "edition") {
      const decoded = await fetchEdition(rpc, toAddress(target.address));
      if (decoded) {
        await syncEditionMirrorFromChain(
          target.address,
          decoded,
          input.editionTxSig ?? signature,
        );
      }
    } else {
      const decoded = await fetchCertificate(rpc, toAddress(target.address));
      if (decoded) {
        await syncCertificateMirrorFromChain(
          target.address,
          decoded,
          certificateTxPatch,
        );
      }
    }
  }

  const certTarget = input.syncTargets.find((t) => t.kind === "certificate");
  const editionTarget = input.syncTargets.find((t) => t.kind === "edition");

  await logEvent({
    type: input.eventType,
    actor: input.actor,
    certAddress: certTarget?.address,
    editionAddress: editionTarget?.address,
    txSig: signature,
    payload: input.eventPayload,
  });

  return { signature, alreadyProcessed: false };
}

// ---------------------------------------------------------------------------
// Server-authored admin transactions (OPERATOR fee-payer + sole admin signer
// — T_CREATE = 1 admin class per the plan's threshold policy)
// ---------------------------------------------------------------------------

async function signAndEncode(
  instruction: Parameters<typeof appendTransactionMessageInstruction>[0],
  feePayer: KeyPairSigner,
): Promise<{ wireBytesBase64: string; lastValidBlockHeight: bigint }> {
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

function assertProgramDeployed(): void {
  if (!programDeployed) {
    fail(
      "CHAIN_PROGRAM_NOT_DEPLOYED",
      "O programa on-chain ainda não foi implantado. Tente novamente em breve.",
      { retryable: true },
    );
  }
}

export interface CreateEditionOnChainSigner {
  wallet: string;
  name: string;
  role: string;
}

export interface CreateEditionOnChainInput {
  name: string;
  specHash: ReadonlyUint8Array;
  maxSupply: bigint;
  signers: CreateEditionOnChainSigner[];
  actor?: string;
}

export interface CreateEditionOnChainResult {
  address: Address;
  id: bigint;
  signature: string;
}

/**
 * Builds, OPERATOR-signs, and submits `create_edition` (creation-class op —
 * a single admin signature). The edition doesn't exist in the DB mirror yet
 * at this point (`syncTargets: []`) — the caller does the full
 * `insertEditionMirror` itself with the wizard's off-chain fields (slug,
 * description, layout) that have no on-chain counterpart to sync from.
 */
export async function createEditionOnChain(
  input: CreateEditionOnChainInput,
): Promise<CreateEditionOnChainResult> {
  assertProgramDeployed();
  const operator = await getOperatorSigner();
  const rpc = getRpc();

  const [configPda] = await findConfigPda();
  const config = await fetchConfig(rpc, configPda);
  if (!config) {
    fail(
      "CHAIN_PROGRAM_NOT_DEPLOYED",
      "Config on-chain ainda não inicializada.",
      { retryable: true },
    );
  }

  const nextId = config.editionsCreated;
  const [editionPda] = await findEditionPda(nextId);

  const instruction = getCreateEditionInstruction({
    payer: operator,
    config: configPda,
    edition: editionPda,
    name: input.name,
    specHash: input.specHash,
    maxSupply: input.maxSupply,
    signers: input.signers.map((s): EditionSignerInput => ({
      pubkey: toAddress(s.wallet),
      name: s.name,
      role: s.role,
    })),
    adminSigners: [operator],
  });

  const prepared = await signAndEncode(instruction, operator);

  const { signature } = await submitAndSyncTransaction({
    ...prepared,
    syncTargets: [],
    eventType: "edition_created",
    actor: input.actor,
    eventPayload: { editionAddress: editionPda, name: input.name },
  });

  return { address: editionPda, id: nextId, signature };
}

export interface SetEditionStatusOnChainInput {
  editionAddress: string;
  status: "Paused" | "Open" | "Closed";
  actor?: string;
}

export async function setEditionStatusOnChain(
  input: SetEditionStatusOnChainInput,
): Promise<SubmitAndSyncResult> {
  assertProgramDeployed();
  const operator = await getOperatorSigner();
  const [configPda] = await findConfigPda();

  const instruction = getSetEditionStatusInstruction({
    config: configPda,
    edition: toAddress(input.editionAddress),
    status: EditionStatus[input.status],
    adminSigners: [operator],
  });

  const prepared = await signAndEncode(instruction, operator);

  return submitAndSyncTransaction({
    ...prepared,
    syncTargets: [{ kind: "edition", address: input.editionAddress }],
    eventType: "edition_status_changed",
    actor: input.actor,
    eventPayload: { status: input.status },
  });
}

// ---------------------------------------------------------------------------
// Devnet airdrop (faucet has been flaky — 3x backoff per the brief)
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function requestDevnetAirdrop(
  recipient: string,
): Promise<{ signature: string }> {
  const rpc = getRpc();
  const rpcSubscriptions = getRpcSubscriptions();
  const airdrop = airdropFactory({ rpc, rpcSubscriptions });
  const recipientAddress = toAddress(recipient);

  const attempts = 3;
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const signature = await airdrop({
        commitment: "confirmed",
        recipientAddress,
        lamports: lamports(1_000_000_000n),
      });
      return { signature };
    } catch (err) {
      lastError = err;
      if (attempt < attempts - 1) {
        await sleep(1000 * 2 ** attempt);
      }
    }
  }

  fail(
    "RATE_LIMITED",
    "O faucet da devnet está sobrecarregado. Tente novamente em instantes ou use faucet.solana.com.",
    {
      detail:
        lastError instanceof Error ? lastError.message : String(lastError),
      retryable: true,
      action: "retry",
    },
  );
}
