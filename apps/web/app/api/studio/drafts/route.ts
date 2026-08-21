import type { NextResponse } from "next/server";
import { apiRoute } from "@/lib/api";
import { requireSysadmin } from "@/lib/auth";
import { fail } from "@/lib/errors";
import { insertDraft } from "@/lib/db/draft-mutations";
import { listDrafts, listInvitesForDrafts } from "@/lib/db/draft-queries";
import type { SignerInviteRow } from "@/lib/db/types";
import { draftCreateSchema } from "@/lib/studio/draft-schemas";
import { toDraftView, type DraftView } from "@/lib/studio/draft-view";

/** Every draft with its seats, most recently touched first. */
export async function GET(): Promise<NextResponse> {
  return apiRoute(async (): Promise<DraftView[]> => {
    await requireSysadmin();

    const drafts = await listDrafts();
    if (drafts.length === 0) {
      return [];
    }

    const seats = await listInvitesForDrafts(drafts.map((d) => d.id));
    const byDraft = new Map<string, SignerInviteRow[]>();
    for (const seat of seats) {
      const bucket = byDraft.get(seat.draft_id);
      if (bucket) {
        bucket.push(seat);
      } else {
        byDraft.set(seat.draft_id, [seat]);
      }
    }

    return drafts.map((draft) =>
      toDraftView(draft, byDraft.get(draft.id) ?? []),
    );
  });
}

/**
 * Opens a draft. The wizard calls this once, as soon as step 1 has anything
 * worth keeping, and PATCHes the same row from then on — so closing the tab
 * mid-wizard loses nothing, and nothing touches the chain until the explicit
 * "Criar on-chain" at the end.
 */
export async function POST(request: Request): Promise<NextResponse> {
  return apiRoute(async (): Promise<DraftView> => {
    const session = await requireSysadmin();

    const raw: unknown = await request.json().catch(() => null);
    const parsed = draftCreateSchema.safeParse(raw ?? {});
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      fail("VALIDATION", issue?.message ?? "Dados inválidos.", {
        field: issue?.path.join("."),
      });
    }

    const draft = await insertDraft({
      meta: parsed.data.meta ?? {},
      createdBy: session.did,
    });
    return toDraftView(draft, []);
  });
}
