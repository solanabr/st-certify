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

// ---------------------------------------------------------------------------
// Attendance NFTs — mirrors supabase/migrations/0002_attendance.sql
// ---------------------------------------------------------------------------

export type AttendanceClaimStatus = "pending" | "minted" | "failed";
export type ReserveOutcome =
  "reserved" | "retry" | "in_flight" | "already_claimed" | "exhausted";

export interface AttendanceEventRow {
  id: string;
  name: string;
  description: string;
  image_url: string;
  metadata_uri: string;
  collection_address: string;
  event_date: string; // ISO date
  end_date: string | null; // ISO date — multi-day events
  location: string; // freeform "city, country" ('' = unset)
  event_url: string; // public event link ('' = unset)
  max_supply: number | null;
  claim_deadline: string | null; // ISO timestamptz
  claim_open: boolean;
  claim_token: string;
  created_by_wallet: string;
  minted_count: number;
  created_at: string;
}

export interface AttendanceClaimRow {
  id: string;
  event_id: string;
  wallet: string;
  status: AttendanceClaimStatus;
  reserved_at: string | null;
  tx_sig: string | null;
  asset_id: string | null;
  /** Capacity-slot number minted into the leaf name ("#42"); null pre-0004. */
  mint_serial: number | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Overhaul: drafts, invites, notifications — mirrors
// supabase/migrations/0005_overhaul.sql
// ---------------------------------------------------------------------------

/**
 * The draft's editable edition metadata (`edition_drafts.meta` jsonb). Every
 * field is optional: a draft is created from an empty wizard and fills in as
 * the user advances, so nothing is guaranteed present until the on-chain
 * write validates it. Column names are the camelCase wizard vocabulary, not
 * the snake_case `editions` mirror — this JSON is the wizard's own state.
 */
export interface EditionDraftMeta {
  name?: string;
  slug?: string;
  description?: string;
  maxSupply?: number | null;
  completionDate?: string;
}

/**
 * A pre-chain edition. `chain_address` stays null until "Criar on-chain"
 * succeeds, at which point the `editions` mirror takes over as the source of
 * truth and the draft becomes history. Editions created before the overhaul
 * simply have no draft row (0005 does not backfill).
 */
export interface EditionDraftRow {
  id: string;
  meta: EditionDraftMeta;
  /** Same 0..1 layout model as `EditionRow.layout`; null until the designer step. */
  layout: Record<string, unknown> | null;
  template_sha: string | null;
  chain_address: string | null;
  /** Privy DID of the creator. */
  created_by: string;
  created_at: string;
  updated_at: string;
}

export type SignerInviteStatus = "invited" | "accepted" | "expired";

/**
 * One seat on a draft edition. `token` is a bearer capability (the
 * `/invite/[token]` magic link) — never expose it on a public surface.
 * `wallet` is null until the signer accepts and binds one.
 */
export interface SignerInviteRow {
  id: string;
  draft_id: string;
  name: string;
  role: string;
  email: string;
  token: string;
  status: SignerInviteStatus;
  wallet: string | null;
  invited_at: string;
  accepted_at: string | null;
  reminded_at: string | null;
}

/**
 * Append-only send ledger backing `notifyOnce`'s idempotency: a row exists
 * iff that (type, recipient, ref_id) email was handed to the provider.
 * `type` is an `EmailKind` — kept as `string` here because lib/db must not
 * depend on lib/email.
 */
export interface NotificationLogRow {
  id: string;
  type: string;
  recipient: string;
  ref_id: string;
  sent_at: string;
}
