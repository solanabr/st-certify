"use client";

import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { AdminStatsResponse } from "@/app/api/admin/stats/route";

export type {
  AdminStatsResponse,
  AdminEvent,
} from "@/app/api/admin/stats/route";

/** Admin overview: 30s polling (appendix §2). */
export function useAdminStats(): UseQueryResult<AdminStatsResponse> {
  return useQuery({
    queryKey: ["admin", "stats"],
    queryFn: () => api<AdminStatsResponse>("/api/admin/stats"),
    refetchInterval: 30_000,
  });
}
