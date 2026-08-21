import type { NextResponse } from "next/server";
import { apiRoute } from "@/lib/api";
import { requireSysadmin } from "@/lib/auth";
import { fail } from "@/lib/errors";
import { generateClaimToken } from "@/lib/attendance/token";
import { insertInvites, type InviteSeatInput } from "@/lib/db/draft-mutations";
import { getDraft, listInvites } from "@/lib/db/draft-queries";
import type { SignerInviteRow } from "@/lib/db/types";
import { notifyOnce } from "@/lib/email/notify";
import { DEFAULT_LOCALE } from "@/lib/i18n/locales";
import { SIGNER_MAX } from "@/lib/render/layout";
import { seatsCreateSchema } from "@/lib/studio/draft-schemas";
import { toDraftView, type DraftView } from "@/lib/studio/draft-view";

type Params = { params: Promise<{ id: string }> };

const UNNAMED_EDITION = "Edição sem título";

function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
}

/**
 * Emails each freshly-invited signer their magic link. Deliberately not
 * awaited into the response's success: the seats are already committed, and a
 * mail provider having a bad minute must not make the admin think the seats
 * failed to save — they would re-submit and create duplicates. The reminder
 * button is the recovery path for a mail that never arrives.
 */
function sendInvites(rows: SignerInviteRow[], editionName: string): void {
  for (const row of rows) {
    if (row.status !== "invited" || row.email === "") {
      continue;
    }
    void notifyOnce({
      to: row.email,
      kind: "signer-invite",
      locale: DEFAULT_LOCALE,
      refId: row.id,
      payload: {
        signerName: row.name,
        editionName,
        inviteUrl: `${appUrl()}/invite/${row.token}`,
      },
    }).catch((err: unknown) => {
      console.error(
        `[studio:invite] invite email failed for seat ${row.id}:`,
        err instanceof Error ? err.message : String(err),
      );
    });
  }
}

/**
 * Adds seats to a draft (wizard step 2). A seat carrying a `wallet` is the
 * manual escape hatch — bound immediately, no email, no token in flight. Every
 * other seat gets a single-use token and an invite.
 */
export async function POST(
  request: Request,
  { params }: Params,
): Promise<NextResponse> {
  return apiRoute(async (): Promise<DraftView> => {
    await requireSysadmin();
    const { id } = await params;

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

    const raw: unknown = await request.json().catch(() => null);
    const parsed = seatsCreateSchema.safeParse(raw);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      fail("VALIDATION", issue?.message ?? "Dados inválidos.", {
        field: issue?.path.join("."),
      });
    }

    const existing = await listInvites(id);
    if (existing.length + parsed.data.seats.length > SIGNER_MAX) {
      fail(
        "VALIDATION",
        `Uma edição aceita no máximo ${SIGNER_MAX} signatários.`,
        { field: "seats" },
      );
    }

    const taken = new Set(
      existing
        .map((seat) => seat.wallet)
        .filter((w): w is string => w !== null),
    );
    const seats: InviteSeatInput[] = parsed.data.seats.map((seat) => {
      if (seat.wallet && taken.has(seat.wallet)) {
        fail("VALIDATION", "Esta carteira já foi adicionada.", {
          field: "wallet",
        });
      }
      if (seat.wallet) {
        taken.add(seat.wallet);
      }
      return {
        name: seat.name,
        role: seat.role,
        email: seat.email,
        token: generateClaimToken(),
        wallet: seat.wallet ?? null,
      };
    });

    const created = await insertInvites(id, seats);
    sendInvites(created, draft.meta.name ?? UNNAMED_EDITION);

    return toDraftView(draft, [...existing, ...created]);
  });
}
