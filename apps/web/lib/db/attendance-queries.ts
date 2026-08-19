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
import { dbConfigured, getServiceClient } from "./mutations";
import type { AttendanceClaimRow, AttendanceEventRow } from "./types";

/** All attendance events for the creator dashboard, newest first. */
export async function listAttendanceEvents(): Promise<AttendanceEventRow[]> {
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
