import "server-only";

import { readFileSync } from "node:fs";
import { createKeyPairSignerFromBytes, type KeyPairSigner } from "@solana/kit";
import { fail } from "@/lib/errors";

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
