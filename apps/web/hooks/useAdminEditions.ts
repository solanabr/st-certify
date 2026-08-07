"use client";

import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { EditionWithSigners } from "@/lib/db/types";

/** All editions (every status) for the admin Edições tab. 30s polling, same cadence as the rest of /admin. */
export function useAdminEditions(): UseQueryResult<EditionWithSigners[]> {
  return useQuery({
    queryKey: ["admin", "editions"],
    queryFn: () => api<EditionWithSigners[]>("/api/admin/editions"),
    refetchInterval: 30_000,
  });
}
