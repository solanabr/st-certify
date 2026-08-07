import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { fail } from "@/lib/errors";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/** False until NEXT_PUBLIC_SUPABASE_URL is set (pending, see .env). */
export const dbConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

let anonClient: SupabaseClient | null = null;

function getAnonClient(): SupabaseClient {
  if (!dbConfigured || !SUPABASE_URL || !SUPABASE_ANON_KEY) {
    fail("INTERNAL", "Supabase não configurado.");
  }
  anonClient ??= createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  return anonClient;
}

// M3+ replaces/extends these stubs with real typed queries (editions,
// certificates, edition_signers, ...) as those features are built.

export async function getEditionBySlug(slug: string): Promise<unknown> {
  const supabase = getAnonClient();
  const { data, error } = await supabase
    .from("editions")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();

  if (error) {
    fail("INTERNAL", "Falha ao buscar edição.", {
      detail: error.message,
      retryable: true,
    });
  }

  return data;
}

export async function getCertificateByAddress(
  address: string,
): Promise<unknown> {
  const supabase = getAnonClient();
  const { data, error } = await supabase
    .from("certificates")
    .select("*")
    .eq("address", address)
    .maybeSingle();

  if (error) {
    fail("INTERNAL", "Falha ao buscar certificado.", {
      detail: error.message,
      retryable: true,
    });
  }

  return data;
}
