import type { NextResponse } from "next/server";
import { apiRoute } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { dbConfigured, listCertificatesForOwner } from "@/lib/db/queries";
import type { CertificateForOwner } from "@/lib/db/types";

export async function GET(): Promise<NextResponse> {
  return apiRoute(async (): Promise<CertificateForOwner[]> => {
    const session = await requireUser();
    if (!dbConfigured) {
      return [];
    }
    return listCertificatesForOwner({
      did: session.did,
      wallets: session.wallets,
    });
  });
}
