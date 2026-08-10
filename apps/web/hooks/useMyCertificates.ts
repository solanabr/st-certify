"use client";

import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { CertificateForOwner } from "@/lib/db/types";

const ACTIVE_STATUSES = new Set(["Requested", "FullySigned"]);

/** True while any cert is mid-flight — request pending signatures, or claimed but not yet asset-recorded (minting). */
function hasActiveCert(certs: CertificateForOwner[] | undefined): boolean {
  if (!certs) {
    return false;
  }
  return certs.some(
    (c) =>
      ACTIVE_STATUSES.has(c.status) || (c.status === "Claimed" && !c.asset),
  );
}

/** /me tracker: 5s while something is in flight, 60s idle (appendix §2 polling table). */
export function useMyCertificates(): UseQueryResult<CertificateForOwner[]> {
  return useQuery({
    queryKey: ["me", "certificates"],
    queryFn: () => api<CertificateForOwner[]>("/api/me/certificates"),
    refetchInterval: (query) =>
      hasActiveCert(query.state.data) ? 5_000 : 60_000,
  });
}
