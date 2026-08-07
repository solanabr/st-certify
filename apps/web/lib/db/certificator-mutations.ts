import "server-only";

// Certificator (M4) service-role write: flip a rejected certificate's mirror row
// to the DB-only "Rejected" state. Needed because reject_request CLOSES the PDA,
// so the shared chain-sync (which reads the account) can't reflect it — the row
// would otherwise stay "Requested" and linger in every signer's inbox.
// Separate file under lib/db/** (satisfies the @supabase fence; collision-free
// with M3's mutations.ts).

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
 * Marks a certificate rejected in the mirror after its `reject_request` tx
 * confirms. Best-effort + degrades to a no-op when Supabase env is absent — the
 * on-chain close is the source of truth; this just keeps the inbox/verify mirror
 * consistent. Returns true if a row was updated.
 */
export async function markCertificateRejected(
  certificateAddress: string,
  reason: string | undefined,
): Promise<boolean> {
  const supabase = service();
  if (!supabase) return false;
  const { error } = await supabase
    .from("certificates")
    .update({
      status: "Rejected",
      reject_reason: reason ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("address", certificateAddress);
  return !error;
}
