import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { fail } from "@/lib/errors";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

/** False until NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are set. */
export const dbConfigured = Boolean(SUPABASE_URL && SERVICE_ROLE_KEY);

let serviceClient: SupabaseClient | null = null;

// Exported for apps/web/lib/render/storage.ts — storage uploads need the
// same service-role client; keeping @supabase/supabase-js imported only
// here (not duplicated in lib/render) is what the ESLint import fence enforces.
export function getServiceClient(): SupabaseClient {
  if (!dbConfigured || !SUPABASE_URL || !SERVICE_ROLE_KEY) {
    fail("INTERNAL", "Supabase não configurado.");
  }
  serviceClient ??= createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  return serviceClient;
}

export interface LogEventInput {
  type: string;
  actor?: string;
  certAddress?: string;
  editionAddress?: string;
  txSig?: string;
  payload?: Record<string, unknown>;
}

// M3+ replaces/extends these stubs with real typed mutations (edition
// creation, certificate requests, signing, claim, revoke, ...).

export async function logEvent(input: LogEventInput): Promise<void> {
  const supabase = getServiceClient();
  const { error } = await supabase.from("events").insert({
    type: input.type,
    actor: input.actor,
    cert_address: input.certAddress,
    edition_address: input.editionAddress,
    tx_sig: input.txSig,
    payload: input.payload ?? {},
  });

  if (error) {
    fail("INTERNAL", "Falha ao registrar evento.", {
      detail: error.message,
      retryable: true,
    });
  }
}
