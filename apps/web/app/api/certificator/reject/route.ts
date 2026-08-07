import type { NextResponse } from "next/server";
import { apiRoute } from "@/lib/api";
import { requireCertifier } from "@/lib/auth";
import { fail } from "@/lib/errors";
import {
  submitAndSyncTransaction,
  type SubmitAndSyncResult,
  type SyncTarget,
} from "@/lib/chain/server";
import { markCertificateRejected } from "@/lib/db/certificator-mutations";

/**
 * Submit a signed `reject_request` (merged reject+close): the on-chain close +
 * address-targeted rent refund to the student, plus an off-chain reason in the
 * event log. Because the PDA is closed, the shared chain-sync can't reflect it —
 * we additionally flip the mirror row to the DB-only "Rejected" state so it
 * leaves every signer's inbox. Program enforces signer-or-admin authority.
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

    const syncTargets: SyncTarget[] = [
      { kind: "certificate", address: body.certificateAddress },
      { kind: "edition", address: body.editionAddress },
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
      await markCertificateRejected(body.certificateAddress, body.reason);
    }
    return result;
  });
}
