import { after, type NextResponse } from "next/server";
import { apiRoute } from "@/lib/api";
import { requireCertifier } from "@/lib/auth";
import { fail } from "@/lib/errors";
import { DEFAULT_LOCALE } from "@/lib/i18n/locales";
import { getCertificateNotificationContext } from "@/lib/db/notification-queries";
import { notifyOnce } from "@/lib/email/notify";
import {
  certificateExistsOnChain,
  submitAndSyncTransaction,
  type SubmitAndSyncResult,
  type SyncTarget,
} from "@/lib/chain/server";
import { getCertificateByAddress } from "@/lib/db/queries";
import { isWalletSignerOfEdition } from "@/lib/db/certificator-queries";
import { markCertificateRejected } from "@/lib/db/certificator-mutations";

/**
 * Submit a signed `reject_request` (merged reject+close): the on-chain close +
 * address-targeted rent refund to the student, plus an off-chain reason in the
 * event log. Because the PDA is closed, the shared chain-sync can't reflect it —
 * we additionally flip the mirror row to the DB-only "Rejected" state so it
 * leaves every signer's inbox. Program enforces signer-or-admin authority
 * on-chain; this route additionally re-derives every address from the
 * looked-up DB row (never the request body) and confirms the PDA is actually
 * closed before touching the mirror, so a caller can't flip an unrelated
 * certificate's mirror row to Rejected by naming a different address in the
 * body.
 */
interface Body {
  wireBytesBase64: string;
  lastValidBlockHeight: string;
  certificateAddress: string;
  editionAddress: string;
  reason?: string;
}

function parseBody(body: unknown): Body {
  const b = body as Partial<Body> | null;
  if (
    !b ||
    typeof b.wireBytesBase64 !== "string" ||
    typeof b.lastValidBlockHeight !== "string" ||
    typeof b.certificateAddress !== "string" ||
    typeof b.editionAddress !== "string" ||
    (b.reason !== undefined && typeof b.reason !== "string")
  ) {
    fail("VALIDATION", "Requisição inválida.");
  }
  return b as Body;
}

export async function POST(request: Request): Promise<NextResponse> {
  return apiRoute(async (): Promise<SubmitAndSyncResult> => {
    const session = await requireCertifier();
    const body = parseBody(await request.json().catch(() => null));

    let lastValidBlockHeight: bigint;
    try {
      lastValidBlockHeight = BigInt(body.lastValidBlockHeight);
    } catch {
      fail("VALIDATION", "lastValidBlockHeight inválido.");
    }

    // body.certificateAddress is only a lookup key from here on — every
    // address that reaches the sync/mutation layer below comes from this
    // row, never straight from the request body (mirrors /api/tx/submit's
    // pattern).
    const target = await getCertificateByAddress(body.certificateAddress);
    if (!target) {
      fail("NOT_FOUND", "Certificado não encontrado.");
    }
    // The real authorization gate: the caller must sign THIS certificate's
    // own edition, not just be a registered signer of *some* edition
    // (requireCertifier only proves the latter).
    const isSigner = await isWalletSignerOfEdition(
      target.edition_address,
      session.wallets,
    );
    if (!isSigner) {
      fail("FORBIDDEN", "Você não é signatário desta edição.");
    }

    const syncTargets: SyncTarget[] = [
      { kind: "certificate", address: target.address },
      { kind: "edition", address: target.edition_address },
    ];

    const result = await submitAndSyncTransaction({
      wireBytesBase64: body.wireBytesBase64,
      lastValidBlockHeight,
      syncTargets,
      eventType: "certificate_rejected",
      actor: session.did,
      eventPayload: body.reason ? { reason: body.reason } : undefined,
    });

    if (!result.alreadyProcessed) {
      // reject_request CLOSES the Certificate PDA — confirm the close
      // actually landed for THIS row before flipping its DB-only mirror
      // status, so a confirmed transaction that (for whatever reason)
      // didn't touch this specific certificate can never mark it Rejected.
      const stillOnChain = await certificateExistsOnChain(target.address);
      if (stillOnChain) {
        fail(
          "CERT_STATE_CONFLICT",
          "O certificado ainda existe on-chain; rejeição não confirmada.",
        );
      }
      await markCertificateRejected(target.address, body.reason);
      // The student otherwise only learns from the card's badge — tell them,
      // with the reason. after() + catch: a mail outage never turns a
      // completed rejection into an error (same shape as the revoke route).
      after(() =>
        notifyRejected(target.address, body.reason ?? null).catch(
          (err: unknown) => {
            console.error(
              `[notify] cert-rejected ${target.address} failed:`,
              err,
            );
          },
        ),
      );
    }
    return result;
  });
}

async function notifyRejected(
  address: string,
  reason: string | null,
): Promise<void> {
  const context = await getCertificateNotificationContext(address);
  if (!context?.studentEmail) {
    console.warn(`[notify] cert-rejected ${address}: no student email`);
    return;
  }
  await notifyOnce({
    to: context.studentEmail,
    kind: "cert-rejected",
    locale: DEFAULT_LOCALE,
    refId: address,
    payload: {
      studentName: context.studentName,
      editionName: context.editionName,
      reason,
    },
  });
}
