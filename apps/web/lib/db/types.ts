/**
 * Hand-typed row interfaces mirroring `supabase/migrations/0001_init.sql`
 * (no generated Database types yet). `bigint`/`int8` columns (max_supply,
 * minted, requested, closed, cert_number) are typed `number` — safe at this
 * app's realistic scale (cohort sizes, not chain amounts); the chain side
 * keeps true bigint precision via `@certify/client`'s codecs.
 *
 * Status columns store the PascalCase on-chain enum spelling
 * (`CertStatusName`/`EditionStatusName` from `@certify/client`) so
 * `lib/chain/server.ts`'s post-confirm sync can write a decoded chain status
 * straight into the mirror with zero case-mapping. `certificates.status`
 * additionally allows `"Rejected"` — a DB-only state with no on-chain
 * counterpart, since `reject_request` closes the Certificate PDA entirely.
 */

export type EditionStatusValue = "Paused" | "Open" | "Closed";
export type CertificateStatusValue =
  "Requested" | "FullySigned" | "Claimed" | "Revoked" | "Rejected";

export interface ProfileRow {
  did: string;
  email: string | null;
  wallets: string[];
  display_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface EditionRow {
  address: string;
  slug: string;
  name: string;
  description: string | null;
  template_sha256: string | null;
  layout: Record<string, unknown> | null;
  spec_hash: string | null;
  max_supply: number;
  minted: number;
  requested: number;
  closed: number;
  status: EditionStatusValue;
  completion_date: string | null;
  tx_sig: string | null;
  created_at: string;
  updated_at: string;
}

export interface EditionSignerRow {
  edition_address: string;
  position: number;
  wallet: string;
  name: string;
  role: string | null;
  signature_image_url: string | null;
}

export interface SignerTxEntry {
  position: number;
  wallet: string;
  tx: string;
  signedAt: string;
}

export interface CertificateRow {
  address: string;
  edition_address: string;
  owner_wallet: string | null;
  owner_did: string | null;
  student_name: string;
  name_salt: string | null;
  status: CertificateStatusValue;
  signer_bitmap: number;
  sha256: string | null;
  image_url: string | null;
  metadata_url: string | null;
  asset: string | null;
  cert_number: number | null;
  signer_txs: SignerTxEntry[];
  request_tx: string | null;
  claim_tx: string | null;
  revoke_tx: string | null;
  revoke_reason: string | null;
  reject_reason: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface EventRow {
  id: number;
  type: string;
  actor: string | null;
  cert_address: string | null;
  edition_address: string | null;
  tx_sig: string | null;
  payload: Record<string, unknown>;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Composed shapes returned by lib/db/queries + mutations to route handlers
// ---------------------------------------------------------------------------

export interface EditionSignerSummary {
  position: number;
  wallet: string;
  name: string;
  role: string | null;
}

export interface EditionWithSigners {
  address: string;
  slug: string;
  name: string;
  description: string | null;
  templateSha256: string | null;
  layout: Record<string, unknown> | null;
  specHash: string | null;
  status: EditionStatusValue;
  maxSupply: number;
  minted: number;
  requested: number;
  closed: number;
  completionDate: string | null;
  createdAt: string;
  signers: EditionSignerSummary[];
}

export interface CertificateForOwner {
  address: string;
  editionAddress: string;
  editionName: string;
  editionSlug: string;
  editionSigners: EditionSignerSummary[];
  status: CertificateStatusValue;
  signerBitmap: number;
  studentName: string;
  imageUrl: string | null;
  metadataUrl: string | null;
  asset: string | null;
  certNumber: number | null;
  rejectReason: string | null;
  revokeReason: string | null;
  createdAt: string;
  completedAt: string | null;
}

export interface CertificateAdminRow {
  address: string;
  editionAddress: string;
  editionName: string;
  ownerWallet: string | null;
  studentName: string;
  status: CertificateStatusValue;
  signerBitmap: number;
  certNumber: number | null;
  createdAt: string;
}

export interface AdminStats {
  editionsCount: number;
  pendingSignaturesCount: number;
  claimedCount: number;
  revokedCount: number;
}
