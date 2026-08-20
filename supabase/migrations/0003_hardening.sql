-- Superteam Certify — security + schema hardening.
-- Applied by scripts/setup-supabase.ts, which reads supabase/migrations/*.sql
-- in filename order and runs each file as a single statement batch. Every
-- statement here is therefore written to be re-runnable: DDL that Postgres
-- has no IF NOT EXISTS form for is wrapped in a catalog-checked DO block, and
-- anything that could fail against pre-existing rows degrades to a NOTICE
-- instead of aborting the batch (an abort would roll back the whole file).

-- ============================================================================
-- 1. certificates: column allowlist for the public anon key  [rls-1, CRITICAL]
-- ============================================================================
-- 0001_init.sql grants anon an unrestricted row filter:
--   create policy "anon_select_certificates" on certificates
--     for select to anon using (true);
-- and NEXT_PUBLIC_SUPABASE_ANON_KEY ships in the browser bundle, so anyone
-- can `select("*")` every certificate row through PostgREST. That exposes:
--   name_salt   — the secret half of the on-chain sha256(salt || name)
--                 commitment. Leaking it lets anyone brute-force or directly
--                 confirm which student a certificate belongs to, which is
--                 the whole point of the salted commitment (LGPD
--                 unlinkability).
--   owner_did   — the student's Privy DID.
--   owner_wallet— the student's wallet.
-- Together they allow bulk name <-> wallet <-> DID enumeration of every
-- student in the system.
--
-- Fix: Postgres enforces column-level SELECT privileges independently of RLS,
-- and PostgREST surfaces that as a permission error. The row policy above
-- stays (it is the row filter); the GRANT below becomes the column filter.
-- The allowlist is exactly CERT_PUBLIC_COLUMNS from
-- apps/web/lib/db/claim-verify-queries.ts — the fields the public /verify page
-- legitimately renders.
--
-- NOTE: a column-level GRANT also governs WHERE clauses — referencing a
-- withheld column in a filter is denied, not just selecting it. That is
-- deliberate: it stops anon from probing `owner_did=eq.<guess>` to confirm a
-- DID it cannot read.
--
-- Privileged reads (claim commitment, /me, admin, certificator inbox) must use
-- the service-role client. apps/web/lib/db/queries.ts was repointed alongside
-- this migration; see the report note about
-- apps/web/lib/db/certificator-queries.ts.
revoke select on public.certificates from anon, authenticated;

grant select (
  address,
  edition_address,
  student_name,
  status,
  signer_bitmap,
  sha256,
  image_url,
  metadata_url,
  asset,
  cert_number,
  signer_txs,
  revoke_reason,
  completed_at,
  created_at
) on public.certificates to anon, authenticated;

-- ============================================================================
-- 2. events: index + uniqueness for the two idempotency ledgers  [db-3]
-- ============================================================================
-- `events` is read as an idempotency ledger in two distinct ways, neither of
-- which had an index, let alone a uniqueness guarantee:
--
--   a) hasProcessedSignature() (lib/db/mutations.ts) — "has this tx signature
--      already been processed?", filtering on tx_sig. Every write path that
--      goes through submitAndSyncTransaction() logs exactly one row carrying
--      the signature it just confirmed, so tx_sig is singleton by
--      construction. Without a unique index two concurrent POSTs of the same
--      signature both pass the check and both re-sync the mirror.
--
--   b) getMintedAssetFromEvents() (lib/db/claim-verify-mutations.ts) — "was an
--      asset already minted for this certificate?", filtering on
--      (cert_address, type = 'certificate_asset_minted'). That row is written
--      by lib/chain/mint.ts with NO tx_sig, so (a)'s index does not cover it.
--      A second row for the same certificate means a second asset was minted.
--
-- Both unique indexes are partial (they only constrain the ledger rows; the
-- other event types are free to repeat) and both are attempted only when the
-- table is currently free of duplicates — CREATE UNIQUE INDEX against
-- pre-existing duplicate rows would abort this whole migration file. When
-- duplicates exist the migration still installs the plain lookup index, raises
-- a NOTICE naming the rows to reconcile, and can simply be re-run afterwards.
--
-- FOLLOW-UP (TypeScript, not editable from this migration): logEvent() in
-- apps/web/lib/db/mutations.ts inserts with no ON CONFLICT clause, so once the
-- unique index exists a genuine duplicate raises 23505 and surfaces as a 500
-- *after* the transaction already landed on-chain. It should become
--   .upsert({...}, { onConflict: "tx_sig", ignoreDuplicates: true })
-- so the duplicate is absorbed rather than reported as a failure.

create index if not exists events_created_at_idx
  on public.events (created_at desc);

create index if not exists events_cert_type_created_idx
  on public.events (cert_address, type, created_at desc)
  where cert_address is not null;

do $$
begin
  if exists (
    select 1 from public.events
    where tx_sig is not null
    group by tx_sig having count(*) > 1
  ) then
    create index if not exists events_tx_sig_idx
      on public.events (tx_sig) where tx_sig is not null;
    raise notice 'events: duplicate tx_sig rows present — installed the plain lookup index only. Reconcile with: select tx_sig, count(*) from events where tx_sig is not null group by tx_sig having count(*) > 1; then re-run this migration to install the unique index.';
  else
    create unique index if not exists events_tx_sig_uidx
      on public.events (tx_sig) where tx_sig is not null;
  end if;
end $$;

do $$
begin
  if exists (
    select 1 from public.events
    where type = 'certificate_asset_minted' and cert_address is not null
    group by cert_address having count(*) > 1
  ) then
    raise notice 'events: a certificate has more than one certificate_asset_minted row (a double mint) — skipping the unique index. Reconcile with: select cert_address, count(*) from events where type = ''certificate_asset_minted'' group by cert_address having count(*) > 1; then re-run.';
  else
    create unique index if not exists events_minted_asset_uidx
      on public.events (cert_address)
      where type = 'certificate_asset_minted' and cert_address is not null;
  end if;
end $$;

-- ============================================================================
-- 3. attendance_claims: guard the status transition into 'minted'  [db-4]
-- ============================================================================
-- attendance_events.minted_count is defined (0002_attendance.sql) as the count
-- of claims in {pending, minted}. markClaimMinted() in
-- apps/web/lib/db/attendance-mutations.ts is a bare
--   update attendance_claims set status = 'minted', tx_sig = $2 where id = $1
-- with no status guard. attendance_release_claim() hands the capacity slot
-- back when it moves a claim to 'failed', so a later failed -> minted flip
-- takes no slot and minted_count silently undercounts — the event then
-- oversubscribes max_supply.
--
-- Enforced here rather than in TypeScript because attendance-mutations.ts is
-- not the only possible writer (psql, the Supabase dashboard, a future
-- reconciliation job all bypass it).
--
-- Deliberately NOT blocking failed -> minted: that transition happens exactly
-- when a mint the route already declared failed actually lands on-chain
-- (POST /api/attendance/claim releases the claim in its catch block, then the
-- confirmation arrives). Refusing it would leave the row 'failed' while the
-- NFT exists, and the participant's next attempt would reserve a fresh slot
-- and mint a SECOND operator-paid asset. So the transition is allowed and the
-- slot is re-taken instead, which is what keeps minted_count correct.
create or replace function public.attendance_claims_retake_slot()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_updated int;
begin
  update attendance_events
    set minted_count = minted_count + 1
    where id = new.event_id
      and (max_supply is null or minted_count < max_supply);
  get diagnostics v_updated = row_count;
  if v_updated = 0 then
    raise exception
      'attendance_claims: claim % cannot be recorded as minted — event % has no free capacity slot to re-take (a released claim''s mint landed after the event filled up). Reconcile the row manually.',
      new.id, new.event_id
      using errcode = 'check_violation';
  end if;
  return null;
end;
$$;

drop trigger if exists attendance_claims_retake_slot_trg on public.attendance_claims;
create trigger attendance_claims_retake_slot_trg
  after update of status on public.attendance_claims
  for each row
  when (old.status = 'failed' and new.status = 'minted')
  execute function public.attendance_claims_retake_slot();

-- The clean write path, for attendance-mutations.ts to adopt (see report):
-- it reports whether the row was actually in a state that could transition,
-- which the bare UPDATE cannot. 'minted' -> 'minted' is treated as success so
-- markClaimMintedWithRetry's retry loop stays idempotent.
create or replace function public.attendance_mark_minted(
  p_claim_id uuid,
  p_tx_sig text,
  p_asset_id text default null
)
returns text
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_status text;
begin
  select status into v_status from attendance_claims
    where id = p_claim_id
    for update;

  if not found then
    return 'not_found';
  end if;

  if v_status = 'minted' then
    return 'already_minted';
  end if;

  -- 'failed' is permitted; the trigger above re-takes the capacity slot.
  update attendance_claims
    set status = 'minted',
        tx_sig = p_tx_sig,
        asset_id = coalesce(p_asset_id, asset_id)
    where id = p_claim_id;

  return 'minted';
end;
$$;

-- ============================================================================
-- 4. attendance functions: pinned search_path + service-role-only  [db-5]
-- ============================================================================
-- 0002_attendance.sql defines its functions without an explicit search_path,
-- and Postgres grants EXECUTE on new functions to PUBLIC by default — so the
-- browser-shipped anon key can invoke them over PostgREST's /rpc endpoint.
-- attendance_release_claim in particular is a free capacity-decrement
-- primitive for anyone who can guess a claim uuid.
--
-- ALTER FUNCTION (rather than redefining the bodies) keeps 0002 the single
-- source of truth for what these functions do.
alter function public.attendance_reserve_claim(uuid, text)
  set search_path = public, pg_temp;
alter function public.attendance_release_claim(uuid)
  set search_path = public, pg_temp;

revoke all on function public.attendance_reserve_claim(uuid, text)
  from public, anon, authenticated;
revoke all on function public.attendance_release_claim(uuid)
  from public, anon, authenticated;
revoke all on function public.attendance_mark_minted(uuid, text, text)
  from public, anon, authenticated;

grant execute on function public.attendance_reserve_claim(uuid, text) to service_role;
grant execute on function public.attendance_release_claim(uuid) to service_role;
grant execute on function public.attendance_mark_minted(uuid, text, text) to service_role;

comment on function public.attendance_release_claim(uuid) is
  'Marks a pending claim failed and frees its capacity slot. The greatest(minted_count - 1, 0) floor masks an underflow rather than reporting it: if minted_count is ever already 0 when a pending claim is released, the counter has drifted from |claims in (pending, minted)| and the release silently absorbs it. Left as-is deliberately — raising here would fail a release that the claim route calls from a catch block, turning a recoverable mint failure into a stuck pending row. Detect drift out-of-band instead: select e.id, e.minted_count, count(c.*) from attendance_events e left join attendance_claims c on c.event_id = e.id and c.status in (''pending'', ''minted'') group by e.id having e.minted_count <> count(c.*);';

-- ============================================================================
-- 5. attendance_events: counter bounds  [db-5]
-- ============================================================================
-- Both constraints are added NOT VALID (enforced for new writes immediately,
-- without scanning) and then validated inside an exception handler, so live
-- rows that already violate them surface as a NOTICE naming the repair query
-- instead of aborting the migration. Re-running after the repair promotes the
-- constraint to validated.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'attendance_events_minted_count_nonneg'
      and conrelid = 'public.attendance_events'::regclass
  ) then
    alter table public.attendance_events
      add constraint attendance_events_minted_count_nonneg
      check (minted_count >= 0) not valid;
  end if;

  begin
    alter table public.attendance_events
      validate constraint attendance_events_minted_count_nonneg;
  exception when check_violation then
    raise notice 'attendance_events: existing rows have minted_count < 0 — constraint left NOT VALID (still enforced for new writes). Repair with: select id, minted_count from attendance_events where minted_count < 0;';
  end;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'attendance_events_supply_bound'
      and conrelid = 'public.attendance_events'::regclass
  ) then
    alter table public.attendance_events
      add constraint attendance_events_supply_bound
      check (max_supply is null or minted_count <= max_supply) not valid;
  end if;

  begin
    alter table public.attendance_events
      validate constraint attendance_events_supply_bound;
  exception when check_violation then
    raise notice 'attendance_events: existing rows are oversubscribed — constraint left NOT VALID (still enforced for new writes). Repair with: select id, minted_count, max_supply from attendance_events where max_supply is not null and minted_count > max_supply;';
  end;
end $$;

-- ============================================================================
-- 6. certificates.asset: index + uniqueness  [db-7]
-- ============================================================================
-- getVerifyViewByAsset() (lib/db/claim-verify-queries.ts) resolves a Core
-- asset address back to its certificate on the public verify page. The column
-- had no index, so every base58 verify input seq-scanned the table, and the
-- query ends in .maybeSingle() — a duplicate asset value makes PostgREST
-- return PGRST116 and the page 500s. One asset belongs to exactly one
-- certificate, so the unique index is the right shape; the duplicate guard
-- mirrors section 2's.
do $$
begin
  if exists (
    select 1 from public.certificates
    where asset is not null
    group by asset having count(*) > 1
  ) then
    create index if not exists certificates_asset_idx
      on public.certificates (asset) where asset is not null;
    raise notice 'certificates: duplicate asset values present — installed the plain lookup index only. Reconcile with: select asset, count(*) from certificates where asset is not null group by asset having count(*) > 1; then re-run this migration.';
  else
    create unique index if not exists certificates_asset_uidx
      on public.certificates (asset) where asset is not null;
  end if;
end $$;

-- ============================================================================
-- 7. attendance_claims.asset_id: index
-- ============================================================================
-- The public per-asset share page (/nft/[assetId], a later wave) resolves a
-- minted attendance asset back to its claim. asset_id is written after the
-- mint confirms (updateClaimAsset in lib/db/attendance-mutations.ts) and stays
-- null until then, so the index is partial — an `asset_id = $1` lookup still
-- uses it, since equality is strict and therefore implies the predicate.
-- Plain btree, not unique: one asset does belong to exactly one claim, but a
-- reconciliation re-running updateClaimAsset is a realistic enough repair path
-- that a hard constraint would be more hazard than guarantee here.
create index if not exists attendance_claims_asset_id_idx
  on public.attendance_claims (asset_id)
  where asset_id is not null;
