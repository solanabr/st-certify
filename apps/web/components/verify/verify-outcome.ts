// The verify tool's terminal-state decision, kept out of the .tsx so it is
// unit-testable (vitest here runs in a node env with no JSX transform).

export type VerifyStatus = "idle" | "busy" | "notfound" | "error";

/**
 * What one resolve attempt concluded. `failed` is a SYSTEM failure (RPC down,
 * unreadable file) and is never a verdict about the certificate — only `miss`
 * is, and it can only come from a clean null resolution.
 */
export type ResolveOutcome =
  | { kind: "hit"; certId: string; reencode?: boolean }
  | { kind: "miss" }
  | { kind: "failed" };

/**
 * Keeps "we couldn't check" apart from "we checked, nothing there". Collapsing
 * the two is what would let an RPC outage tell the public that a real
 * certificate does not exist.
 */
export function statusForOutcome(outcome: ResolveOutcome): VerifyStatus {
  if (outcome.kind === "hit") return "busy"; // navigating away — keep the spinner
  return outcome.kind === "miss" ? "notfound" : "error";
}

/** Runs a resolve attempt, mapping any throw to a system failure. */
export async function attemptResolve(
  resolve: () => Promise<ResolveOutcome>,
): Promise<ResolveOutcome> {
  try {
    return await resolve();
  } catch {
    return { kind: "failed" };
  }
}
