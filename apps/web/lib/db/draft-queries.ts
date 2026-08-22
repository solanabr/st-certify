import "server-only";

// Overhaul drafts + signer invites: reads. 0005 enables RLS on both tables
// with zero anon policies (same posture as attendance), so these reuse the
// singleton service client from ./mutations rather than an anon client, and
// degrade to null/[] when Supabase isn't configured — for getInviteByToken
// that null is what renders `/invite/[token]`'s dead-link state instead of a
// generic outage page, mirroring getEventByToken in attendance-queries.ts.
//
// Neither table is safe to expose wholesale: rows carry signer emails and the
// magic-link tokens themselves. Callers project what a surface may show.

import { fail } from "@/lib/errors";
import { isUiMock } from "@/lib/mock/flag";
import {
  mockDraft,
  mockDrafts,
  mockInviteByToken,
  mockInvites,
  mockInvitesForDrafts,
} from "@/lib/mock/fixtures";
import { dbConfigured, getServiceClient } from "./mutations";
import type { EditionDraftRow, SignerInviteRow } from "./types";

/**
 * Spec §6.1: a magic link stops working 14 days after it was sent.
 *
 * Nothing ever writes `status = 'expired'` — a seat is only ever `invited` or
 * `accepted` in the table — so the deadline is derived here, at the read
 * boundary every invite surface already goes through, and enforced a second
 * time inside `acceptInvite`'s UPDATE. Deriving beats a sweeper job: a cron
 * that silently stops running would quietly reopen every aged-out link.
 */
export const INVITE_EXPIRY_DAYS = 14;
const INVITE_EXPIRY_MS = INVITE_EXPIRY_DAYS * 24 * 60 * 60 * 1000;

/** The oldest `invited_at` still acceptable — `acceptInvite` filters the UPDATE on it. */
export function inviteExpiryCutoff(now: number = Date.now()): string {
  return new Date(now - INVITE_EXPIRY_MS).toISOString();
}

/** `invited` past the deadline reads as `expired`; every other status passes through. */
function withDerivedExpiry<T extends SignerInviteRow>(row: T): T {
  if (row.status !== "invited") return row;
  const invitedAt = Date.parse(row.invited_at);
  // An unreadable timestamp is a data bug, not an expiry: leave the seat live
  // rather than stranding a signer whose row was written oddly.
  if (Number.isNaN(invitedAt) || Date.now() - invitedAt <= INVITE_EXPIRY_MS) {
    return row;
  }
  return { ...row, status: "expired" };
}

/**
 * `chain_address` doubles as the create lock: a draft is stamped with this
 * sentinel for the duration of the on-chain write (see `claimDraftForCreate`),
 * because the real address only exists once `create_edition` confirms and a
 * retry in between would mint a second edition. The draft id rides along
 * because the column is UNIQUE — one shared constant would make every
 * in-flight create block every other draft's.
 */
const CREATE_CLAIM_PREFIX = "pending:";

/** The sentinel a draft holds while its create is in flight. */
export function createClaimFor(draftId: string): string {
  return `${CREATE_CLAIM_PREFIX}${draftId}`;
}

/** True while a create is in flight. Never a real address — base58 has no `:`. */
export function isCreateClaim(chainAddress: string | null): boolean {
  return chainAddress !== null && chainAddress.startsWith(CREATE_CLAIM_PREFIX);
}

/**
 * The claim is bookkeeping, not an address, and it must never reach a caller:
 * `chain_address` is what every surface reads as "this edition exists now"
 * (the wizard freezes, the invite page closes its seats, the studio links to
 * an explorer). Stripping it here is what keeps that sentinel out of all of
 * them — a draft mid-create simply reads as not created yet.
 */
function withoutCreateClaim<T extends EditionDraftRow>(row: T): T {
  return isCreateClaim(row.chain_address)
    ? { ...row, chain_address: null }
    : row;
}

/** One draft by id — the wizard's autosave target and the management page's source. */
export async function getDraft(id: string): Promise<EditionDraftRow | null> {
  if (isUiMock()) return mockDraft(id);
  if (!dbConfigured) return null;
  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("edition_drafts")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) {
    fail("INTERNAL", "Falha ao buscar rascunho.", {
      detail: error.message,
      retryable: true,
    });
  }
  return data ? withoutCreateClaim(data as EditionDraftRow) : null;
}

/**
 * Every draft, most recently touched first. Includes drafts already written
 * on-chain (`chain_address` set) — the studio dashboard decides whether to
 * show those as editions instead.
 */
export async function listDrafts(): Promise<EditionDraftRow[]> {
  if (isUiMock()) return mockDrafts();
  if (!dbConfigured) return [];
  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("edition_drafts")
    .select("*")
    .order("updated_at", { ascending: false });
  if (error) {
    fail("INTERNAL", "Falha ao buscar rascunhos.", {
      detail: error.message,
      retryable: true,
    });
  }
  return ((data ?? []) as EditionDraftRow[]).map(withoutCreateClaim);
}

interface InviteJoinRow extends SignerInviteRow {
  edition_drafts: EditionDraftRow | EditionDraftRow[] | null;
}

export type SignerInviteWithDraft = SignerInviteRow & {
  draft: EditionDraftRow;
};

/**
 * Resolves a magic link to its seat plus the edition context the invite page
 * shows. Returns the row whatever its status — the caller decides whether an
 * already-accepted or aged-out invite gets the dead-state, since only it knows
 * which of those to say. A seat past `INVITE_EXPIRY_DAYS` comes back as
 * `expired` even though the stored status still says `invited`.
 */
export async function getInviteByToken(
  token: string,
): Promise<SignerInviteWithDraft | null> {
  if (isUiMock()) return mockInviteByToken(token);
  if (!dbConfigured) return null;
  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("signer_invites")
    .select("*, edition_drafts(*)")
    .eq("token", token)
    .maybeSingle();
  if (error) {
    fail("INTERNAL", "Falha ao buscar convite.", {
      detail: error.message,
      retryable: true,
    });
  }
  if (!data) return null;

  const { edition_drafts, ...invite } = data as unknown as InviteJoinRow;
  // Supabase returns a to-one FK embed as an object, but the generic typing
  // allows an array — normalize either way (same as attendance-queries.ts).
  const draft = Array.isArray(edition_drafts)
    ? edition_drafts[0]
    : edition_drafts;
  if (!draft) return null;

  return withDerivedExpiry({ ...invite, draft: withoutCreateClaim(draft) });
}

/**
 * Seats for several drafts at once — the studio list would otherwise issue one
 * query per draft. Callers group by `draft_id` themselves.
 */
export async function listInvitesForDrafts(
  draftIds: string[],
): Promise<SignerInviteRow[]> {
  if (isUiMock()) return mockInvitesForDrafts(draftIds);
  if (!dbConfigured || draftIds.length === 0) return [];
  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("signer_invites")
    .select("*")
    .in("draft_id", draftIds)
    .order("invited_at", { ascending: true });
  if (error) {
    fail("INTERNAL", "Falha ao buscar signatários.", {
      detail: error.message,
      retryable: true,
    });
  }
  return (data ?? []) as SignerInviteRow[];
}

/** A draft's seats in the order they were created — the seat list and the "all accepted?" gate. */
export async function listInvites(draftId: string): Promise<SignerInviteRow[]> {
  if (isUiMock()) return mockInvites(draftId);
  if (!dbConfigured) return [];
  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("signer_invites")
    .select("*")
    .eq("draft_id", draftId)
    .order("invited_at", { ascending: true });
  if (error) {
    fail("INTERNAL", "Falha ao buscar signatários.", {
      detail: error.message,
      retryable: true,
    });
  }
  return (data ?? []) as SignerInviteRow[];
}
