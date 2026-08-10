import type { NextResponse } from "next/server";
import { apiRoute } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { fail } from "@/lib/errors";
import { getCertificateByAddress } from "@/lib/db/queries";
import { submitAndSyncTransaction, type SyncTarget } from "@/lib/chain/server";

/**
 * The single write choke point for client-signed transactions (plan
 * §"Sync"): decode -> send+confirm -> refetch affected accounts -> mirror ->
 * idempotent event log. `kind` is a narrow, server-validated enum (not a
 * free-form client-supplied event type) so the audit feed can't be spoofed;
 * each kind's syncTargets are derived from a DB row the caller is
 * authorized to touch, never trusted verbatim from the request body.
 */

interface SubmitRequestBody {
  wireBytesBase64: string;
  lastValidBlockHeight: string;
  kind: "request_certificate";
  certificateAddress: string;
}

export interface SubmitResponse {
  signature: string;
  alreadyProcessed: boolean;
}

function isSubmitRequestBody(body: unknown): body is SubmitRequestBody {
  const b = body as Partial<SubmitRequestBody> | null;
  return (
    !!b &&
    typeof b.wireBytesBase64 === "string" &&
    typeof b.lastValidBlockHeight === "string" &&
    typeof b.certificateAddress === "string" &&
    b.kind === "request_certificate"
  );
}

function parseBody(body: unknown): SubmitRequestBody {
  if (!isSubmitRequestBody(body)) {
    fail("VALIDATION", "Requisição inválida.");
  }
  return body;
}

export async function POST(request: Request): Promise<NextResponse> {
  return apiRoute(async (): Promise<SubmitResponse> => {
    const session = await requireUser();
    const raw: unknown = await request.json().catch(() => null);
    const body = parseBody(raw);

    let lastValidBlockHeight: bigint;
    try {
      lastValidBlockHeight = BigInt(body.lastValidBlockHeight);
    } catch {
      fail("VALIDATION", "lastValidBlockHeight inválido.");
    }

    const pending = await getCertificateByAddress(body.certificateAddress);
    if (!pending || pending.owner_did !== session.did) {
      fail("FORBIDDEN", "Esta solicitação não pertence à sua conta.");
    }

    // Both addresses come from `pending` (the row the ownership check above
    // just verified), never straight from the request body — even though
    // `body.certificateAddress` was the lookup key, the value that actually
    // reaches submitAndSyncTransaction is the DB row's own column.
    const syncTargets: SyncTarget[] = [
      { kind: "certificate", address: pending.address },
      { kind: "edition", address: pending.edition_address },
    ];

    return submitAndSyncTransaction({
      wireBytesBase64: body.wireBytesBase64,
      lastValidBlockHeight,
      syncTargets,
      eventType: "certificate_requested",
      actor: session.did,
      certificateTxField: "request_tx",
    });
  });
}
