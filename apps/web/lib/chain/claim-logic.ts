// Pure claim decision logic — deliberately NOT `server-only` (and free of fs/
// kit/umi) so it's unit-testable and reusable by the server orchestration in
// claim.ts. Only imports node:crypto via lib/commitment.

import { computeNameCommitment } from "@/lib/commitment";

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/**
 * The notary gate predicate: does `sha256(salt ‖ NFC(name))` reproduce the
 * on-chain `name_commitment`? A false result means the stored name/salt don't
 * match what was committed — the claim MUST refuse (never render a wrong name).
 */
export function nameCommitmentMatches(
  saltHex: string,
  name: string,
  onchainCommitment: Uint8Array,
): boolean {
  if (!saltHex) return false;
  const computed = computeNameCommitment(Buffer.from(saltHex, "hex"), name);
  return bytesEqual(new Uint8Array(computed), onchainCommitment);
}

export interface ClaimSubmitPlan {
  /** Submit the student-signed claim tx (false when already Claimed on-chain). */
  needsConfirm: boolean;
  /** Mint + record_asset (false when the asset is already set on-chain). */
  needsMintAndRecord: boolean;
}

/**
 * The idempotent claim-submit step plan from the current on-chain cert state.
 * Each step is skipped when the chain already reflects it — the property that
 * makes claim-submit safely re-POSTable after a blockhash expiry or a partial
 * (minted-but-not-recorded) failure.
 */
export function claimSubmitPlan(cert: {
  status: string;
  hasAsset: boolean;
}): ClaimSubmitPlan {
  return {
    needsConfirm: cert.status !== "Claimed",
    needsMintAndRecord: !cert.hasAsset,
  };
}
