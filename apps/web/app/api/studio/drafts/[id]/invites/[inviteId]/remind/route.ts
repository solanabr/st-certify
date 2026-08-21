import type { NextResponse } from "next/server";
import { apiRoute } from "@/lib/api";
import { requireSysadmin } from "@/lib/auth";
import { fail } from "@/lib/errors";
import { touchInviteReminded } from "@/lib/db/draft-mutations";
import { getDraft, listInvites } from "@/lib/db/draft-queries";
import { notifyOnce } from "@/lib/email/notify";
import { DEFAULT_LOCALE } from "@/lib/i18n/locales";

type Params = { params: Promise<{ id: string; inviteId: string }> };

/** Matches the digest cron: a human may click twice, they still get one mail a day. */
const REMINDER_MIN_INTERVAL_HOURS = 20;

export interface RemindResponse {
  sent: boolean;
  deduped: boolean;
}

/**
 * Re-sends a pending signer's magic link. The rate limit lives in
 * `notifyOnce`'s ledger rather than in a disabled button, so it holds across
 * tabs, reloads and two admins nudging the same person.
 */
export async function POST(
  _request: Request,
  { params }: Params,
): Promise<NextResponse> {
  return apiRoute(async (): Promise<RemindResponse> => {
    await requireSysadmin();
    const { id, inviteId } = await params;

    const draft = await getDraft(id);
    if (!draft) {
      fail("NOT_FOUND", "Rascunho não encontrado.");
    }

    const seat = (await listInvites(id)).find((s) => s.id === inviteId);
    if (!seat) {
      fail("NOT_FOUND", "Signatário não encontrado.");
    }
    if (seat.status !== "invited") {
      fail("CONFLICT", "Este signatário já confirmou o convite.");
    }
    if (seat.email === "") {
      fail("VALIDATION", "Este signatário não tem e-mail para lembrar.");
    }

    const result = await notifyOnce({
      to: seat.email,
      kind: "signer-invite",
      locale: DEFAULT_LOCALE,
      refId: seat.id,
      payload: {
        signerName: seat.name,
        editionName: draft.meta.name ?? "Edição sem título",
        inviteUrl: `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/invite/${seat.token}`,
      },
      minIntervalHours: REMINDER_MIN_INTERVAL_HOURS,
    });

    if (result.sent) {
      await touchInviteReminded(seat.id);
    }
    return result;
  });
}
