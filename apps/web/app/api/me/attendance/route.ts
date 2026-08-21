import type { NextResponse } from "next/server";
import { apiRoute } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import {
  listAttendanceClaimsForWallets,
  type AttendanceClaimForOwner,
} from "@/lib/db/attendance-queries";

/** The "Presenças" section of `/me`: minted attendance claims held by the session's wallets. */
export async function GET(): Promise<NextResponse> {
  return apiRoute(async (): Promise<AttendanceClaimForOwner[]> => {
    const session = await requireUser();
    return listAttendanceClaimsForWallets(session.wallets);
  });
}
