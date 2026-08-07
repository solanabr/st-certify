"use client";

import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { EditionWithSigners } from "@/lib/db/types";

/** Open editions for the public browse grid. No polling — RSC does the first paint; this backs client refetches. */
export function useEditions(
  initialData?: EditionWithSigners[],
): UseQueryResult<EditionWithSigners[]> {
  return useQuery({
    queryKey: ["editions"],
    queryFn: () => api<EditionWithSigners[]>("/api/editions"),
    initialData,
  });
}
