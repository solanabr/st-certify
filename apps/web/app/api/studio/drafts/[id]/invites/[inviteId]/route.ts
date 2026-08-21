import type { NextResponse } from "next/server";
import { apiRoute } from "@/lib/api";
import { requireSysadmin } from "@/lib/auth";
import { fail } from "@/lib/errors";
import { deleteInvite } from "@/lib/db/draft-mutations";
import { getDraft, listInvites } from "@/lib/db/draft-queries";
import { toDraftView, type DraftView } from "@/lib/studio/draft-view";

type Params = { params: Promise<{ id: string; inviteId: string }> };

/**
 * Removes a seat while the edition is still a draft. Deleting an accepted seat
 * is allowed — the admin may genuinely have invited the wrong person — and
 * cascades nothing, since the seat only becomes an on-chain signer slot at
 * create-onchain time.
 */
export async function DELETE(
  _request: Request,
  { params }: Params,
): Promise<NextResponse> {
  return apiRoute(async (): Promise<DraftView> => {
    await requireSysadmin();
    const { id, inviteId } = await params;

    const draft = await getDraft(id);
    if (!draft) {
      fail("NOT_FOUND", "Rascunho não encontrado.");
    }
    if (draft.chain_address) {
      fail(
        "CONFLICT",
        "Esta edição já foi criada on-chain; os signatários não podem mais mudar.",
      );
    }

    const seats = await listInvites(id);
    if (!seats.some((seat) => seat.id === inviteId)) {
      fail("NOT_FOUND", "Signatário não encontrado.");
    }

    await deleteInvite(id, inviteId);
    return toDraftView(
      draft,
      seats.filter((seat) => seat.id !== inviteId),
    );
  });
}
