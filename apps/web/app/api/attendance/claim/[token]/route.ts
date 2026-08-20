import { after, NextResponse, type NextRequest } from "next/server";
import { apiRoute } from "@/lib/api";
import { fail } from "@/lib/errors";
import { checkClaimGate } from "@/lib/attendance/gate";
import {
  getClaimByEventWallet,
  getEventByToken,
} from "@/lib/db/attendance-queries";
import { updateClaimAsset } from "@/lib/db/attendance-mutations";
import { resolveAttendanceAssetId } from "@/lib/chain/attendance";
import { BASE58_RE } from "@/lib/attendance/schemas";
import type { AttendanceClaimStatus } from "@/lib/db/types";

/** GET /api/attendance/claim/[token] response shape - Task 13's public claim page. */
export interface ClaimPageInfo {
  name: string;
  description: string;
  imageUrl: string;
  eventDate: string;
  endDate: string | null;
  location: string;
  mintedCount: number;
  maxSupply: number | null;
  state: "open" | "paused" | "ended" | "exhausted";
  callerClaim: {
    status: AttendanceClaimStatus;
    txSig: string | null;
    assetId: string | null;
  } | null;
}

/**
 * Public claim-page info: event details, derived state, and (when a wallet
 * query param is given) that wallet's existing claim, if any. Lazily
 * backfills asset_id once a minted claim's mint transaction finalizes —
 * scheduled via `after()` so this GET never blocks the response on RPC; the
 * response below always carries the claim's current (possibly still null)
 * asset_id.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
): Promise<NextResponse> {
  return apiRoute(async (): Promise<ClaimPageInfo> => {
    const { token } = await params;
    const event = await getEventByToken(token);
    if (!event) {
      fail(
        "ATTENDANCE_LINK_INVALID",
        "Este link de presença não é válido ou foi substituído.",
      );
    }

    const gate = checkClaimGate(event);
    const exhausted =
      event.max_supply !== null && event.minted_count >= event.max_supply;
    const state: ClaimPageInfo["state"] = !event.claim_open
      ? "paused"
      : !gate.ok
        ? "ended"
        : exhausted
          ? "exhausted"
          : "open";

    const walletParam = request.nextUrl.searchParams.get("wallet");
    let callerClaim = null;
    if (walletParam && BASE58_RE.test(walletParam)) {
      const claim = await getClaimByEventWallet(event.id, walletParam);
      if (claim) {
        // Lazy asset-id backfill once the mint transaction finalizes. Runs
        // after the response is sent, so it never delays this GET.
        const txSig = claim.tx_sig;
        if (claim.status === "minted" && claim.asset_id === null && txSig) {
          const claimId = claim.id;
          after(async () => {
            const assetId = await resolveAttendanceAssetId(txSig);
            if (assetId) await updateClaimAsset(claimId, assetId);
          });
        }
        callerClaim = {
          status: claim.status,
          txSig: claim.tx_sig,
          assetId: claim.asset_id,
        };
      }
    }

    return {
      name: event.name,
      description: event.description,
      imageUrl: event.image_url,
      eventDate: event.event_date,
      endDate: event.end_date,
      location: event.location,
      mintedCount: event.minted_count,
      maxSupply: event.max_supply,
      state,
      callerClaim,
    };
  });
}
