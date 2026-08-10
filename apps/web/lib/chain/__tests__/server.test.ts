import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  appendTransactionMessageInstruction,
  blockhash,
  compileTransaction,
  createTransactionMessage,
  generateKeyPairSigner,
  getBase64Decoder,
  getTransactionEncoder,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  signTransactionMessageWithSigners,
  type TransactionSigner,
} from "@solana/kit";
import { getRequestCertificateInstruction } from "@certify/client";

// Mocked BEFORE importing the module under test, per vitest's hoisting
// contract. getRpc/getRpcSubscriptions throw if ever called — the
// idempotency guard's whole point is that an already-processed signature
// never reaches send+confirm, so this doubles as proof that it doesn't.
vi.mock("@/lib/chain", () => ({
  getRpc: vi.fn(() => {
    throw new Error(
      "getRpc should not be called for an already-processed signature",
    );
  }),
  getRpcSubscriptions: vi.fn(() => {
    throw new Error(
      "getRpcSubscriptions should not be called for an already-processed signature",
    );
  }),
  programDeployed: true,
}));

vi.mock("@/lib/db/mutations", () => ({
  hasProcessedSignature: vi.fn(),
  logEvent: vi.fn(),
  syncCertificateMirrorFromChain: vi.fn(),
  syncEditionMirrorFromChain: vi.fn(),
}));

const { hasProcessedSignature, logEvent } = await import("@/lib/db/mutations");
const { submitAndSyncTransaction } = await import("../server");

/** A real, fully-signed request_certificate transaction — local keys only, no network. */
async function buildSignedTestTransaction() {
  const student: TransactionSigner = await generateKeyPairSigner();
  const edition = (await generateKeyPairSigner()).address;
  const certificate = (await generateKeyPairSigner()).address;

  const instruction = getRequestCertificateInstruction({
    student,
    edition,
    certificate,
    nameCommitment: new Uint8Array(32),
  });

  // Any well-formed base58 32-byte value compiles/encodes fine — this test
  // never reaches a real RPC, so it doesn't need to be a live blockhash.
  const fakeBlockhash = blockhash((await generateKeyPairSigner()).address);
  const lastValidBlockHeight = 123_456n;

  const message = appendTransactionMessageInstruction(
    instruction,
    setTransactionMessageLifetimeUsingBlockhash(
      { blockhash: fakeBlockhash, lastValidBlockHeight },
      setTransactionMessageFeePayerSigner(
        student,
        createTransactionMessage({ version: 0 }),
      ),
    ),
  );

  // signTransactionMessageWithSigners compiles AND signs in one step — its
  // return value is already a Transaction, not a TransactionMessage, so it
  // goes straight to the encoder (matches lib/chain/server.ts's own
  // signAndEncode, which this test intentionally mirrors).
  const signed = await signTransactionMessageWithSigners(message);
  const wireBytes = getTransactionEncoder().encode(signed);

  return {
    wireBytesBase64: getBase64Decoder().decode(wireBytes),
    lastValidBlockHeight,
  };
}

describe("submitAndSyncTransaction idempotency guard", () => {
  beforeEach(() => {
    // Mocks persist across `it()` blocks within a file by default — reset
    // call history so each test's assertions reflect only its own calls.
    vi.clearAllMocks();
  });

  it("short-circuits before send+confirm when the signature was already processed", async () => {
    vi.mocked(hasProcessedSignature).mockResolvedValue(true);
    const { wireBytesBase64, lastValidBlockHeight } =
      await buildSignedTestTransaction();

    const result = await submitAndSyncTransaction({
      wireBytesBase64,
      lastValidBlockHeight,
      syncTargets: [],
      eventType: "certificate_requested",
    });

    expect(result.alreadyProcessed).toBe(true);
    expect(typeof result.signature).toBe("string");
    // No event should be logged a second time for a signature already on record.
    expect(logEvent).not.toHaveBeenCalled();
  });

  it("computes the same signature for the same signed bytes (idempotency key is stable)", async () => {
    vi.mocked(hasProcessedSignature).mockResolvedValue(true);
    const tx = await buildSignedTestTransaction();

    const first = await submitAndSyncTransaction({
      ...tx,
      syncTargets: [],
      eventType: "certificate_requested",
    });
    const second = await submitAndSyncTransaction({
      ...tx,
      syncTargets: [],
      eventType: "certificate_requested",
    });

    expect(first.signature).toBe(second.signature);
    expect(first.alreadyProcessed).toBe(true);
    expect(second.alreadyProcessed).toBe(true);
  });

  it("rejects a transaction with a missing signature before even checking idempotency", async () => {
    // Build the message but never sign it — isSendableTransaction() must
    // catch this before the function does anything else (no RPC, no DB read).
    const student: TransactionSigner = await generateKeyPairSigner();
    const edition = (await generateKeyPairSigner()).address;
    const certificate = (await generateKeyPairSigner()).address;
    const instruction = getRequestCertificateInstruction({
      student,
      edition,
      certificate,
      nameCommitment: new Uint8Array(32),
    });
    const fakeBlockhash = blockhash((await generateKeyPairSigner()).address);
    const message = appendTransactionMessageInstruction(
      instruction,
      setTransactionMessageLifetimeUsingBlockhash(
        { blockhash: fakeBlockhash, lastValidBlockHeight: 1n },
        setTransactionMessageFeePayerSigner(
          student,
          createTransactionMessage({ version: 0 }),
        ),
      ),
    );
    const unsignedWireBytes = getTransactionEncoder().encode(
      compileTransaction(message),
    );

    await expect(
      submitAndSyncTransaction({
        wireBytesBase64: getBase64Decoder().decode(unsignedWireBytes),
        lastValidBlockHeight: 1n,
        syncTargets: [],
        eventType: "certificate_requested",
      }),
    ).rejects.toMatchObject({ code: "VALIDATION" });

    expect(hasProcessedSignature).not.toHaveBeenCalled();
  });
});
