import type { NextResponse } from "next/server";
import { apiRoute } from "@/lib/api";
import { requireCertifier } from "@/lib/auth";
import { fail } from "@/lib/errors";
import {
  submitAndSyncTransaction,
  type SubmitAndSyncResult,
  type SyncTarget,
} from "@/lib/chain/server";

/**
 * Submit one signed sign-batch chunk (1..20 `sign_certificate` ixs, one edition).
 * Per-cert authority is enforced ON-CHAIN (the program's signer_index /
 * WrongEdition checks) — a forged sign fails at send. `requireCertifier` gates
 * page access; the mirror sync refetches each cert so its bitmap/progress
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

    const syncTargets: SyncTarget[] = body.certificateAddresses.map(
      (address) => ({
        kind: "certificate",
        address,
      }),
    );

    return submitAndSyncTransaction({
      wireBytesBase64: body.wireBytesBase64,
      lastValidBlockHeight,
      syncTargets,
      eventType: "certificate_signed",
      actor: session.did,
      eventPayload: {
        editionAddress: body.editionAddress,
        count: body.certificateAddresses.length,
      },
    });
  });
}
