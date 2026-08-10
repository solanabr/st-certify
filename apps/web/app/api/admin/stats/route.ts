import type { NextResponse } from "next/server";
import { apiRoute } from "@/lib/api";
import { requireSysadmin } from "@/lib/auth";
import { dbConfigured, getAdminStats } from "@/lib/db/queries";
import { listRecentEventsForAdmin } from "@/lib/db/mutations";
import type { AdminStats } from "@/lib/db/types";

export interface AdminEvent {
  id: number;
  type: string;
  actor: string | null;
  certAddress: string | null;
  editionAddress: string | null;
  txSig: string | null;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface AdminStatsResponse {
  stats: AdminStats;
  events: AdminEvent[];
}

const EMPTY_STATS: AdminStats = {
  editionsCount: 0,
  pendingSignaturesCount: 0,
  claimedCount: 0,
  revokedCount: 0,
};

export async function GET(): Promise<NextResponse> {
  return apiRoute(async (): Promise<AdminStatsResponse> => {
    await requireSysadmin();
    if (!dbConfigured) {
      return { stats: EMPTY_STATS, events: [] };
    }

    const [stats, eventRows] = await Promise.all([
      getAdminStats(),
      listRecentEventsForAdmin(20),
    ]);

    return {
      stats,
      events: eventRows.map((e) => ({
        id: e.id,
        type: e.type,
        actor: e.actor,
        certAddress: e.cert_address,
        editionAddress: e.edition_address,
        txSig: e.tx_sig,
        payload: e.payload,
        createdAt: e.created_at,
      })),
    };
  });
}
