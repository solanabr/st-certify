import { randomBytes } from "node:crypto";

/** ~128 bits of entropy, URL-safe — the whole security of a claim link. */
export function generateClaimToken(): string {
  return randomBytes(16).toString("base64url");
}

export function generateNonce(): string {
  return randomBytes(16).toString("base64url");
}
