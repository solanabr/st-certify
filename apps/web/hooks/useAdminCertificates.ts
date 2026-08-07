"use client";

import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { CertificateAdminRow } from "@/lib/db/types";

export interface AdminCertificateFilters {
  edition?: string;
  status?: string;
}

/** Certificados tab: edition/status filter server-side, name search stays client-side (see the route). */
export function useAdminCertificates(
  filters: AdminCertificateFilters,
): UseQueryResult<CertificateAdminRow[]> {
  const params = new URLSearchParams();
  if (filters.edition) params.set("edition", filters.edition);
  if (filters.status) params.set("status", filters.status);
  const query = params.toString();

  return useQuery({
    queryKey: [
      "admin",
      "certificates",
      filters.edition ?? null,
      filters.status ?? null,
    ],
    queryFn: () =>
      api<CertificateAdminRow[]>(
        `/api/admin/certificates${query ? `?${query}` : ""}`,
      ),
    refetchInterval: 30_000,
  });
}
