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
import { dbConfigured, getServiceClient } from "./mutations";
import type { EditionDraftRow, SignerInviteRow } from "./types";

/** One draft by id — the wizard's autosave target and the management page's source. */
export async function getDraft(id: string): Promise<EditionDraftRow | null> {
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
  return data as EditionDraftRow | null;
}

/**
 * Every draft, most recently touched first. Includes drafts already written
 * on-chain (`chain_address` set) — the studio dashboard decides whether to
 * show those as editions instead.
 */
export async function listDrafts(): Promise<EditionDraftRow[]> {
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
  return (data ?? []) as EditionDraftRow[];
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
 * which of those to say (`invited_at` carries the age).
 */
export async function getInviteByToken(
  token: string,
): Promise<SignerInviteWithDraft | null> {
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

  return { ...invite, draft };
}

/** A draft's seats in the order they were created — the seat list and the "all accepted?" gate. */
export async function listInvites(draftId: string): Promise<SignerInviteRow[]> {
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
