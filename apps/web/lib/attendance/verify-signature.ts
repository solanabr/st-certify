import { createPublicKey, verify as edVerify } from "node:crypto";

const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const INDEX = new Map(Array.from(ALPHABET, (c, i) => [c, BigInt(i)]));
/** SPKI DER prefix for a raw ed25519 public key (RFC 8410). */
const DER_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

export function decodeBase58(value: string): Uint8Array {
  let n = 0n;
  for (const c of value) {
    const i = INDEX.get(c);
    if (i === undefined) throw new Error(`caractere base58 inválido: ${c}`);
    n = n * 58n + i;
  }
  const bytes: number[] = [];
  while (n > 0n) {
    bytes.unshift(Number(n % 256n));
    n /= 256n;
  }
  for (const c of value) {
    if (c === "1") bytes.unshift(0);
    else break;
  }
  return new Uint8Array(bytes);
}

/** Verifies an ed25519 signature against a base58 Solana address. Never throws. */
export function verifyWalletSignature(
  walletBase58: string,
  message: Uint8Array,
  signature: Uint8Array,
): boolean {
  try {
    const raw = decodeBase58(walletBase58);
    if (raw.length !== 32 || signature.length !== 64) return false;
    const key = createPublicKey({
      key: Buffer.concat([DER_PREFIX, Buffer.from(raw)]),
      format: "der",
      type: "spki",
    });
    return edVerify(null, Buffer.from(message), key, Buffer.from(signature));
  } catch {
    return false;
  }
}
