-- Superteam Certify — initial schema.
-- Applied via scripts/setup-supabase.ts (reads SUPABASE_DB_URL) or the
-- Supabase CLI / dashboard SQL editor.

-- ============================================================================
-- profiles
-- ============================================================================
create table if not exists profiles (
  did          text primary key,
  email        text,
  wallets      text[] not null default '{}',
  display_name text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ============================================================================
-- editions
-- ============================================================================
create table if not exists editions (
  address           text primary key,
  slug              text not null unique,
  name              text not null,
  description       text,
  template_sha256   text,
  layout            jsonb,
  spec_hash         text,
  max_supply        bigint not null,
  minted            bigint not null default 0,
  requested         bigint not null default 0,
  closed            bigint not null default 0,
  status            text not null default 'paused',
  completion_date   date,
  tx_sig            text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- ============================================================================
-- edition_signers
-- ============================================================================
create table if not exists edition_signers (
  edition_address     text not null references editions (address) on delete cascade,
  position            smallint not null,
  wallet              text not null,
  name                text not null,
  role                text,
  signature_image_url text,
  primary key (edition_address, position)
);

-- ============================================================================
-- certificates
-- ============================================================================
create table if not exists certificates (
  address        text primary key,
  edition_address text not null references editions (address) on delete cascade,
  owner_wallet   text,
  owner_did      text,
  student_name   text not null,
  name_salt      text,
  status         text not null,
  signer_bitmap  int not null default 0,
  sha256         text unique,
  image_url      text,
  metadata_url   text,
  asset          text,
  cert_number    bigint,
  signer_txs     jsonb not null default '[]',
  request_tx     text,
  claim_tx       text,
  revoke_tx      text,
  revoke_reason  text,
  reject_reason  text,
  completed_at   date,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- ============================================================================
-- events
-- ============================================================================
create table if not exists events (
  id              bigint generated always as identity primary key,
  type            text not null,
  actor           text,
  cert_address    text,
  edition_address text,
  tx_sig          text,
  payload         jsonb not null default '{}',
  created_at      timestamptz not null default now()
);

-- ============================================================================
-- Indexes
-- ============================================================================
create index if not exists idx_edition_signers_wallet on edition_signers (wallet);

create index if not exists idx_certificates_edition_status on certificates (edition_address, status);
create index if not exists idx_certificates_status on certificates (status);
-- Both owner columns are indexed: owner_wallet for public/wallet-keyed
-- lookups, owner_did for the logged-in-user "/me" view (a profile can hold
-- multiple wallets).
create index if not exists idx_certificates_owner_wallet on certificates (owner_wallet);
create index if not exists idx_certificates_owner_did on certificates (owner_did);

-- ============================================================================
-- Row Level Security
-- ============================================================================
alter table profiles enable row level security;
alter table editions enable row level security;
alter table edition_signers enable row level security;
alter table certificates enable row level security;
alter table events enable row level security;

-- Only editions / edition_signers / certificates are publicly readable
-- (verify page, public edition pages). profiles and events have no policies
-- at all, so only the service role (which bypasses RLS) can touch them.
-- (drop-if-exists first so this migration is safe to re-run.)
drop policy if exists "anon_select_editions" on editions;
create policy "anon_select_editions" on editions
  for select to anon using (true);

drop policy if exists "anon_select_edition_signers" on edition_signers;
create policy "anon_select_edition_signers" on edition_signers
  for select to anon using (true);

drop policy if exists "anon_select_certificates" on certificates;
create policy "anon_select_certificates" on certificates
  for select to anon using (true);

-- ============================================================================
-- Storage buckets (created idempotently by scripts/setup-supabase.ts via the
-- supabase-js admin API, not here — SQL migrations don't manage buckets):
--   - templates  (public)  — uploaded certificate template source assets
--   - certs      (public)  — rendered certificate PNGs
--   - metadata   (public)  — off-chain JSON metadata for minted assets
-- ============================================================================
