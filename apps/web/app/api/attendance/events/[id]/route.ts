import type { NextResponse } from "next/server";
import { apiRoute } from "@/lib/api";
import { fail } from "@/lib/errors";
import { eventActionSchema } from "@/lib/attendance/schemas";
import { requireAttendanceCreator } from "@/lib/attendance/require-creator";
import { generateClaimToken } from "@/lib/attendance/token";
import { setClaimOpen, rotateClaimToken } from "@/lib/db/attendance-mutations";
import { getEventById } from "@/lib/db/attendance-queries";
import type { AttendanceEventRow } from "@/lib/db/types";
import {
  toEventView,
  type AttendanceEventView,
} from "@/lib/attendance/event-view";

/** Creator dashboard row actions: pause/resume the claim window, or rotate the public claim link. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  return apiRoute(async (): Promise<AttendanceEventView> => {
    await requireAttendanceCreator();
    const { id } = await params;

    const body = eventActionSchema.safeParse(
      await request.json().catch(() => null),
    );
    if (!body.success) {
      fail("VALIDATION", "Dados inválidos.", { detail: body.error.message });
    }

    const event = await getEventById(id);
    if (!event) {
      fail("NOT_FOUND", "Evento não encontrado.");
    }

    const { action } = body.data;
    let row: AttendanceEventRow;
    if (action === "pause") {
      row = await setClaimOpen(id, false);
    } else if (action === "resume") {
      row = await setClaimOpen(id, true);
    } else {
      row = await rotateClaimToken(id, generateClaimToken());
    }

    return toEventView(row, new URL(request.url).origin);
  });
}
