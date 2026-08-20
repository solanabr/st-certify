import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { fail } from "@/lib/errors";
import type {
  AdminStats,
  CertificateAdminRow,
  CertificateForOwner,
  CertificateRow,
  EditionRow,
  EditionSignerRow,
  EditionSignerSummary,
  EditionWithSigners,
} from "./types";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

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

let serviceClient: SupabaseClient | null = null;

/**
 * The privileged certificate reads below need columns the anon key is no
 * longer granted: 0003_hardening.sql revokes anon's table-wide SELECT on
 * `certificates` and re-grants only the public /verify projection, so
 * `name_salt`, `owner_did` and `owner_wallet` are unreadable — and, because a
 * column GRANT also governs WHERE clauses, unfilterable — with the anon key.
 * Every caller of those reads is a server route that has already authorized
 * the request (requireUser / requireSysadmin / the claim flow's own checks).
 * The public edition/stats reads on this file keep using the anon client.
 */
function getServiceClient(): SupabaseClient {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    fail("INTERNAL", "Supabase não configurado (service role).");
  }
  serviceClient ??= createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  return serviceClient;
}

function groupSignersByEdition(
  rows: EditionSignerRow[],
): Map<string, EditionSignerSummary[]> {
  const byEdition = new Map<string, EditionSignerSummary[]>();
  for (const row of rows) {
    const list = byEdition.get(row.edition_address) ?? [];
    list.push({
      position: row.position,
      wallet: row.wallet,
      name: row.name,
      role: row.role,
    });
    byEdition.set(row.edition_address, list);
  }
  for (const list of byEdition.values()) {
    list.sort((a, b) => a.position - b.position);
  }
  return byEdition;
}

function toEditionWithSigners(
  edition: EditionRow,
  signers: EditionSignerSummary[],
): EditionWithSigners {
  return {
    address: edition.address,
    slug: edition.slug,
    name: edition.name,
    description: edition.description,
    templateSha256: edition.template_sha256,
    layout: edition.layout,
    specHash: edition.spec_hash,
    status: edition.status,
    maxSupply: edition.max_supply,
    minted: edition.minted,
    requested: edition.requested,
    closed: edition.closed,
    completionDate: edition.completion_date,
    createdAt: edition.created_at,
    signers,
  };
}

async function fetchSignersFor(
  supabase: SupabaseClient,
  editionAddresses: string[],
): Promise<Map<string, EditionSignerSummary[]>> {
  if (editionAddresses.length === 0) {
    return new Map();
  }
  const { data, error } = await supabase
    .from("edition_signers")
    .select("*")
    .in("edition_address", editionAddresses);

  if (error) {
    fail("INTERNAL", "Falha ao buscar signatários da edição.", {
      detail: error.message,
      retryable: true,
    });
  }
  return groupSignersByEdition((data ?? []) as EditionSignerRow[]);
}

/** Open editions for the public /editions browse grid. */
export async function listOpenEditions(): Promise<EditionWithSigners[]> {
  const supabase = getAnonClient();
  const { data, error } = await supabase
    .from("editions")
    .select("*")
    .eq("status", "Open")
    .order("created_at", { ascending: false });

  if (error) {
    fail("INTERNAL", "Falha ao buscar edições.", {
      detail: error.message,
      retryable: true,
    });
  }

  const editions = (data ?? []) as EditionRow[];
  const signersByEdition = await fetchSignersFor(
    supabase,
    editions.map((e) => e.address),
  );
  return editions.map((e) =>
    toEditionWithSigners(e, signersByEdition.get(e.address) ?? []),
  );
}

/** Edition detail by slug (any status — the request form itself gates on Open). */
export async function getEditionBySlug(
  slug: string,
): Promise<EditionWithSigners | null> {
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
  if (!data) {
    return null;
  }

  const edition = data as EditionRow;
  const signersByEdition = await fetchSignersFor(supabase, [edition.address]);
  return toEditionWithSigners(
    edition,
    signersByEdition.get(edition.address) ?? [],
  );
}

/** Edition detail by its on-chain PDA address (admin flows, tx/submit sync). */
export async function getEditionByAddress(
  address: string,
): Promise<EditionWithSigners | null> {
  const supabase = getAnonClient();
  const { data, error } = await supabase
    .from("editions")
    .select("*")
    .eq("address", address)
    .maybeSingle();

  if (error) {
    fail("INTERNAL", "Falha ao buscar edição.", {
      detail: error.message,
      retryable: true,
    });
  }
  if (!data) {
    return null;
  }

  const edition = data as EditionRow;
  const signersByEdition = await fetchSignersFor(supabase, [edition.address]);
  return toEditionWithSigners(
    edition,
    signersByEdition.get(edition.address) ?? [],
  );
}

/** True if `slug` is not already used by an edition (wizard step-1 blur check). */
export async function isSlugAvailable(slug: string): Promise<boolean> {
  const supabase = getAnonClient();
  const { count, error } = await supabase
    .from("editions")
    .select("address", { count: "exact", head: true })
    .eq("slug", slug);

  if (error) {
    fail("INTERNAL", "Falha ao verificar disponibilidade do slug.", {
      detail: error.message,
      retryable: true,
    });
  }
  return (count ?? 0) === 0;
}

/** Full mirror row, including `name_salt` — the claim flow rebuilds the on-chain commitment from it. */
export async function getCertificateByAddress(
  address: string,
): Promise<CertificateRow | null> {
  const supabase = getServiceClient();
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
  return data as CertificateRow | null;
}

/**
 * All certificates owned by the given DID and/or any of the given wallets, for /me.
 *
 * Two `.eq`/`.in` queries merged in memory rather than one `.or()`: PostgREST's
 * `or=` takes a filter *expression*, so interpolating a DID or wallet into it
 * lets any comma, dot or parenthesis in those values rewrite the predicate —
 * and this runs under the service role, where a rewritten predicate would
 * return other people's certificates. `.eq`/`.in` pass their values as encoded
 * parameters, which cannot escape into the grammar.
 */
export async function listCertificatesForOwner(input: {
  did: string;
  wallets: string[];
}): Promise<CertificateForOwner[]> {
  const supabase = getServiceClient();

  const results = await Promise.all([
    supabase.from("certificates").select("*").eq("owner_did", input.did),
    ...(input.wallets.length > 0
      ? [
          supabase
            .from("certificates")
            .select("*")
            .in("owner_wallet", input.wallets),
        ]
      : []),
  ]);

  for (const result of results) {
    if (result.error) {
      fail("INTERNAL", "Falha ao buscar seus certificados.", {
        detail: result.error.message,
        retryable: true,
      });
    }
  }

  // A cert matching both the DID and a wallet appears in both result sets.
  const byAddress = new Map<string, CertificateRow>();
  for (const row of results.flatMap(
    (r) => (r.data ?? []) as CertificateRow[],
  )) {
    byAddress.set(row.address, row);
  }
  const certs = [...byAddress.values()].sort(
    (a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );

  const editionAddresses = Array.from(
    new Set(certs.map((c) => c.edition_address)),
  );
  if (editionAddresses.length === 0) {
    return [];
  }

  const { data: editionRows, error: editionsError } = await supabase
    .from("editions")
    .select("address, name, slug")
    .in("address", editionAddresses);

  if (editionsError) {
    fail("INTERNAL", "Falha ao buscar edições dos certificados.", {
      detail: editionsError.message,
      retryable: true,
    });
  }

  const editionInfo = new Map<string, { name: string; slug: string }>(
    (
      (editionRows ?? []) as Array<{
        address: string;
        name: string;
        slug: string;
      }>
    ).map((e) => [e.address, { name: e.name, slug: e.slug }]),
  );
  const signersByEdition = await fetchSignersFor(supabase, editionAddresses);

  return certs.map((c) => ({
    address: c.address,
    editionAddress: c.edition_address,
    editionName: editionInfo.get(c.edition_address)?.name ?? "Edição",
    editionSlug: editionInfo.get(c.edition_address)?.slug ?? "",
    editionSigners: signersByEdition.get(c.edition_address) ?? [],
    status: c.status,
    signerBitmap: c.signer_bitmap,
    studentName: c.student_name,
    imageUrl: c.image_url,
    metadataUrl: c.metadata_url,
    asset: c.asset,
    certNumber: c.cert_number,
    rejectReason: c.reject_reason,
    revokeReason: c.revoke_reason,
    createdAt: c.created_at,
    completedAt: c.completed_at,
  }));
}

/** True if any of `wallets` is a registered signer on any edition (certifier role check). */
export async function isEditionSignerWallet(
  wallets: string[],
): Promise<boolean> {
  if (!dbConfigured || wallets.length === 0) {
    return false;
  }
  const supabase = getAnonClient();
  const { count, error } = await supabase
    .from("edition_signers")
    .select("wallet", { count: "exact", head: true })
    .in("wallet", wallets);

  // Propagate rather than returning false: a swallowed error is
  // indistinguishable from "this wallet signs nothing", so a transient DB
  // outage used to silently strip every certifier of their role — they would
  // see an empty inbox and a working UI, with nothing to retry. The caller
  // (getSessionUser) can surface a retryable failure instead.
  if (error) {
    fail("INTERNAL", "Falha ao verificar papel de certificador.", {
      detail: error.message,
      retryable: true,
    });
  }
  return (count ?? 0) > 0;
}

/** All editions for the admin Edições tab (every status, newest first). */
export async function listEditionsAdmin(): Promise<EditionWithSigners[]> {
  const supabase = getAnonClient();
  const { data, error } = await supabase
    .from("editions")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    fail("INTERNAL", "Falha ao buscar edições.", {
      detail: error.message,
      retryable: true,
    });
  }

  const editions = (data ?? []) as EditionRow[];
  const signersByEdition = await fetchSignersFor(
    supabase,
    editions.map((e) => e.address),
  );
  return editions.map((e) =>
    toEditionWithSigners(e, signersByEdition.get(e.address) ?? []),
  );
}

/**
 * Certificates for the admin Certificados tab. `edition`/`status` filter
 * server-side (cheap WHERE clauses); free-text name search stays client-side
 * per webapp-architecture's list-page rule (fine under ~1k rows).
 */
export async function listCertificatesAdmin(filters: {
  edition?: string;
  status?: string;
}): Promise<CertificateAdminRow[]> {
  // Service role: the table shows `owner_wallet`, which anon cannot read.
  const supabase = getServiceClient();
  let query = supabase
    .from("certificates")
    .select("*")
    .order("created_at", { ascending: false });

  if (filters.edition) {
    query = query.eq("edition_address", filters.edition);
  }
  if (filters.status) {
    query = query.eq("status", filters.status);
  }

  const { data, error } = await query;
  if (error) {
    fail("INTERNAL", "Falha ao buscar certificados.", {
      detail: error.message,
      retryable: true,
    });
  }

  const certs = (data ?? []) as CertificateRow[];
  const editionAddresses = Array.from(
    new Set(certs.map((c) => c.edition_address)),
  );
  const { data: editionRows, error: editionsError } =
    editionAddresses.length > 0
      ? await supabase
          .from("editions")
          .select("address, name")
          .in("address", editionAddresses)
      : { data: [] as Array<{ address: string; name: string }>, error: null };

  if (editionsError) {
    fail("INTERNAL", "Falha ao buscar edições dos certificados.", {
      detail: editionsError.message,
      retryable: true,
    });
  }

  const editionNames = new Map<string, string>(
    (editionRows as Array<{ address: string; name: string }>).map((e) => [
      e.address,
      e.name,
    ]),
  );

  return certs.map((c) => ({
    address: c.address,
    editionAddress: c.edition_address,
    editionName: editionNames.get(c.edition_address) ?? "Edição",
    ownerWallet: c.owner_wallet,
    studentName: c.student_name,
    status: c.status,
    signerBitmap: c.signer_bitmap,
    certNumber: c.cert_number,
    createdAt: c.created_at,
  }));
}

/** Overview counts for the admin dashboard's 4 stat cards. */
export async function getAdminStats(): Promise<AdminStats> {
  const supabase = getAnonClient();

  const [editions, pending, claimed, revoked] = await Promise.all([
    supabase.from("editions").select("address", { count: "exact", head: true }),
    supabase
      .from("certificates")
      .select("address", { count: "exact", head: true })
      .eq("status", "Requested"),
    supabase
      .from("certificates")
      .select("address", { count: "exact", head: true })
      .eq("status", "Claimed"),
    supabase
      .from("certificates")
      .select("address", { count: "exact", head: true })
      .eq("status", "Revoked"),
  ]);

  for (const result of [editions, pending, claimed, revoked]) {
    if (result.error) {
      fail("INTERNAL", "Falha ao calcular estatísticas.", {
        detail: result.error.message,
        retryable: true,
      });
    }
  }

  return {
    editionsCount: editions.count ?? 0,
    pendingSignaturesCount: pending.count ?? 0,
    claimedCount: claimed.count ?? 0,
    revokedCount: revoked.count ?? 0,
  };
}
