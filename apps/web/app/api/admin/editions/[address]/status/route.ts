import type { NextResponse } from "next/server";
import { apiRoute } from "@/lib/api";
import { requireSysadmin } from "@/lib/auth";
import { fail } from "@/lib/errors";
import {
  setEditionStatusOnChain,
  type SubmitAndSyncResult,
} from "@/lib/chain/server";

const VALID_STATUSES = ["Paused", "Open", "Closed"] as const;
type EditionStatusName = (typeof VALID_STATUSES)[number];

function isValidStatus(value: unknown): value is EditionStatusName {
  return (
    typeof value === "string" &&
    (VALID_STATUSES as readonly string[]).includes(value)
  );
}

/** Abrir/Pausar row actions on the admin Edições tab (also closes, though no UI wires that path yet). */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ address: string }> },
): Promise<NextResponse> {
  return apiRoute(async (): Promise<SubmitAndSyncResult> => {
    const session = await requireSysadmin();
    const { address } = await params;

    const body: unknown = await request.json().catch(() => null);
    const status = (body as { status?: unknown } | null)?.status;
    if (!isValidStatus(status)) {
      fail("VALIDATION", "Status inválido.");
    }

    return setEditionStatusOnChain({
      editionAddress: address,
      status,
      actor: session.did,
    });
  });
}
