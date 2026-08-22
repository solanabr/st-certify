// The invite page's stage decision, kept out of the .tsx so it is
// unit-testable (vitest runs in a node env), same split as
// components/me/ceremony-machine.ts.

import type { InviteView } from "@/lib/invite/view";

export type InviteStage =
  /** No such token — a mistyped or truncated link. */
  | "notFound"
  /** The seat aged out; only the issuer can reopen it. */
  | "expired"
  /** The edition went on-chain before this seat was confirmed. */
  | "closed"
  /** The seat is bound to a wallet — the success state, and the repeat-visit state. */
  | "accepted"
  /** A live seat, but we don't know who is holding the link yet. */
  | "login"
  /** Logged in with at least one linked wallet: pick which one signs. */
  | "chooseWallet"
  /** Logged in with no Solana wallet linked — one has to exist before it can be bound. */
  | "createWallet";

export interface InviteStageState {
  /** null when the token resolved to nothing (unknown link, or the mirror is unreachable). */
  invite: InviteView | null;
  authenticated: boolean;
  /** The Solana wallets Privy has linked to the session. */
  wallets: readonly string[];
}

/**
 * Dead ends outrank session state: a visitor whose link is spent or expired
 * sees that immediately, rather than being asked to log in and only then told
 * the trip was pointless. `accepted` leads because it is the one terminal state
 * that is good news, and re-opening the link after accepting must not look like
 * an error.
 */
export function inviteStage(state: InviteStageState): InviteStage {
  const { invite } = state;
  if (!invite) return "notFound";
  if (invite.status === "accepted") return "accepted";
  if (invite.status === "expired") return "expired";
  if (invite.frozen) return "closed";
  if (!state.authenticated) return "login";
  return state.wallets.length > 0 ? "chooseWallet" : "createWallet";
}

/** The stages that end the journey here — the ones that must show issuer contact instead of a next step. */
export function isDeadEnd(stage: InviteStage): boolean {
  return stage === "notFound" || stage === "expired" || stage === "closed";
}
