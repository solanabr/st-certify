export const maxDuration = 60;

import { after, NextResponse, type NextRequest } from "next/server";
import { apiRoute } from "@/lib/api";
import { fail } from "@/lib/errors";
import { getSessionUser } from "@/lib/auth";
import { claimSchema } from "@/lib/attendance/schemas";
import { checkClaimGate } from "@/lib/attendance/gate";
import { resolveProvedWallet } from "@/lib/attendance/proof";
import { getEventByToken } from "@/lib/db/attendance-queries";
import {
  consumeNonce,
  markClaimMintedWithRetry,
  releaseClaim,
  reserveClaim,
  updateClaimAsset,
} from "@/lib/db/attendance-mutations";
import {
  mintAttendanceAsset,
  resolveAttendanceAssetId,
} from "@/lib/chain/attendance";

/** POST /api/attendance/claim response shape - Task 13's public claim page. */
export interface ClaimResult {
  status: "minted" | "already";
  txSig: string;
  assetId: string | null;
}

/**
 * Claims one attendance NFT for the caller's wallet: validates the claim
 * window, proves wallet ownership, atomically reserves a slot, then mints
 * (operator-subsidized) and records the result. A mint failure releases the
 * reserved slot so a retry can take it; a failure to record a mint that did
 * happen never does.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  return apiRoute(async (): Promise<ClaimResult> => {
    const parsed = claimSchema.safeParse(
      await request.json().catch(() => null),
    );
    if (!parsed.success) {
      fail("VALIDATION", "Dados inválidos.", { detail: parsed.error.message });
    }
    const input = parsed.data;

    const event = await getEventByToken(input.token);
    if (!event) {
      fail(
        "ATTENDANCE_LINK_INVALID",
        "Este link de presença não é válido ou foi substituído.",
      );
    }

    // Gate is checked once, here, against the event row fetched above — it
    // is NOT re-checked inside the SQL reservation below. A creator pause
    // (claim_open → false) or a deadline passing between this check and the
    // reserveClaim() call a few lines down can therefore admit one
    // straggler request that was already past this point. Accepted: the
    // window is a single request's worth of latency, and supply/one-per-
    // wallet are still enforced atomically in SQL regardless.
    const gate = checkClaimGate(event);
    if (!gate.ok) fail(gate.code, gate.message);

    const wallet = await resolveProvedWallet(input, "attendance-claim", {
      consumeNonce,
      getSessionWallets: async () => (await getSessionUser())?.wallets ?? [],
      expectedDomain: new URL(request.url).host,
    });

    const reserved = await reserveClaim(event.id, wallet);
    if (reserved.outcome === "already_claimed") {
      return {
        status: "already" as const,
        txSig: reserved.existingTxSig ?? "",
        assetId: null,
      };
    }
    if (reserved.outcome === "exhausted") {
      fail(
        "ATTENDANCE_SUPPLY_EXHAUSTED",
        "Todas as vagas deste evento já foram reivindicadas.",
      );
    }
    if (reserved.outcome === "in_flight") {
      fail(
        "CONFLICT",
        "Emissão em andamento para esta carteira. Aguarde alguns segundos e tente novamente.",
        { retryable: true },
      );
    }

    // Outcome is 'reserved' or 'retry': we now hold the slot.
    const claimId = reserved.claimId;
    if (!claimId) fail("INTERNAL", "Reserva inconsistente.");

    // This try wraps the mint and nothing else. Releasing the slot is only
    // correct while nothing has been minted — doing it after a successful
    // mint would hand the slot back and let the participant's retry mint a
    // second asset at the operator's expense.
    let txSig: string;
    try {
      ({ txSig } = await mintAttendanceAsset({
        coreCollection: event.collection_address,
        owner: wallet,
        name: event.name,
        metadataUri: event.metadata_uri,
      }));
    } catch (err) {
      await releaseClaim(claimId).catch(() => {
        // Release must never mask the mint error; a stuck 'pending' row
        // resolves on the next retry via the 'retry' outcome.
      });
      fail(
        "CHAIN_PROGRAM_ERROR",
        "Falha ao emitir o NFT de presença. Tente novamente.",
        {
          retryable: true,
          detail: err instanceof Error ? err.message : String(err),
        },
      );
    }

    // Past this point the asset is the participant's whatever happens next,
    // so the response reports the mint. markClaimMintedWithRetry absorbs and
    // logs its own failure rather than throwing an error that would invite a
    // duplicate claim; the row is then repaired from the reconcile log.
    await markClaimMintedWithRetry({ claimId, txSig, wallet });
    after(async () => {
      const assetId = await resolveAttendanceAssetId(txSig);
      if (assetId) await updateClaimAsset(claimId, assetId);
    });
    return { status: "minted" as const, txSig, assetId: null };
  });
}
