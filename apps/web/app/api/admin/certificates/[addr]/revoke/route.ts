export const runtime = "nodejs";
export const maxDuration = 60;

import type { NextResponse } from "next/server";
import { apiRoute } from "@/lib/api";
import { requireSysadmin } from "@/lib/auth";
import { fail } from "@/lib/errors";
import { revokeSchema } from "@/lib/schemas";
import {
  revokeCertificate,
  type RevokeCertificateResult,
} from "@/lib/chain/revoke";

/**
 * Admin revoke — two distinct server-held admin signatures (OPERATOR + DEPLOYER)
 * inside `revokeCertificate`, then a best-effort burn. Sysadmin-gated; the reason
 * is validated by the same zod schema the dialog uses.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ addr: string }> },
): Promise<NextResponse> {
  return apiRoute(async (): Promise<RevokeCertificateResult> => {
    const session = await requireSysadmin();
    const { addr } = await params;
    const raw: unknown = await request.json().catch(() => null);
    const parsed = revokeSchema.safeParse(raw);
    if (!parsed.success) {
      fail("VALIDATION", "Informe um motivo para a revogação.", {
        field: "reason",
      });
    }

    return revokeCertificate({
      certificateAddress: addr,
      reason: parsed.data.reason,
      actor: session.did,
    });
  });
}
