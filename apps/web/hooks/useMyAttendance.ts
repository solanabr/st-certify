"use client";

import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { AttendanceClaimForOwner } from "@/lib/db/attendance-queries";

/** True while any claim still lacks its asset id — the backfill that turns a card into an `/nft/[assetId]` link. */
function hasPendingAsset(
  claims: AttendanceClaimForOwner[] | undefined,
): boolean {
  return claims?.some((c) => c.assetId === null) ?? false;
}

/** The "Presenças" section of `/me`: 10s while an asset id is still backfilling, 60s otherwise. */
export function useMyAttendance(): UseQueryResult<AttendanceClaimForOwner[]> {
  return useQuery({
    queryKey: ["me", "attendance"],
    queryFn: () => api<AttendanceClaimForOwner[]>("/api/me/attendance"),
    refetchInterval: (query) =>
      hasPendingAsset(query.state.data) ? 10_000 : 60_000,
  });
}
