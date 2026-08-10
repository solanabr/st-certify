"use client";

import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { MeResponse } from "@/app/api/me/route";

export type { MeResponse };

/** Session + role for the current visitor. Always resolves (never throws) — anonymous is a normal state. */
export function useMe(): UseQueryResult<MeResponse> {
  return useQuery({
    queryKey: ["me"],
    queryFn: () => api<MeResponse>("/api/me"),
    staleTime: 30_000,
  });
}
