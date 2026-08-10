import type { NextResponse } from "next/server";
import { apiRoute } from "@/lib/api";
import { requireSysadmin } from "@/lib/auth";
import { dbConfigured, listCertificatesAdmin } from "@/lib/db/queries";
import type { CertificateAdminRow } from "@/lib/db/types";

/**
 * `edition`/`status` filter server-side (cheap WHERE clauses); free-text
 * name search stays client-side (webapp-architecture list-page rule — fine
 * under ~1k rows, and this admin table won't see more than that tonight).
 */
export async function GET(request: Request): Promise<NextResponse> {
  return apiRoute(async (): Promise<CertificateAdminRow[]> => {
    await requireSysadmin();
    if (!dbConfigured) {
      return [];
    }
    const url = new URL(request.url);
    return listCertificatesAdmin({
      edition: url.searchParams.get("edition") ?? undefined,
      status: url.searchParams.get("status") ?? undefined,
    });
  });
}
