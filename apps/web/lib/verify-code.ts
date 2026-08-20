import { createHash } from "node:crypto";

/**
 * Crockford base32 — the standard alphabet with I, L, O and U removed, so a
 * code read off a printed page can't be mistyped as its look-alike (1/I/L,
 * 0/O) and can't spell anything unfortunate (U).
 */
const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/** 8 five-bit groups = 40 bits = the digest's first 5 bytes, no padding. */
const CODE_LENGTH = 8;

/**
 * The short, human-transcribable handle for a certificate: 8 Crockford base32
 * characters over the first 5 bytes of `sha256(certAddress)`.
 *
 * It exists because the verification ritual has to survive paper — the code is
 * printed in the PDF footer and typed into `/verify` by whoever is checking a
 * diploma, who will not retype a 44-character base58 PDA. It is a lookup key,
 * NOT a secret and NOT a security boundary: the address it fingerprints is
 * public, and 40 bits is a collision guard (unique index in migration 0005),
 * not a guessing guard.
 *
 * The digest is taken over the address's UTF-8 bytes — the base58 string as
 * written — not over its decoded 32 bytes. That choice is load-bearing: the
 * backfill script, the PDF footer and the lookup all derive from the same
 * string, and a code is permanent once a certificate is issued.
 *
 * Server-side only (`node:crypto`). Client surfaces receive the value in API
 * payloads; never import this from a client component.
 */
export function verifyCode(certAddress: string): string {
  const digest = createHash("sha256").update(certAddress, "utf8").digest();

  let code = "";
  for (let group = 0; group < CODE_LENGTH; group++) {
    const bitOffset = group * 5;
    const byte = bitOffset >> 3;
    const shift = bitOffset & 7;
    // Two bytes wide so a group straddling a byte boundary stays contiguous;
    // byte is at most 4, so the digest always has a successor to read.
    const window = (digest[byte] << 8) | digest[byte + 1];
    code += CROCKFORD[(window >> (11 - shift)) & 0b11111];
  }
  return code;
}
