import "server-only";

// M5 claim/mint/revoke service-role writes (+ the mint-idempotency event read).
// Separate file under lib/db/** so the @supabase fence is satisfied and it stays
// collision-free with M3's mutations.ts / M4's certificator-mutations.ts. All
// writes degrade to a no-op when Supabase env is absent — the chain is the
// source of truth; these keep the off-chain mirror consistent for /me + /verify.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const serviceConfigured = Boolean(SUPABASE_URL && SERVICE_ROLE_KEY);

let serviceClient: SupabaseClient | null = null;
function service(): SupabaseClient | null {
  if (!serviceConfigured || !SUPABASE_URL || !SERVICE_ROLE_KEY) return null;
  serviceClient ??= createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  return serviceClient;
}

/**
 * Persists the rendered artifact's content-addressed coordinates on the cert
 * mirror row (the columns `syncCertificateMirrorFromChain` deliberately never
 * touches). Written at claim-prepare so /me can show the PNG the instant the
 * claim confirms. Idempotent (re-render ⇒ same sha ⇒ same URLs).
 */
export async function setCertificateArtifact(
  certificateAddress: string,
  input: { sha256: string; imageUrl: string; metadataUrl: string },
): Promise<boolean> {
  const supabase = service();
  if (!supabase) return false;
  const { error } = await supabase
    .from("certificates")
    .update({
      sha256: input.sha256,
      image_url: input.imageUrl,
      metadata_url: input.metadataUrl,
      updated_at: new Date().toISOString(),
    })
    .eq("address", certificateAddress);
  return !error;
}

/** Stamps `completed_at` once a claim confirms (status/cert_number come from the chain sync). */
export async function markCertificateClaimed(
  certificateAddress: string,
  completedAt: string,
): Promise<boolean> {
  const supabase = service();
  if (!supabase) return false;
  const { error } = await supabase
    .from("certificates")
    .update({ completed_at: completedAt, updated_at: new Date().toISOString() })
    .eq("address", certificateAddress);
  return !error;
}

/**
 * Records the revocation reason after `revoke_certificate` confirms (status +
 * revoke_tx come from the chain sync). Best-effort + no-op when unconfigured.
 */
export async function markCertificateRevoked(
  certificateAddress: string,
  reason: string,
): Promise<boolean> {
  const supabase = service();
  if (!supabase) return false;
  const { error } = await supabase
    .from("certificates")
    .update({
      revoke_reason: reason,
      updated_at: new Date().toISOString(),
    })
    .eq("address", certificateAddress);
  return !error;
}

/**
 * The mint idempotency read: the asset address from a prior
 * `certificate_asset_minted` event for this cert, or null. Lets claim-submit be
 * re-POSTed after a partial failure (mint succeeded, record_asset didn't)
 * without minting a second asset. Uses the service client because `events` has
 * no anon SELECT policy.
 */
export async function getMintedAssetFromEvents(
  certificateAddress: string,
): Promise<string | null> {
  const supabase = service();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("events")
    .select("payload")
    .eq("cert_address", certificateAddress)
    .eq("type", "certificate_asset_minted")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  const payload = (data as { payload?: { asset?: unknown } }).payload;
  return typeof payload?.asset === "string" ? payload.asset : null;
}
