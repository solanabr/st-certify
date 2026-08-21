export const runtime = "nodejs";

import { type NextResponse } from "next/server";
import { apiRoute } from "@/lib/api";
import { getCertificateByVerifyCode } from "@/lib/db/claim-verify-queries";

export interface ResolveCodeResult {
  /** The certificate the code fingerprints, or null when nothing matches. */
  address: string | null;
}

/**
 * Turns the 8-character code printed on a PDF into the certificate address
 * `/verify/[id]` needs — the paper path into verification, for someone holding
 * a printout who will not retype a 44-character base58 address.
 *
 * Public and unauthenticated, like the verify page it feeds: the code is a
 * lookup key over data that is already public, not a secret (see
 * lib/verify-code.ts). A miss answers 200 with `address: null` rather than 404,
 * so the caller can tell "no such certificate" apart from "we could not check"
 * — the distinction the verify tool exists to preserve.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ code: string }> },
): Promise<NextResponse> {
  return apiRoute(async (): Promise<ResolveCodeResult> => {
    const { code } = await params;
    const match = await getCertificateByVerifyCode(decodeURIComponent(code));
    return { address: match?.address ?? null };
  });
}
