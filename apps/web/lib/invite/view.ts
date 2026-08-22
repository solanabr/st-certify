import type {
  EditionDraftRow,
  SignerInviteRow,
  SignerInviteStatus,
} from "@/lib/db/types";
import type { IssuerIdentity } from "@/lib/issuer";

const UNNAMED_EDITION = "Edição sem título";

/**
 * What `/api/invite/[token]` shows a visitor holding a magic link, and what
 * `/invite/[token]` renders from. Isomorphic (no server-only imports) so the
 * page, its client card and the routes share one shape.
 *
 * Deliberately narrow. The token is a bearer capability, so whoever holds the
 * link sees this payload without a session — it may therefore carry only what
 * the invited person needs to decide whether to accept: their own seat and the
 * edition's name. No other seat, no draft internals, and never the token or
 * any e-mail address back out.
 */
export interface InviteView {
  seatId: string;
  /** The invited person's name as the issuer typed it — how they recognise the seat is theirs. */
  name: string;
  role: string;
  status: SignerInviteStatus;
  editionName: string;
  /** The wallet bound at acceptance; null while the seat is still open. */
  wallet: string | null;
  invitedAt: string;
  /** True once the edition is written on-chain — the seat set is frozen from then on. */
  frozen: boolean;
  /** Who to contact when the link is dead; null when `ISSUER_NAME` is unset. */
  issuer: IssuerIdentity | null;
}

export function toInviteView(
  seat: SignerInviteRow,
  draft: EditionDraftRow,
  issuer: IssuerIdentity | null,
): InviteView {
  return {
    seatId: seat.id,
    name: seat.name,
    role: seat.role,
    status: seat.status,
    editionName: draft.meta.name ?? UNNAMED_EDITION,
    wallet: seat.wallet,
    invitedAt: seat.invited_at,
    frozen: draft.chain_address !== null,
    issuer,
  };
}
