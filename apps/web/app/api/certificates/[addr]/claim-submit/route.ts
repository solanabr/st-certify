export const runtime = "nodejs";
export const maxDuration = 60;

import { after, type NextResponse } from "next/server";
import { apiRoute } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { fail } from "@/lib/errors";
import { submitClaim, type SubmitClaimResult } from "@/lib/chain/claim";
import { getCertificateNotificationContext } from "@/lib/db/notification-queries";
import { notifyOnce } from "@/lib/email/notify";
import { DEFAULT_LOCALE } from "@/lib/i18n/locales";

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

    const result = await submitClaim({
      certificateAddress: addr,
      callerWallets: session.wallets,
      callerDid: session.did,
      wireBytesBase64: body.wireBytesBase64,
      lastValidBlockHeight: body.lastValidBlockHeight,
    });

    // The receipt carries the two links a holder actually needs later. A
    // resume-mint re-POST lands here again; notifyOnce keys on the
    // certificate, so the student still gets exactly one.
    after(() =>
      notifyClaimReceipt(addr, session.email).catch((err: unknown) => {
        console.error(`[notify] claim-receipt ${addr} failed:`, err);
      }),
    );
    return result;
  });
}

async function notifyClaimReceipt(
  address: string,
  sessionEmail: string | null,
): Promise<void> {
  const context = await getCertificateNotificationContext(address);
  if (!context) {
    console.warn(`[notify] claim-receipt ${address}: no certificate context`);
    return;
  }
  // The claimer IS the student here, so their session address is the freshest
  // one we have; the profile mirror is the fallback.
  const to = sessionEmail ?? context.studentEmail;
  if (!to) {
    console.warn(`[notify] claim-receipt ${address}: no student email`);
    return;
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  await notifyOnce({
    to,
    kind: "claim-receipt",
    locale: DEFAULT_LOCALE,
    refId: address,
    payload: {
      studentName: context.studentName,
      editionName: context.editionName,
      verifyUrl: `${appUrl}/verify/${address}`,
      pdfUrl: `${appUrl}/api/certificates/${address}/pdf`,
    },
  });
}
