"use client";

import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { EditionWithSigners } from "@/lib/db/types";

/**
 * Edition detail by slug. Seeded with the RSC-rendered `initialData` for
 * instant paint; the request-form island invalidates `['edition', slug]`
 * after a successful request so the supply count updates live.
 */
export function useEdition(
  slug: string,
  initialData?: EditionWithSigners,
): UseQueryResult<EditionWithSigners> {
  return useQuery({
    queryKey: ["edition", slug],
    queryFn: () => api<EditionWithSigners>(`/api/editions/${slug}`),
    initialData,
  });
}
