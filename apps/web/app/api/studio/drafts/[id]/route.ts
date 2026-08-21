import type { NextResponse } from "next/server";
import { apiRoute } from "@/lib/api";
import { requireSysadmin } from "@/lib/auth";
import { fail } from "@/lib/errors";
import { updateDraft, type DraftPatch } from "@/lib/db/draft-mutations";
import { getDraft, listInvites } from "@/lib/db/draft-queries";
import { draftPatchSchema } from "@/lib/studio/draft-schemas";
import { toDraftView, type DraftView } from "@/lib/studio/draft-view";

type Params = { params: Promise<{ id: string }> };

export async function GET(
  _request: Request,
  { params }: Params,
): Promise<NextResponse> {
  return apiRoute(async (): Promise<DraftView> => {
    await requireSysadmin();
    const { id } = await params;

    const draft = await getDraft(id);
    if (!draft) {
      fail("NOT_FOUND", "Rascunho não encontrado.");
    }
    return toDraftView(draft, await listInvites(id));
  });
}

/**
 * The wizard's autosave target: a debounced patch of whatever the current step
 * owns. Refuses once the edition exists on-chain — `meta` is mirrored into an
 * immutable `create_edition` and `layout` is hashed into its `spec_hash`, so
 * accepting an edit here would silently desynchronize the certificate everyone
 * verifies from the one the chain attests to.
 */
export async function PATCH(
  request: Request,
  { params }: Params,
): Promise<NextResponse> {
  return apiRoute(async (): Promise<DraftView> => {
    await requireSysadmin();
    const { id } = await params;

    const existing = await getDraft(id);
    if (!existing) {
      fail("NOT_FOUND", "Rascunho não encontrado.");
    }
    if (existing.chain_address) {
      fail(
        "CONFLICT",
        "Esta edição já foi criada on-chain e não pode mais ser editada.",
      );
    }

    const raw: unknown = await request.json().catch(() => null);
    const parsed = draftPatchSchema.safeParse(raw);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      fail("VALIDATION", issue?.message ?? "Dados inválidos.", {
        field: issue?.path.join("."),
      });
    }

    const patch: DraftPatch = {};
    if (parsed.data.meta !== undefined) {
      // Merged, not replaced: step 1 autosaves only the fields it owns, and a
      // bare assignment would drop whatever another step had already stored.
      patch.meta = { ...existing.meta, ...parsed.data.meta };
    }
    if (parsed.data.layout !== undefined) {
      patch.layout = parsed.data.layout;
      // Derived, never client-supplied, so the column can't disagree with the
      // layout it describes.
      patch.template_sha = parsed.data.layout?.template.sha256 ?? null;
    }

    const updated = await updateDraft(id, patch);
    return toDraftView(updated, await listInvites(id));
  });
}
