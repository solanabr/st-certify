import type { NextResponse } from "next/server";
import { apiRoute } from "@/lib/api";
import { requireAttendanceCreator } from "@/lib/attendance/require-creator";
import {
  listClaimsForEvent,
  type AttendanceClaimListRow,
} from "@/lib/db/attendance-queries";

/**
 * GET /api/attendance/events/[id]/claims — creator-only attendee list backing
 * the dashboard's attendee drawer and its client-side CSV export. Gated by
 * `requireAttendanceCreator` (403 otherwise); degrades to `[]` when Supabase
 * isn't configured, so the drawer renders its empty state rather than an error.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  return apiRoute(async (): Promise<AttendanceClaimListRow[]> => {
    await requireAttendanceCreator();
    const { id } = await params;
    return listClaimsForEvent(id);
  });
}
