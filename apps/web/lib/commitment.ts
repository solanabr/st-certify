import { createHash, randomBytes } from "node:crypto";

/** A fresh random 32-byte salt for a new certificate request. */
export function generateNameSalt(): Buffer {
  return randomBytes(32);
}

/**
 * `name_commitment = sha256(salt ‖ NFC(name))` — matches the on-chain spec
 * exactly (plan §"Certificate"). `name` must already be the sanitized,
 * NFC-normalized form `studentNameSchema` (lib/schemas.ts) produces — this
 * function does not re-normalize, so the caller and the commitment agree by
 * construction rather than by coincidence.
 */
export function computeNameCommitment(
  salt: Uint8Array,
  nfcName: string,
): Buffer {
  return createHash("sha256")
    .update(salt)
    .update(Buffer.from(nfcName, "utf8"))
    .digest();
}
