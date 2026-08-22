export const runtime = "nodejs";
export const maxDuration = 60;

import { after, type NextResponse } from "next/server";
import { apiRoute } from "@/lib/api";
import { requireSysadmin } from "@/lib/auth";
import { fail } from "@/lib/errors";
import { revokeSchema } from "@/lib/schemas";
import {
  revokeCertificate,
  type RevokeCertificateResult,
} from "@/lib/chain/revoke";
import { getCertificateNotificationContext } from "@/lib/db/notification-queries";
import { getVerifyView } from "@/lib/db/claim-verify-queries";
import { notifyOnce } from "@/lib/email/notify";
import { DEFAULT_LOCALE } from "@/lib/i18n/locales";
import { removeCachedPdfs } from "@/lib/pdf/storage";

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

    const result = await revokeCertificate({
      certificateAddress: addr,
      reason: parsed.data.reason,
      actor: session.did,
    });

    // The cached export lives in a public bucket at a path derivable from
    // anon-readable data — revoking the route isn't enough, the object has to
    // go. Also on alreadyRevoked: re-revoking repairs an earlier missed sweep.
    await sweepPdfCache(addr);

    // The student learns their certificate is gone from the verify page
    // otherwise — after() runs this once the response is out, so a mail
    // outage can never turn a completed revoke into an error.
    if (!result.alreadyRevoked) {
      after(() =>
        notifyRevoked(addr, parsed.data.reason).catch((err: unknown) => {
          console.error(`[notify] cert-revoked ${addr} failed:`, err);
        }),
      );
    }
    return result;
  });
}

/**
 * Never fails the revoke — chain state is authoritative — but a failed sweep
 * is an operator-visible error, not a silent shrug: until it succeeds, the
 * pre-revocation PDF stays publicly fetchable straight from storage.
 */
async function sweepPdfCache(address: string): Promise<void> {
  try {
    const view = await getVerifyView(address);
    if (!view?.sha256) return;
    const removed = await removeCachedPdfs(view.sha256);
    if (removed > 0) {
      console.log(`[revoke] swept ${removed} cached PDF(s) for ${address}`);
    } else if (removed < 0) {
      console.error(
        `[revoke] PDF cache sweep FAILED for ${address} — the cached export may still be publicly fetchable`,
      );
    }
  } catch (err) {
    console.error(`[revoke] PDF cache sweep threw for ${address}:`, err);
  }
}

async function notifyRevoked(address: string, reason: string): Promise<void> {
  const context = await getCertificateNotificationContext(address);
  if (!context?.studentEmail) {
    console.warn(`[notify] cert-revoked ${address}: no student email`);
    return;
  }
  await notifyOnce({
    to: context.studentEmail,
    kind: "cert-revoked",
    locale: DEFAULT_LOCALE,
    refId: address,
    payload: {
      studentName: context.studentName,
      editionName: context.editionName,
      reason,
    },
  });
}
