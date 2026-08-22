-- Overhaul foundations: edition drafts, signer invites, notification log,
-- certificate verify codes.
--
-- Applied by scripts/setup-supabase.ts, which runs each file in
-- supabase/migrations/ as a single statement batch — so, per the 0003/0004
-- convention, every statement here is re-runnable and anything Postgres has
-- no IF NOT EXISTS form for is wrapped in a catalog-checked DO block (an
-- abort would roll back the whole file).
--
-- RLS posture matches 0002/0003: enabled on every new table with ZERO anon
-- policies. Drafts hold unpublished edition metadata, invites hold bearer
-- tokens plus signer emails, and the notification log holds recipient
-- addresses — none of which the browser's anon key may read. All access goes
-- through the service-role client (apps/web/lib/db/draft-queries.ts,
-- draft-mutations.ts).
--
-- `certificates.verify_code` is the human-transcribable handle for the
-- verification ritual (spec §8): 8 Crockford base32 characters derived from
-- sha256(address) by apps/web/lib/verify-code.ts. It is a lookup key, not a
-- secret — the certificate address it encodes is already public. Existing
-- rows are backfilled out-of-band by scripts/admin/backfill-verify-codes.ts,
-- so the column is nullable and its unique index is partial.

create table if not exists edition_drafts (
  id uuid primary key default gen_random_uuid(),
  meta jsonb not null default '{}'::jsonb,
  layout jsonb,
  template_sha text,
  chain_address text unique,
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists signer_invites (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid not null references edition_drafts (id) on delete cascade,
  name text not null,
  role text not null default '',
  email text not null,
  token text not null unique,
  status text not null default 'invited'
    check (status in ('invited', 'accepted', 'expired')),
  wallet text,
  invited_at timestamptz not null default now(),
  accepted_at timestamptz,
  reminded_at timestamptz
);
create index if not exists signer_invites_draft_idx
  on signer_invites (draft_id);

create table if not exists notification_log (
  id uuid primary key default gen_random_uuid(),
  type text not null,
  recipient text not null,
  ref_id text not null,
  sent_at timestamptz not null default now()
);
create index if not exists notification_log_lookup_idx
  on notification_log (type, recipient, ref_id, sent_at desc);

alter table edition_drafts enable row level security;
alter table signer_invites enable row level security;
alter table notification_log enable row level security;

alter table certificates add column if not exists verify_code text;
do $$
begin
  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and indexname = 'certificates_verify_code_uidx'
  ) then
    create unique index certificates_verify_code_uidx
      on public.certificates (verify_code) where verify_code is not null;
  end if;
end $$;

-- 0003 §1 revoked anon's blanket SELECT on certificates and replaced it with a
-- column-level grant whose list is exactly CERT_PUBLIC_COLUMNS in
-- apps/web/lib/db/claim-verify-queries.ts. A column added later is NOT covered
-- by that grant, and a column-level grant governs WHERE clauses as well as
-- projections — so without this the public verify page (whose SELECT now lists
-- verify_code) and the code lookup (which filters on it) would both fail with
-- a permission error the moment this migration lands. Granting discloses
-- nothing new: the code is derived from the certificate address, which anon
-- can already read.
grant select (verify_code) on public.certificates to anon, authenticated;
