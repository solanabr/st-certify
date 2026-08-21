import "server-only";

// Attendance NFTs: reads for events and claims. RLS is enabled on
// attendance_events/attendance_claims with no anon policies (service-role
// only, same posture as the events table — see 0002_attendance.sql), so
// this reuses the singleton service client from ./mutations rather than an
// anon client. Degrades to null/[] when Supabase isn't configured — for
// getEventByToken specifically, that null makes the caller (GET
// /api/attendance/claim/[token]) throw ATTENDANCE_LINK_INVALID, which
// renders the public claim page's invalid-link state, not a generic
// "unavailable" one — contrast attendance-mutations.ts, which throws
// directly on an unconfigured DB.

import { fail } from "@/lib/errors";
import { isUiMock } from "@/lib/mock/flag";
import {
  mockAttendanceClaimsForOwner,
  mockAttendanceEventById,
  mockAttendanceEventByToken,
  mockAttendanceEvents,
  mockClaimByAssetId,
  mockClaimByEventWallet,
  mockClaimsForEvent,
} from "@/lib/mock/fixtures";
import { dbConfigured, getServiceClient } from "./mutations";
import type {
  AttendanceClaimRow,
  AttendanceClaimStatus,
  AttendanceEventRow,
} from "./types";

/** All attendance events for the creator dashboard, newest first. */
export async function listAttendanceEvents(): Promise<AttendanceEventRow[]> {
  if (isUiMock()) return mockAttendanceEvents();
  if (!dbConfigured) return [];
  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("attendance_events")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) {
    fail("INTERNAL", "Falha ao buscar eventos.", {
      detail: error.message,
      retryable: true,
    });
  }
  return (data ?? []) as AttendanceEventRow[];
}

/** Event lookup by its public claim-link token — the public claim page's entry point. */
export async function getEventByToken(
  token: string,
): Promise<AttendanceEventRow | null> {
  if (isUiMock()) return mockAttendanceEventByToken(token);
  if (!dbConfigured) return null;
  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("attendance_events")
    .select("*")
    .eq("claim_token", token)
    .maybeSingle();
  if (error) {
    fail("INTERNAL", "Falha ao buscar evento.", {
      detail: error.message,
      retryable: true,
    });
  }
  return data as AttendanceEventRow | null;
}

/** Event lookup by id (creator dashboard actions). */
export async function getEventById(
  id: string,
): Promise<AttendanceEventRow | null> {
  if (isUiMock()) return mockAttendanceEventById(id);
  if (!dbConfigured) return null;
  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("attendance_events")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) {
    fail("INTERNAL", "Falha ao buscar evento.", {
      detail: error.message,
      retryable: true,
    });
  }
  return data as AttendanceEventRow | null;
}

/** Existing claim for an (event, wallet) pair, if any — the claim page's idempotency check. */
export async function getClaimByEventWallet(
  eventId: string,
  wallet: string,
): Promise<AttendanceClaimRow | null> {
  if (isUiMock()) return mockClaimByEventWallet(eventId);
  if (!dbConfigured) return null;
  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("attendance_claims")
    .select("*")
    .eq("event_id", eventId)
    .eq("wallet", wallet)
    .maybeSingle();
  if (error) {
    fail("INTERNAL", "Falha ao buscar reivindicação.", {
      detail: error.message,
      retryable: true,
    });
  }
  return data as AttendanceClaimRow | null;
}

/** Composed shape for the public `/nft/[assetId]` share page — event artwork + who claimed it. */
export interface AttendanceClaimPublicView {
  eventName: string;
  eventImageUrl: string;
  eventDate: string;
  wallet: string;
  claimedAt: string;
  txSig: string | null;
  assetId: string;
}

/**
 * EXPLICIT column allowlist for the public claim lookup, joined to the parent
 * event. `claim_token` is deliberately absent: exposing it would leak the
 * creator's still-live claim link to anyone with the public NFT URL. Kept as a
 * named constant so the allowlist is asserted directly in the unit test. Never
 * replace this with `select('*')`.
 */
export const ATTENDANCE_CLAIM_PUBLIC_COLUMNS =
  "wallet, tx_sig, asset_id, created_at, attendance_events(name, image_url, event_date)";

interface ClaimPublicJoinRow {
  wallet: string;
  tx_sig: string | null;
  asset_id: string;
  created_at: string;
  attendance_events:
    | { name: string; image_url: string; event_date: string }
    | { name: string; image_url: string; event_date: string }[]
    | null;
}

/** Public share-page lookup by minted asset id (`/nft/[assetId]`). */
export async function getClaimByAssetId(
  assetId: string,
): Promise<AttendanceClaimPublicView | null> {
  if (isUiMock()) return mockClaimByAssetId(assetId);
  if (!dbConfigured) return null;
  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("attendance_claims")
    .select(ATTENDANCE_CLAIM_PUBLIC_COLUMNS)
    .eq("asset_id", assetId)
    .eq("status", "minted")
    .maybeSingle();
  if (error) {
    fail("INTERNAL", "Falha ao buscar o NFT.", {
      detail: error.message,
      retryable: true,
    });
  }
  if (!data) return null;

  const row = data as unknown as ClaimPublicJoinRow;
  // Supabase returns a to-one FK embed as an object, but the generic typing
  // allows an array — normalize either way.
  const event = Array.isArray(row.attendance_events)
    ? row.attendance_events[0]
    : row.attendance_events;
  if (!event) return null;

  return {
    eventName: event.name,
    eventImageUrl: event.image_url,
    eventDate: event.event_date,
    wallet: row.wallet,
    claimedAt: row.created_at,
    txSig: row.tx_sig,
    assetId: row.asset_id,
  };
}

/** One attendance claim as it appears in the visitor's own "Presenças" list on `/me`. */
export interface AttendanceClaimForOwner {
  eventName: string;
  eventDate: string;
  imageUrl: string;
  assetId: string | null;
  txSig: string | null;
  claimedAt: string;
}

/**
 * EXPLICIT column allowlist for the owner's claim list, same posture as
 * ATTENDANCE_CLAIM_PUBLIC_COLUMNS: `claim_token` must never travel to a
 * browser, so this never becomes `select('*')`. Asserted in the unit test.
 */
export const ATTENDANCE_CLAIM_OWNER_COLUMNS =
  "tx_sig, asset_id, created_at, attendance_events(name, image_url, event_date)";

interface ClaimOwnerJoinRow {
  tx_sig: string | null;
  asset_id: string | null;
  created_at: string;
  attendance_events:
    | { name: string; image_url: string; event_date: string }
    | { name: string; image_url: string; event_date: string }[]
    | null;
}

/**
 * Every minted attendance claim held by the session's wallets, newest first —
 * the "Presenças" section of `/me`. Pending and failed claims are excluded:
 * they have nothing to show and nothing to link to.
 */
export async function listAttendanceClaimsForWallets(
  wallets: string[],
): Promise<AttendanceClaimForOwner[]> {
  if (isUiMock()) return mockAttendanceClaimsForOwner();
  if (!dbConfigured || wallets.length === 0) return [];
  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("attendance_claims")
    .select(ATTENDANCE_CLAIM_OWNER_COLUMNS)
    .in("wallet", wallets)
    .eq("status", "minted")
    .order("created_at", { ascending: false });
  if (error) {
    fail("INTERNAL", "Falha ao buscar suas presenças.", {
      detail: error.message,
      retryable: true,
    });
  }

  const rows = (data ?? []) as unknown as ClaimOwnerJoinRow[];
  return rows.flatMap((row) => {
    const event = Array.isArray(row.attendance_events)
      ? row.attendance_events[0]
      : row.attendance_events;
    // A claim whose event vanished has no name, date or artwork to render.
    if (!event) return [];
    return [
      {
        eventName: event.name,
        eventDate: event.event_date,
        imageUrl: event.image_url,
        assetId: row.asset_id,
        txSig: row.tx_sig,
        claimedAt: row.created_at,
      },
    ];
  });
}

/** One row per claim for the creator's attendee drawer (P1-4). */
export interface AttendanceClaimListRow {
  wallet: string;
  status: AttendanceClaimStatus;
  claimedAt: string;
  txSig: string | null;
  assetId: string | null;
}

/** All claims for an event, newest first — creator-only (attendee drawer + CSV export). */
export async function listClaimsForEvent(
  eventId: string,
): Promise<AttendanceClaimListRow[]> {
  if (isUiMock()) return mockClaimsForEvent();
  if (!dbConfigured) return [];
  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("attendance_claims")
    .select("wallet, status, created_at, tx_sig, asset_id")
    .eq("event_id", eventId)
    .order("created_at", { ascending: false });
  if (error) {
    fail("INTERNAL", "Falha ao buscar participantes.", {
      detail: error.message,
      retryable: true,
    });
  }
  return (data ?? []).map((r) => {
    const row = r as unknown as {
      wallet: string;
      status: AttendanceClaimStatus;
      created_at: string;
      tx_sig: string | null;
      asset_id: string | null;
    };
    return {
      wallet: row.wallet,
      status: row.status,
      claimedAt: row.created_at,
      txSig: row.tx_sig,
      assetId: row.asset_id,
    };
  });
}
