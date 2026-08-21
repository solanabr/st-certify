export const maxDuration = 60;

import { after, type NextResponse } from "next/server";
import { apiRoute } from "@/lib/api";
import { requireCertifier } from "@/lib/auth";
import { fail } from "@/lib/errors";
import { DEFAULT_LOCALE } from "@/lib/i18n/locales";
import {
  submitAndSyncTransaction,
  type SubmitAndSyncResult,
  type SyncTarget,
} from "@/lib/chain/server";
import { getCertificateByAddress } from "@/lib/db/queries";
import { isWalletSignerOfEdition } from "@/lib/db/certificator-queries";
import { getCertificateNotificationContext } from "@/lib/db/notification-queries";
import { notifyOnce } from "@/lib/email/notify";
import type { CertificateRow } from "@/lib/db/types";

/**
 * Submit one signed sign-batch chunk (1..20 `sign_certificate` ixs, one edition).
 * Per-cert authority is enforced ON-CHAIN (the program's signer_index /
 * WrongEdition checks) — a forged sign fails at send. `requireCertifier` gates
 * page access; this route additionally checks the caller signs THIS specific
 * edition and re-derives every sync/event address from the looked-up DB rows
 * (never the request body), so a mismatched body can't produce a misleading
 * event-log entry even though the chain-side authority check already stops a
 * forged sign. The mirror sync refetches each cert so its bitmap/progress
 * advances. Reuses the shared send+confirm+sync+idempotent-event helper.
 */
interface Body {
  wireBytesBase64: string;
  lastValidBlockHeight: string;
  certificateAddresses: string[];
  editionAddress: string;
}

function parseBody(body: unknown): Body {
  const b = body as Partial<Body> | null;
  if (
    !b ||
    typeof b.wireBytesBase64 !== "string" ||
    typeof b.lastValidBlockHeight !== "string" ||
    typeof b.editionAddress !== "string" ||
    !Array.isArray(b.certificateAddresses) ||
    b.certificateAddresses.length === 0 ||
    !b.certificateAddresses.every((a) => typeof a === "string")
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

    const isSigner = await isWalletSignerOfEdition(
      body.editionAddress,
      session.wallets,
    );
    if (!isSigner) {
      fail("FORBIDDEN", "Você não é signatário desta edição.");
    }

    // body.certificateAddresses is only the lookup key set from here on —
    // every sync/event address comes from the looked-up rows, never straight
    // from the request body (mirrors /api/tx/submit's pattern).
    const rows = await Promise.all(
      body.certificateAddresses.map((address) =>
        getCertificateByAddress(address),
      ),
    );
    for (const row of rows) {
      if (!row) {
        fail("NOT_FOUND", "Um ou mais certificados não foram encontrados.");
      }
      if (row.edition_address !== body.editionAddress) {
        fail("FORBIDDEN", "Certificado não pertence à edição informada.");
      }
    }
    const certRows = rows as CertificateRow[];

    const syncTargets: SyncTarget[] = certRows.map((row) => ({
      kind: "certificate",
      address: row.address,
    }));

    const result = await submitAndSyncTransaction({
      wireBytesBase64: body.wireBytesBase64,
      lastValidBlockHeight,
      syncTargets,
      eventType: "certificate_signed",
      actor: session.did,
      eventPayload: {
        editionAddress: body.editionAddress,
        count: certRows.length,
      },
    });

    if (!result.alreadyProcessed) {
      // The sync above refetched each mirror row; certificates whose LAST
      // signature just landed are now FullySigned — the student's cue to
      // claim, which today they only discover by reopening /me. Detected by
      // the before/after status delta so a replayed chunk can't re-notify
      // (and notifyOnce's ledger backstops even that). after() + catch: a
      // mail outage never fails a completed sign batch.
      const before = new Map(certRows.map((row) => [row.address, row.status]));
      after(() =>
        notifyNewlyReady(before).catch((err: unknown) => {
          console.error("[notify] cert-ready sweep failed:", err);
        }),
      );
    }
    return result;
  });
}

async function notifyNewlyReady(
  before: Map<string, CertificateRow["status"]>,
): Promise<void> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  for (const [address, previous] of before) {
    if (previous === "FullySigned") continue;
    const current = await getCertificateByAddress(address);
    if (current?.status !== "FullySigned") continue;
    const context = await getCertificateNotificationContext(address);
    if (!context?.studentEmail) {
      console.warn(`[notify] cert-ready ${address}: no student email`);
      continue;
    }
    await notifyOnce({
      to: context.studentEmail,
      kind: "cert-ready",
      locale: DEFAULT_LOCALE,
      refId: address,
      payload: {
        studentName: context.studentName,
        editionName: context.editionName,
        claimUrl: `${appUrl}/me`,
      },
    });
  }
}
