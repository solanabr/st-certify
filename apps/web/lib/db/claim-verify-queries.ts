// M5 verify-page mirror reads (public/anon). Separate file under lib/db/** to
// satisfy the @supabase fence and stay collision-free with M3's queries.ts.
// Explicit column lists (never `select("*")`) so the secret `name_salt` column
// is never shipped to the public verify surface — only the fields a certificate
// legitimately displays.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { fail } from "@/lib/errors";
import type {
  CertificateStatusValue,
  SignerTxEntry,
  EditionSignerRow,
} from "./types";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const dbConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

let anonClient: SupabaseClient | null = null;
function db(): SupabaseClient {
  if (!dbConfigured || !SUPABASE_URL || !SUPABASE_ANON_KEY) {
    fail("INTERNAL", "Supabase não configurado.");
  }
  anonClient ??= createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  return anonClient;
}

export interface VerifySignerView {
  position: number;
  name: string;
  role: string | null;
  wallet: string;
  /** Whether this signer's bit is set in the cert's signer_bitmap. */
  signed: boolean;
  /** From certificates.signer_txs (mirror-only): the sign tx + time, if recorded. */
  txSig: string | null;
  signedAt: string | null;
}

export interface VerifyCertView {
  address: string;
  editionAddress: string;
  editionName: string;
  editionSlug: string;
  studentName: string;
  status: CertificateStatusValue;
  signerBitmap: number;
  certNumber: number | null;
  maxSupply: number | null;
  imageUrl: string | null;
  metadataUrl: string | null;
  sha256: string | null;
  asset: string | null;
  revokeReason: string | null;
  completionDate: string | null;
  completedAt: string | null;
  createdAt: string;
  signers: VerifySignerView[];
}

// The public, salt-free projection of a certificate row.
const CERT_PUBLIC_COLUMNS =
  "address, edition_address, student_name, status, signer_bitmap, sha256, image_url, metadata_url, asset, cert_number, signer_txs, revoke_reason, completed_at, created_at";

interface CertPublicRow {
  address: string;
  edition_address: string;
  student_name: string;
  status: CertificateStatusValue;
  signer_bitmap: number;
  sha256: string | null;
  image_url: string | null;
  metadata_url: string | null;
  asset: string | null;
  cert_number: number | null;
  signer_txs: SignerTxEntry[] | null;
  revoke_reason: string | null;
  completed_at: string | null;
  created_at: string;
}

async function assembleView(
  supabase: SupabaseClient,
  cert: CertPublicRow,
): Promise<VerifyCertView> {
  const [{ data: edRow }, { data: signerRows }] = await Promise.all([
    supabase
      .from("editions")
      .select("name, slug, max_supply, completion_date")
      .eq("address", cert.edition_address)
      .maybeSingle(),
    supabase
      .from("edition_signers")
      .select("*")
      .eq("edition_address", cert.edition_address),
  ]);

  const edition = edRow as {
    name: string;
    slug: string;
    max_supply: number | null;
    completion_date: string | null;
  } | null;

  const txByWallet = new Map<string, SignerTxEntry>(
    (cert.signer_txs ?? []).map((t) => [t.wallet, t]),
  );

  const signers: VerifySignerView[] = ((signerRows ?? []) as EditionSignerRow[])
    .sort((a, b) => a.position - b.position)
    .map((s) => {
      const tx = txByWallet.get(s.wallet);
      return {
        position: s.position,
        name: s.name,
        role: s.role,
        wallet: s.wallet,
        signed: (cert.signer_bitmap & (1 << s.position)) !== 0,
        txSig: tx?.tx ?? null,
        signedAt: tx?.signedAt ?? null,
      };
    });

  return {
    address: cert.address,
    editionAddress: cert.edition_address,
    editionName: edition?.name ?? "Edição",
    editionSlug: edition?.slug ?? "",
    studentName: cert.student_name,
    status: cert.status,
    signerBitmap: cert.signer_bitmap,
    certNumber: cert.cert_number,
    maxSupply: edition?.max_supply ?? null,
    imageUrl: cert.image_url,
    metadataUrl: cert.metadata_url,
    sha256: cert.sha256,
    asset: cert.asset,
    revokeReason: cert.revoke_reason,
    completionDate: edition?.completion_date ?? null,
    completedAt: cert.completed_at,
    createdAt: cert.created_at,
    signers,
  };
}

/** Public verify verdict for a certificate PDA, or null if the mirror has no such row. */
export async function getVerifyView(
  certificateAddress: string,
): Promise<VerifyCertView | null> {
  if (!dbConfigured) return null;
  const supabase = db();
  const { data, error } = await supabase
    .from("certificates")
    .select(CERT_PUBLIC_COLUMNS)
    .eq("address", certificateAddress)
    .maybeSingle();

  if (error) {
    fail("INTERNAL", "Falha ao buscar certificado.", {
      detail: error.message,
      retryable: true,
    });
  }
  if (!data) return null;
  return assembleView(supabase, data as unknown as CertPublicRow);
}

/** Resolve a Core asset address back to its certificate verdict (base58-input path). */
export async function getVerifyViewByAsset(
  asset: string,
): Promise<VerifyCertView | null> {
  if (!dbConfigured) return null;
  const supabase = db();
  const { data, error } = await supabase
    .from("certificates")
    .select(CERT_PUBLIC_COLUMNS)
    .eq("asset", asset)
    .maybeSingle();

  if (error) {
    fail("INTERNAL", "Falha ao buscar certificado.", {
      detail: error.message,
      retryable: true,
    });
  }
  if (!data) return null;
  return assembleView(supabase, data as unknown as CertPublicRow);
}
