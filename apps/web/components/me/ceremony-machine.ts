// The claim ceremony's stage decision, kept out of the .tsx so it is
// unit-testable (vitest runs in a node env with no JSX transform), same split
// as components/verify/verify-outcome.ts.

import type { ClaimStage } from "@/hooks/useClaim";

/**
 * The four guided stages of spec §6.5 — consent → assinar → emitindo → done —
 * plus the `lowBalance` gate that stands between consent and signing when the
 * fee payer can't cover the claim transaction.
 */
export type CeremonyStage =
  "consent" | "lowBalance" | "signing" | "issuing" | "done";

/** 0.01 SOL — the floor the wallet strip used before the balance check moved into the flow. */
export const MIN_CLAIM_LAMPORTS = 10_000_000n;

export interface CeremonyState {
  /** The visitor accepted the consent copy in this session. */
  consented: boolean;
  /** Fee-payer balance in lamports; `undefined` while it is unknown (loading, or the RPC read failed). */
  balanceLamports: bigint | undefined;
  /** The claim mutation's own stage. */
  claimStage: ClaimStage;
  /** Mirror truth: the certificate reached Claimed. */
  claimed: boolean;
  /** Mirror truth: the minted asset id has been recorded. */
  assetRecorded: boolean;
}

/**
 * An unknown balance never blocks the claim: an RPC hiccup must not lock a
 * claimable certificate behind a "sem saldo" card the visitor can't clear.
 * The chain still rejects a genuinely underfunded transaction, and that error
 * carries its own airdrop action.
 */
export function hasSufficientBalance(balance: bigint | undefined): boolean {
  return balance === undefined || balance >= MIN_CLAIM_LAMPORTS;
}

/**
 * Chain state outranks local state: once the mirror says Claimed, no amount of
 * un-consenting walks the ceremony backwards. Below that, the in-flight claim
 * outranks the gates for the same reason — the wallet prompt is already open.
 */
export function ceremonyStage(state: CeremonyState): CeremonyStage {
  if (state.claimed) return state.assetRecorded ? "done" : "issuing";
  if (state.claimStage === "confirming") return "issuing";
  if (state.claimStage !== "idle") return "signing";
  if (!state.consented) return "consent";
  if (!hasSufficientBalance(state.balanceLamports)) return "lowBalance";
  return "signing";
}

/** Whether pressing "Assinar e resgatar" should start the claim — the consent gate, in one predicate. */
export function canStartClaim(state: CeremonyState): boolean {
  return ceremonyStage(state) === "signing" && state.claimStage === "idle";
}
