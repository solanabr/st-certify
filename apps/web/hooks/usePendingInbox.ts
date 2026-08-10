"use client";

import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { PendingEditionGroup } from "@/lib/db/certificator-queries";

export type { PendingEditionGroup } from "@/lib/db/certificator-queries";

/**
 * The certificator inbox query (appendix §2 polling table: 10s idle, paused
 * during an active batch so a mid-sign refetch can't reshuffle the table under
 * the user). `paused` is the mass-sign hook's `running` flag.
 */
export function usePendingInbox(
  paused: boolean,
): UseQueryResult<PendingEditionGroup[]> {
  return useQuery({
    queryKey: ["certificator", "pending"],
    queryFn: () => api<PendingEditionGroup[]>("/api/certificator/pending"),
    refetchInterval: paused ? false : 10_000,
  });
}
