import type { NextResponse } from "next/server";
import { apiRoute } from "@/lib/api";
import { requireCertifier } from "@/lib/auth";
import {
  dbConfigured,
  getPendingForSigner,
  type PendingEditionGroup,
} from "@/lib/db/certificator-queries";

/** Certificates awaiting the calling signer's signature, grouped by edition. */
export async function GET(): Promise<NextResponse> {
  return apiRoute(async (): Promise<PendingEditionGroup[]> => {
    const session = await requireCertifier();
    if (!dbConfigured) {
      return [];
    }
    return getPendingForSigner(session.wallets);
  });
}
