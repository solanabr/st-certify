export const runtime = "nodejs";

import type { NextResponse } from "next/server";
import { apiRoute } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { prepareClaim, type PrepareClaimResult } from "@/lib/chain/claim";

/**
 * Claim step 1 — render the canonical artifact, store it, and return a
 * NOTARY-partially-signed `claim_certificate` tx for the student's wallet to
 * complete. Ownership + the notary name-commitment gate are enforced inside
 * `prepareClaim`; the caller's wallets come from the verified session.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ addr: string }> },
): Promise<NextResponse> {
  return apiRoute(async (): Promise<PrepareClaimResult> => {
    const session = await requireUser();
    const { addr } = await params;
    return prepareClaim({
      certificateAddress: addr,
      callerWallets: session.wallets,
    });
  });
}
