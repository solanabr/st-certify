import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { fail } from "@/lib/errors";
import { verifyCode } from "@/lib/verify-code";
import { isUiMock } from "@/lib/mock/flag";
import { mockAdminEvents } from "@/lib/mock/fixtures";
import type {
  CertificateStatusValue,
  EditionSignerRow,
  EditionStatusValue,
  EventRow,
} from "./types";

// Narrow structural shapes of @certify/client's DecodedCertificate/DecodedEdition
// — lib/db/** is fenced off from importing @certify/client itself (even
// type-only), so lib/chain/server.ts's real decoded objects are passed here
// and just need to satisfy these fields structurally.
interface ChainCertificateSnapshot {
  status: CertificateStatusValue;
  signedMask: number;
  certNumber: bigint;
  asset: string | null;
  /** 32 zero bytes until `claim_certificate` commits the artifact. */
  artifactHash?: Uint8Array;
}

interface ChainEditionSnapshot {
  name: string;
  status: EditionStatusValue;
  maxSupply: bigint;
  certsClaimed: bigint;
  certsRequested: bigint;
  certsClosed: bigint;
  specHash: Uint8Array;
}

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

// ---------------------------------------------------------------------------
// profiles
// ---------------------------------------------------------------------------

export interface UpsertProfileInput {
  did: string;
  email: string | null;
  wallets: string[];
}

/** Best-effort: swallows a not-yet-configured DB rather than failing login. */
export async function upsertProfile(input: UpsertProfileInput): Promise<void> {
  if (!dbConfigured) {
    return;
  }
  const supabase = getServiceClient();
  const { error } = await supabase.from("profiles").upsert(
    {
      did: input.did,
      email: input.email,
      wallets: input.wallets,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "did" },
  );
  if (error) {
    fail("INTERNAL", "Falha ao sincronizar perfil.", {
      detail: error.message,
      retryable: true,
    });
  }
}

// ---------------------------------------------------------------------------
// events (also the tx/submit idempotency ledger — every processed signature
// gets exactly one event row with `tx_sig` set)
// ---------------------------------------------------------------------------

export interface LogEventInput {
  type: string;
  actor?: string;
  certAddress?: string;
  editionAddress?: string;
  txSig?: string;
  payload?: Record<string, unknown>;
}

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

  // 23505 = the event is already logged: migration 0003 adds partial unique
  // indexes on events.tx_sig and on (cert_address) for certificate_asset_minted,
  // making this ledger idempotent. The tx/mint has already landed on-chain by
  // the time this row is written, so a duplicate carries no new information —
  // absorb it as success instead of raising a 500 that would make the caller
  // retry a completed operation. (onConflict upsert can't be used: the indexes
  // are partial and supabase-js can't express the WHERE predicate as an arbiter.)
  if (error && error.code !== "23505") {
    fail("INTERNAL", "Falha ao registrar evento.", {
      detail: error.message,
      retryable: true,
    });
  }
}

/** True if `signature` already has an event row — the tx/submit idempotency guard. */
export async function hasProcessedSignature(
  signature: string,
): Promise<boolean> {
  const supabase = getServiceClient();
  const { count, error } = await supabase
    .from("events")
    .select("id", { count: "exact", head: true })
    .eq("tx_sig", signature);

  if (error) {
    fail("INTERNAL", "Falha ao verificar transação processada.", {
      detail: error.message,
      retryable: true,
    });
  }
  return (count ?? 0) > 0;
}

/** Recent audit events for the admin overview feed (events is service-role-only, no anon SELECT policy). */
export async function listRecentEventsForAdmin(
  limit = 20,
): Promise<EventRow[]> {
  if (isUiMock()) return mockAdminEvents(limit);
  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("events")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    fail("INTERNAL", "Falha ao buscar eventos recentes.", {
      detail: error.message,
      retryable: true,
    });
  }
  return (data ?? []) as EventRow[];
}

// ---------------------------------------------------------------------------
// editions
// ---------------------------------------------------------------------------

export interface InsertEditionMirrorInput {
  address: string;
  slug: string;
  name: string;
  description: string | null;
  templateSha256: string;
  layout: Record<string, unknown>;
  specHash: string;
  maxSupply: bigint;
  completionDate: string | null;
  txSig: string;
}

/** Full insert, used once right after `create_edition` confirms. */
export async function insertEditionMirror(
  input: InsertEditionMirrorInput,
): Promise<void> {
  const supabase = getServiceClient();
  const { error } = await supabase.from("editions").insert({
    address: input.address,
    slug: input.slug,
    name: input.name,
    description: input.description,
    template_sha256: input.templateSha256,
    layout: input.layout,
    spec_hash: input.specHash,
    max_supply: Number(input.maxSupply),
    minted: 0,
    requested: 0,
    closed: 0,
    status: "Paused",
    completion_date: input.completionDate,
    tx_sig: input.txSig,
  });

  if (error) {
    fail("INTERNAL", "Falha ao registrar edição.", {
      detail: error.message,
      retryable: true,
    });
  }
}

export interface EditionSignerInsertInput {
  editionAddress: string;
  position: number;
  wallet: string;
  name: string;
  role: string | null;
}

export async function insertEditionSigners(
  signers: EditionSignerInsertInput[],
): Promise<void> {
  if (signers.length === 0) {
    return;
  }
  const supabase = getServiceClient();
  const rows: Omit<EditionSignerRow, "signature_image_url">[] = signers.map(
    (s) => ({
      edition_address: s.editionAddress,
      position: s.position,
      wallet: s.wallet,
      name: s.name,
      role: s.role,
    }),
  );
  const { error } = await supabase.from("edition_signers").insert(rows);

  if (error) {
    fail("INTERNAL", "Falha ao registrar signatários da edição.", {
      detail: error.message,
      retryable: true,
    });
  }
}

/**
 * Narrow update of ONLY the chain-derived edition columns — safe to call
 * repeatedly (e.g. after any future edition-touching tx) without clobbering
 * the off-chain-only columns (slug, description, layout, template_sha256)
 * set once at `insertEditionMirror` time.
 */
export async function syncEditionMirrorFromChain(
  address: string,
  decoded: ChainEditionSnapshot,
  txSig?: string,
): Promise<void> {
  const supabase = getServiceClient();
  const { error } = await supabase
    .from("editions")
    .update({
      name: decoded.name,
      status: decoded.status,
      max_supply: Number(decoded.maxSupply),
      minted: Number(decoded.certsClaimed),
      requested: Number(decoded.certsRequested),
      closed: Number(decoded.certsClosed),
      spec_hash: Buffer.from(decoded.specHash).toString("hex"),
      ...(txSig ? { tx_sig: txSig } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("address", address);

  if (error) {
    fail("INTERNAL", "Falha ao sincronizar edição.", {
      detail: error.message,
      retryable: true,
    });
  }
}

// ---------------------------------------------------------------------------
// certificates
// ---------------------------------------------------------------------------

export interface InsertPendingCertificateInput {
  address: string;
  editionAddress: string;
  ownerWallet: string;
  ownerDid: string;
  studentName: string;
  nameSalt: string;
}

/**
 * Inserts the pending row BEFORE the on-chain `request_certificate` tx is
 * even sent — this is where the plaintext name + salt (LGPD-erasable layer)
 * first land. `syncCertificateMirrorFromChain` fills in the chain-derived
 * columns once the tx confirms.
 *
 * `verify_code` is written here, at the row's only insert point, so every
 * certificate has one from birth and the backfill script stays a one-shot for
 * pre-overhaul rows.
 */
export async function insertPendingCertificate(
  input: InsertPendingCertificateInput,
): Promise<void> {
  const supabase = getServiceClient();
  const { error } = await supabase.from("certificates").insert({
    address: input.address,
    edition_address: input.editionAddress,
    owner_wallet: input.ownerWallet,
    owner_did: input.ownerDid,
    student_name: input.studentName,
    name_salt: input.nameSalt,
    status: "Requested" satisfies CertificateStatusValue,
    signer_bitmap: 0,
    verify_code: verifyCode(input.address),
  });

  if (error) {
    fail("INTERNAL", "Falha ao registrar solicitação.", {
      detail: error.message,
      retryable: true,
    });
  }
}

export interface CertificateTxPatch {
  request_tx?: string;
  claim_tx?: string;
  revoke_tx?: string;
}

/**
 * Hex of the artifact hash the chain actually holds, or null while it holds
 * none — the account carries 32 zero bytes until `claim_certificate` commits
 * one, and a zero hash written into the mirror would read as a real one.
 */
function committedArtifactSha256(hash: Uint8Array | undefined): string | null {
  if (!hash || hash.length !== 32 || hash.every((byte) => byte === 0)) {
    return null;
  }
  return Buffer.from(hash).toString("hex");
}

/**
 * Narrow update of ONLY the chain-derived certificate columns — never
 * touches student_name/name_salt (off-chain-only) or signer_txs (owned by
 * the M4 mass-sign flow).
 *
 * `sha256` is chain-derived too, and is reconciled here whenever the chain has
 * committed one. It is written at claim-prepare from the local render
 * (setCertificateArtifact), which is a prediction of what the student will
 * sign; this is the confirmation. They can only differ if something re-rendered
 * differently in between — and the PDF export refuses to print a certificate
 * whose re-render disagrees with this column, so the chain must have the last
 * word on it.
 */
export async function syncCertificateMirrorFromChain(
  address: string,
  decoded: ChainCertificateSnapshot,
  txPatch?: CertificateTxPatch,
): Promise<void> {
  const supabase = getServiceClient();
  const sha256 = committedArtifactSha256(decoded.artifactHash);
  const { error } = await supabase
    .from("certificates")
    .update({
      status: decoded.status satisfies CertificateStatusValue,
      signer_bitmap: decoded.signedMask,
      cert_number: decoded.certNumber > 0n ? Number(decoded.certNumber) : null,
      asset: decoded.asset,
      ...(sha256 ? { sha256 } : {}),
      ...txPatch,
      updated_at: new Date().toISOString(),
    })
    .eq("address", address);

  if (error) {
    fail("INTERNAL", "Falha ao sincronizar certificado.", {
      detail: error.message,
      retryable: true,
    });
  }
}

/**
 * Stamps the network a certificate was claimed on, so the export can print
 * where the transaction actually lives instead of asking the environment (see
 * supabase/migrations/0006_cert_cluster.sql).
 *
 * Deliberately its own statement, and deliberately silent on failure: 0006 may
 * not be applied yet, and a claim that already confirmed on-chain must not be
 * reported as failed because a nice-to-have column is missing. Readers fall
 * back to the environment exactly as they did before the column existed.
 */
export async function recordCertificateCluster(
  address: string,
  cluster: string,
): Promise<boolean> {
  if (!dbConfigured) return false;

  const { error } = await getServiceClient()
    .from("certificates")
    .update({ cluster })
    .eq("address", address);

  if (error) {
    console.warn(`[db] cluster not recorded for ${address}: ${error.message}`);
    return false;
  }
  return true;
}
