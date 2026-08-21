import type { NextResponse } from "next/server";
import { apiRoute } from "@/lib/api";
import { requireSysadmin } from "@/lib/auth";
import { fail } from "@/lib/errors";
import { updateDraft } from "@/lib/db/draft-mutations";
import { getDraft, listInvites } from "@/lib/db/draft-queries";
import {
  createEditionFromWizard,
  type CreateEditionResult,
} from "@/lib/editions/create";
import { layoutSchema } from "@/lib/render/layout";
import { editionMetaSchema } from "@/lib/schemas";
import { allSeatsAccepted, toDraftView } from "@/lib/studio/draft-view";

type Params = { params: Promise<{ id: string }> };

/** The on-chain program's signer-slot floor (`signers: [SignerSlot;6]`, 2 minimum). */
const MIN_SIGNERS = 2;

/**
 * The wizard's one and only chain write, behind an explicit button. Everything
 * before this point — including the step-5 sample render — is free and
 * reversible; this is not.
 *
 * Refuses unless every seat is bound to a wallet: the signer list is baked
 * into `create_edition` and cannot be amended afterwards, so an edition
 * created with a placeholder seat would be permanently unsignable.
 */
export async function POST(
  _request: Request,
  { params }: Params,
): Promise<NextResponse> {
  return apiRoute(async (): Promise<CreateEditionResult> => {
    const session = await requireSysadmin();
    const { id } = await params;

    const draft = await getDraft(id);
    if (!draft) {
      fail("NOT_FOUND", "Rascunho não encontrado.");
    }

    // Idempotent by design: a double-click, a retried request or a reload must
    // never mint a second edition for the same draft.
    if (draft.chain_address) {
      return { address: draft.chain_address, slug: draft.meta.slug ?? "" };
    }

    const view = toDraftView(draft, await listInvites(id));

    if (view.seats.length < MIN_SIGNERS) {
      fail(
        "VALIDATION",
        `São necessários pelo menos ${MIN_SIGNERS} signatários.`,
        { field: "seats" },
      );
    }
    if (!allSeatsAccepted(view.seats)) {
      const pending = view.seats
        .filter((seat) => seat.status !== "accepted" || !seat.wallet)
        .map((seat) => seat.name)
        .join(", ");
      fail(
        "CONFLICT",
        `Aguardando a confirmação de: ${pending}. Todos os signatários precisam aceitar o convite antes da criação on-chain.`,
      );
    }

    // The draft accumulated `meta` one loose patch at a time; this is where it
    // has to be a complete, valid edition.
    const meta = editionMetaSchema.safeParse(draft.meta);
    if (!meta.success) {
      const issue = meta.error.issues[0];
      fail("VALIDATION", issue?.message ?? "Dados da edição incompletos.", {
        field: issue?.path.join("."),
      });
    }

    // A stored layout means the designer produced one (custom path); its
    // absence means the default template. The draft never records the choice
    // separately, so the two cannot disagree.
    const customLayout = draft.layout
      ? layoutSchema.parse(draft.layout)
      : undefined;

    const created = await createEditionFromWizard({
      meta: meta.data,
      signers: view.seats.map((seat) => ({
        // Non-null by allSeatsAccepted above.
        wallet: seat.wallet as string,
        name: seat.name,
        role: seat.role,
      })),
      templatePath: customLayout ? "custom" : "default",
      customLayout,
      actorDid: session.did,
    });

    try {
      await updateDraft(id, { chain_address: created.address });
    } catch (err) {
      // The edition is already on-chain and mirrored; only the draft's link to
      // it is missing. Retrying the create would be refused by the slug
      // uniqueness check, so this needs a human, not an automatic retry.
      console.error(
        `[studio:reconcile] edition created on-chain but draft not linked — ` +
          `draftId=${id} address=${created.address}:`,
        err instanceof Error ? err.message : String(err),
      );
    }

    return created;
  });
}
