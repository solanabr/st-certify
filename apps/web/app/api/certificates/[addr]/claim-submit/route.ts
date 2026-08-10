export const runtime = "nodejs";

import type { NextResponse } from "next/server";
import { apiRoute } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { fail } from "@/lib/errors";
import { submitClaim, type SubmitClaimResult } from "@/lib/chain/claim";

interface ClaimSubmitBody {
  wireBytesBase64?: string;
  lastValidBlockHeight?: string;
}

/**
 * Both fields are optional: the initial submit sends the student-signed wire; a
 * resume-mint re-POST (cert already Claimed, asset still null) sends an empty
 * body and lets `submitClaim` pick up at the mint step. When present, they must
 * be strings.
 */
function parseBody(body: unknown): ClaimSubmitBody {
  const b = (body ?? {}) as Partial<ClaimSubmitBody>;
  if (
    (b.wireBytesBase64 !== undefined &&
      typeof b.wireBytesBase64 !== "string") ||
    (b.lastValidBlockHeight !== undefined &&
      typeof b.lastValidBlockHeight !== "string")
  ) {
    fail("VALIDATION", "Requisição inválida.");
  }
  return {
    wireBytesBase64: b.wireBytesBase64,
    lastValidBlockHeight: b.lastValidBlockHeight,
  };
}

/**
 * Claim step 2 — the idempotent pipeline: confirm the student-signed claim tx →
 * mint the soulbound Core asset → record_asset. Re-POSTable at any step
 * (`submitClaim` checks chain state first), so a blockhash-expired retry or a
 * partial failure resumes cleanly instead of double-minting.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ addr: string }> },
): Promise<NextResponse> {
  return apiRoute(async (): Promise<SubmitClaimResult> => {
    const session = await requireUser();
    const { addr } = await params;
    const raw: unknown = await request.json().catch(() => null);
    const body = parseBody(raw);

    return submitClaim({
      certificateAddress: addr,
      callerWallets: session.wallets,
      callerDid: session.did,
      wireBytesBase64: body.wireBytesBase64,
      lastValidBlockHeight: body.lastValidBlockHeight,
    });
  });
}
