import type { NextResponse } from "next/server";
import { apiRoute } from "@/lib/api";
import { requireSysadmin } from "@/lib/auth";
import { fail } from "@/lib/errors";
import {
  claimDraftForCreate,
  releaseDraftCreateClaim,
  updateDraft,
} from "@/lib/db/draft-mutations";
import { getDraft, listInvites } from "@/lib/db/draft-queries";
import { getEditionByAddress } from "@/lib/db/queries";
import type { EditionDraftRow } from "@/lib/db/types";
import {
  createEditionFromWizard,
  mirrorEditionFromWizard,
  type CreateEditionInput,
  type CreateEditionResult,
} from "@/lib/editions/create";
import { layoutSchema } from "@/lib/render/layout";
import { editionMetaSchema } from "@/lib/schemas";
import {
  allSeatsAccepted,
  toDraftView,
  type SeatView,
} from "@/lib/studio/draft-view";

type Params = { params: Promise<{ id: string }> };

/** The on-chain program's signer-slot floor (`signers: [SignerSlot;6]`, 2 minimum). */
const MIN_SIGNERS = 2;

/**
 * The draft, validated into the exact input both the create and its repair
 * run on. Deterministic: the same draft always produces the same layout and
 * spec hash, which is what lets a half-finished create be resumed rather than
 * reinterpreted.
 */
function buildCreateInput(
  draft: EditionDraftRow,
  seats: SeatView[],
  actorDid: string,
): CreateEditionInput {
  if (seats.length < MIN_SIGNERS) {
    fail(
      "VALIDATION",
      `São necessários pelo menos ${MIN_SIGNERS} signatários.`,
      {
        field: "seats",
      },
    );
  }
  if (!allSeatsAccepted(seats)) {
    const pending = seats
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

  return {
    meta: meta.data,
    signers: seats.map((seat) => ({
      // Non-null by allSeatsAccepted above.
      wallet: seat.wallet as string,
      name: seat.name,
      role: seat.role,
    })),
    templatePath: customLayout ? "custom" : "default",
    customLayout,
    actorDid,
  };
}

/**
 * Writes the address the edition actually got over the create claim.
 *
 * Never throws: by the time it runs the edition exists on-chain, and turning a
 * bookkeeping failure into an error response would invite a retry that mints a
 * second one.
 */
async function linkDraftToEdition(
  id: string,
  address: string,
): Promise<boolean> {
  try {
    await updateDraft(id, { chain_address: address });
    return true;
  } catch (err) {
    console.error(
      `[studio:reconcile] edition created on-chain but draft not linked — ` +
        `draftId=${id} address=${address}:`,
      err instanceof Error ? err.message : String(err),
    );
    return false;
  }
}

/**
 * The wizard's one and only chain write, behind an explicit button. Everything
 * before this point — including the step-5 sample render — is free and
 * reversible; this is not.
 *
 * Refuses unless every seat is bound to a wallet: the signer list is baked
 * into `create_edition` and cannot be amended afterwards, so an edition
 * created with a placeholder seat would be permanently unsignable.
 *
 * Idempotent across every way this can be asked twice, because
 * `create_edition` derives its PDA from an on-chain counter and would happily
 * mint a second edition:
 *
 *  - the draft is claimed BEFORE the chain write, so a concurrent or retried
 *    request finds the claim taken and is refused rather than minting;
 *  - the real address is persisted the moment the write confirms, before any
 *    mirror work, so the crash window that used to leave `chain_address` null
 *    (and therefore re-mintable) no longer exists;
 *  - a retry that finds the address written but the mirror missing finishes
 *    the mirror instead of touching the chain again;
 *  - an attempt that fails before the chain write hands the claim back, so a
 *    genuine retry isn't wedged.
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

    if (draft.chain_address) {
      const address = draft.chain_address;
      // The ordinary double-click: the edition is on-chain and mirrored.
      if (await getEditionByAddress(address)) {
        return { address, slug: draft.meta.slug ?? "" };
      }
      // Chain write landed, mirror didn't. Finish it — never re-create.
      const seats = toDraftView(draft, await listInvites(id)).seats;
      return mirrorEditionFromWizard(
        buildCreateInput(draft, seats, session.did),
        address,
      );
    }

    const seats = toDraftView(draft, await listInvites(id)).seats;
    const input = buildCreateInput(draft, seats, session.did);

    if (!(await claimDraftForCreate(id))) {
      fail(
        "CONFLICT",
        "Esta edição já está sendo criada. Aguarde alguns instantes e recarregue a página.",
      );
    }

    let linked = false;
    let chainWritten = false;
    try {
      const created = await createEditionFromWizard(input, {
        onChainWritten: async (address) => {
          chainWritten = true;
          linked = await linkDraftToEdition(id, address);
        },
      });
      // Belt to the hook's braces: a create that resolved wrote to the chain,
      // whether or not the hook ran. Releasing the claim after that is what
      // re-mints, so this must not depend on a callback firing.
      chainWritten = true;
      if (!linked) {
        // One more go now that the mirror is in and the DB is evidently
        // reachable; the draft is the last thing still pointing at the claim.
        await linkDraftToEdition(id, created.address);
      }
      return created;
    } finally {
      // Nothing reached the chain, so the claim is a lock nobody will release
      // — hand it back. If the write DID land, the claim deliberately stays:
      // a draft stuck mid-create needs a human, not a retry that mints twice.
      if (!chainWritten) {
        await releaseDraftCreateClaim(id);
      }
    }
  });
}
