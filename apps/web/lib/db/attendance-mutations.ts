import "server-only";

// Attendance NFTs: service-role writes for nonces, events, and claims.
// Every function throws when Supabase isn't configured — unlike
// attendance-queries.ts's public-degrade-to-null pattern, writes must never
// silently no-op. Reuses the singleton client from ./mutations rather than
// opening a second connection (lib/db/** is exempt from the @supabase fence).

import { fail } from "@/lib/errors";
import { generateNonce } from "@/lib/attendance/token";
import { dbConfigured, getServiceClient } from "./mutations";
import type { AttendanceEventRow, ReserveOutcome } from "./types";

// ---------------------------------------------------------------------------
// nonces (SIWS-style wallet-proof challenges, see lib/attendance/proof.ts)
// ---------------------------------------------------------------------------

const NONCE_TTL_MS = 5 * 60 * 1000;

export async function createNonce(
  wallet: string,
  purpose: string,
): Promise<{ nonce: string; issuedAt: string }> {
  if (!dbConfigured) fail("INTERNAL", "Supabase não configurado.");
  const supabase = getServiceClient();
  const nonce = generateNonce();
  const issuedAt = new Date().toISOString();
  const { error } = await supabase.from("attendance_nonces").insert({
    nonce,
    wallet,
    purpose,
    expires_at: new Date(Date.now() + NONCE_TTL_MS).toISOString(),
  });
  if (error) {
    fail("INTERNAL", "Falha ao emitir nonce.", {
      detail: error.message,
      retryable: true,
    });
  }
  return { nonce, issuedAt };
}

/** Single-use: flips used_at exactly once, only while unexpired and wallet-bound. */
export async function consumeNonce(
  nonce: string,
  wallet: string,
): Promise<boolean> {
  if (!dbConfigured) fail("INTERNAL", "Supabase não configurado.");
  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("attendance_nonces")
    .update({ used_at: new Date().toISOString() })
    .eq("nonce", nonce)
    .eq("wallet", wallet)
    .is("used_at", null)
    .gt("expires_at", new Date().toISOString())
    .select("nonce");
  if (error) {
    fail("INTERNAL", "Falha ao validar nonce.", {
      detail: error.message,
      retryable: true,
    });
  }
  return (data ?? []).length === 1;
}

// ---------------------------------------------------------------------------
// events
// ---------------------------------------------------------------------------

export interface InsertEventInput {
  /** Pre-generated UUID when the metadata JSON must reference it (see Task 9). */
  id?: string;
  name: string;
  description: string;
  imageUrl: string;
  metadataUri: string;
  collectionAddress: string;
  eventDate: string;
  maxSupply: number | null;
  claimDeadline: string | null;
  claimToken: string;
  createdByWallet: string;
}

export async function insertEvent(
  input: InsertEventInput,
): Promise<AttendanceEventRow> {
  if (!dbConfigured) fail("INTERNAL", "Supabase não configurado.");
  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("attendance_events")
    .insert({
      ...(input.id ? { id: input.id } : {}),
      name: input.name,
      description: input.description,
      image_url: input.imageUrl,
      metadata_uri: input.metadataUri,
      collection_address: input.collectionAddress,
      event_date: input.eventDate,
      max_supply: input.maxSupply,
      claim_deadline: input.claimDeadline,
      claim_token: input.claimToken,
      created_by_wallet: input.createdByWallet,
    })
    .select()
    .single();
  if (error) {
    fail("INTERNAL", "Falha ao criar evento.", {
      detail: error.message,
      retryable: true,
    });
  }
  return data as AttendanceEventRow;
}

/** Toggles the event's claim window (creator dashboard pause/resume action). */
export async function setClaimOpen(
  id: string,
  open: boolean,
): Promise<AttendanceEventRow> {
  if (!dbConfigured) fail("INTERNAL", "Supabase não configurado.");
  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("attendance_events")
    .update({ claim_open: open })
    .eq("id", id)
    .select()
    .single();
  if (error) {
    fail("INTERNAL", "Falha ao atualizar reivindicações do evento.", {
      detail: error.message,
      retryable: true,
    });
  }
  return data as AttendanceEventRow;
}

/** Replaces the public claim-link token (creator dashboard rotate action — invalidates the old link). */
export async function rotateClaimToken(
  id: string,
  token: string,
): Promise<AttendanceEventRow> {
  if (!dbConfigured) fail("INTERNAL", "Supabase não configurado.");
  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("attendance_events")
    .update({ claim_token: token })
    .eq("id", id)
    .select()
    .single();
  if (error) {
    fail("INTERNAL", "Falha ao rotacionar token de reivindicação.", {
      detail: error.message,
      retryable: true,
    });
  }
  return data as AttendanceEventRow;
}

// ---------------------------------------------------------------------------
// claims
// ---------------------------------------------------------------------------

export interface ReserveResult {
  outcome: ReserveOutcome;
  claimId: string | null;
  existingTxSig: string | null;
}

/**
 * Atomic slot reservation via the SQL function (see 0002_attendance.sql).
 * A concurrent duplicate insert (23505) means another request won the row —
 * calling again returns its outcome. A 'pending' row inside its 90s
 * `reserved_at` window yields 'in_flight' (caller must not mint — another
 * request is likely minting right now); past that window it's treated as a
 * crashed attempt and yields 'retry' (caller mints again).
 */
export async function reserveClaim(
  eventId: string,
  wallet: string,
): Promise<ReserveResult> {
  if (!dbConfigured) fail("INTERNAL", "Supabase não configurado.");
  const supabase = getServiceClient();
  const call = () =>
    supabase.rpc("attendance_reserve_claim", {
      p_event_id: eventId,
      p_wallet: wallet,
    });
  let { data, error } = await call();
  if (error?.code === "23505") ({ data, error } = await call());
  if (error || !data?.[0]) {
    fail("INTERNAL", "Falha ao reservar reivindicação.", {
      detail: error?.message,
      retryable: true,
    });
  }
  const row = data[0] as {
    outcome: ReserveOutcome;
    claim_id: string | null;
    existing_tx_sig: string | null;
  };
  return {
    outcome: row.outcome,
    claimId: row.claim_id,
    existingTxSig: row.existing_tx_sig,
  };
}

/** Records a confirmed mint (called right after the Bubblegum mint tx confirms). */
export async function markClaimMinted(
  claimId: string,
  txSig: string,
): Promise<void> {
  if (!dbConfigured) fail("INTERNAL", "Supabase não configurado.");
  const supabase = getServiceClient();
  const { error } = await supabase
    .from("attendance_claims")
    .update({ status: "minted", tx_sig: txSig })
    .eq("id", claimId);
  if (error) {
    fail("INTERNAL", "Falha ao registrar emissão.", {
      detail: error.message,
      retryable: true,
    });
  }
}

export interface MarkMintedInput {
  claimId: string;
  txSig: string;
  /** Carried only for the reconciliation log — the update itself keys on claimId. */
  wallet: string;
  assetId?: string | null;
}

interface RetryOptions {
  attempts?: number;
  delayMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

const sleep = (ms: number): Promise<void> =>
  new Promise((r) => setTimeout(r, ms));

/**
 * markClaimMinted retried with backoff (same loop shape as retryFetch in
 * lib/chain/umi.ts). Deliberately never throws: the NFT is already on-chain
 * when this runs, and a caller that mistook a bookkeeping failure for a mint
 * failure would release the slot and let the participant's retry mint a
 * second, operator-paid asset. Returns false once the attempts are spent,
 * having logged a `[attendance:reconcile]` line for manual repair of the row.
 */
export async function markClaimMintedWithRetry(
  input: MarkMintedInput,
  opts: RetryOptions = {},
): Promise<boolean> {
  const { attempts = 4, delayMs = 250, sleep: wait = sleep } = opts;
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      await markClaimMinted(input.claimId, input.txSig);
      return true;
    } catch (err) {
      last = err;
      if (i < attempts - 1) await wait(delayMs * 2 ** i);
    }
  }
  console.error(
    `[attendance:reconcile] mint confirmed on-chain but not recorded — ` +
      `claimId=${input.claimId} txSig=${input.txSig} ` +
      `assetId=${input.assetId ?? "unresolved"} wallet=${input.wallet}:`,
    last instanceof Error ? last.message : String(last),
  );
  return false;
}

/** Marks a pending claim failed and frees its capacity slot after a failed mint. */
export async function releaseClaim(claimId: string): Promise<void> {
  if (!dbConfigured) fail("INTERNAL", "Supabase não configurado.");
  const supabase = getServiceClient();
  const { error } = await supabase.rpc("attendance_release_claim", {
    p_claim_id: claimId,
  });
  if (error) {
    fail("INTERNAL", "Falha ao liberar reivindicação.", {
      detail: error.message,
      retryable: true,
    });
  }
}

/** Persists the minted Core asset's address on the claim row. */
export async function updateClaimAsset(
  claimId: string,
  assetId: string,
): Promise<void> {
  if (!dbConfigured) fail("INTERNAL", "Supabase não configurado.");
  const supabase = getServiceClient();
  const { error } = await supabase
    .from("attendance_claims")
    .update({ asset_id: assetId })
    .eq("id", claimId);
  if (error) {
    fail("INTERNAL", "Falha ao atualizar asset da reivindicação.", {
      detail: error.message,
      retryable: true,
    });
  }
}
