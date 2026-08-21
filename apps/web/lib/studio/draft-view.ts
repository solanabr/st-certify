import type {
  EditionDraftMeta,
  EditionDraftRow,
  SignerInviteRow,
  SignerInviteStatus,
} from "@/lib/db/types";

/**
 * The wire shapes every `/api/studio/drafts/**` route returns. Isomorphic (no
 * server-only imports) so the wizard and the management page share the types
 * with the routes that produce them.
 */
export interface SeatView {
  id: string;
  name: string;
  role: string;
  email: string;
  status: SignerInviteStatus;
  wallet: string | null;
}

export interface DraftView {
  id: string;
  meta: EditionDraftMeta;
  /** The designer's output; null means this draft is on the default-template path. */
  layout: Record<string, unknown> | null;
  templateSha: string | null;
  /** Set once the edition exists on-chain; from then on the draft is read-only. */
  chainAddress: string | null;
  seats: SeatView[];
}

/**
 * Field-by-field, never a spread: `signer_invites.token` is the bearer
 * capability behind each magic link, and a spread here would ship every
 * signer's token to the browser the moment the wizard loads a draft.
 */
export function toSeatView(row: SignerInviteRow): SeatView {
  return {
    id: row.id,
    name: row.name,
    role: row.role,
    email: row.email,
    status: row.status,
    wallet: row.wallet,
  };
}

export function toDraftView(
  draft: EditionDraftRow,
  seats: SignerInviteRow[],
): DraftView {
  return {
    id: draft.id,
    meta: draft.meta,
    layout: draft.layout,
    templateSha: draft.template_sha,
    chainAddress: draft.chain_address,
    seats: seats.map(toSeatView),
  };
}

/** Every seat bound to a wallet — the precondition for writing the edition on-chain. */
export function allSeatsAccepted(seats: SeatView[]): boolean {
  return (
    seats.length > 0 &&
    seats.every((seat) => seat.status === "accepted" && seat.wallet !== null)
  );
}
