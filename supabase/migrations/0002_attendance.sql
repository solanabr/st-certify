-- Attendance NFTs: events, claims, SIWS nonces.
-- Counter invariant: attendance_events.minted_count counts claims in
-- {pending, minted}. It is only changed by the two functions below.
-- Access is service-role only (same posture as 0001).

create table if not exists attendance_events (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null default '',
  image_url text not null,
  metadata_uri text not null,
  collection_address text not null,
  event_date date not null,
  max_supply integer,
  claim_deadline timestamptz,
  claim_open boolean not null default true,
  claim_token text not null unique,
  created_by_wallet text not null,
  minted_count integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists attendance_claims (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references attendance_events (id) on delete cascade,
  wallet text not null,
  status text not null default 'pending'
    check (status in ('pending', 'minted', 'failed')),
  -- Set whenever status transitions to 'pending' (fresh insert or a
  -- failed→pending retry). Lets attendance_reserve_claim tell a crashed
  -- mint (stale reservation, safe to retry) from one still in flight.
  reserved_at timestamptz,
  tx_sig text,
  asset_id text,
  created_at timestamptz not null default now(),
  unique (event_id, wallet)
);

create index if not exists attendance_claims_event_idx
  on attendance_claims (event_id);

create table if not exists attendance_nonces (
  nonce text primary key,
  wallet text not null,
  purpose text not null,
  expires_at timestamptz not null,
  used_at timestamptz
);

-- Row Level Security: service-role only, no anon policies on any of the
-- three tables above — same posture as profiles/events in 0001_init.sql
-- (RLS enabled with zero policies denies all access except the service
-- role, which bypasses RLS entirely). Safe to re-run.
alter table attendance_events enable row level security;
alter table attendance_claims enable row level security;
alter table attendance_nonces enable row level security;

-- Atomically reserve a claim slot. Outcomes:
--   'reserved'        → new/retried pending claim; caller mints
--   'retry'           → a pending claim exists and its reservation is stale
--                        (>90s — the previous mint attempt likely crashed);
--                        caller mints again
--   'in_flight'       → a pending claim exists and its reservation is recent
--                        (<=90s); another request is probably minting right
--                        now, caller should not mint
--   'already_claimed' → returns the original tx_sig
--   'exhausted'       → no capacity left (or claiming closed via claim_open=false is checked in TS)
create or replace function attendance_reserve_claim(p_event_id uuid, p_wallet text)
returns table (outcome text, claim_id uuid, existing_tx_sig text)
language plpgsql
as $$
declare
  v_claim attendance_claims%rowtype;
  v_updated int;
begin
  select * into v_claim from attendance_claims
    where event_id = p_event_id and wallet = p_wallet
    for update;

  if found then
    if v_claim.status = 'minted' then
      return query select 'already_claimed'::text, v_claim.id, v_claim.tx_sig;
      return;
    elsif v_claim.status = 'pending' then
      if v_claim.reserved_at > now() - interval '90 seconds' then
        return query select 'in_flight'::text, v_claim.id, null::text;
        return;
      end if;
      update attendance_claims
        set reserved_at = now()
        where id = v_claim.id;
      return query select 'retry'::text, v_claim.id, null::text;
      return;
    else
      -- failed → needs a fresh capacity slot (it was released on failure)
      update attendance_events
        set minted_count = minted_count + 1
        where id = p_event_id
          and (max_supply is null or minted_count < max_supply);
      get diagnostics v_updated = row_count;
      if v_updated = 0 then
        return query select 'exhausted'::text, null::uuid, null::text;
        return;
      end if;
      update attendance_claims
        set status = 'pending', tx_sig = null, reserved_at = now()
        where id = v_claim.id;
      return query select 'reserved'::text, v_claim.id, null::text;
      return;
    end if;
  end if;

  update attendance_events
    set minted_count = minted_count + 1
    where id = p_event_id
      and (max_supply is null or minted_count < max_supply);
  get diagnostics v_updated = row_count;
  if v_updated = 0 then
    return query select 'exhausted'::text, null::uuid, null::text;
    return;
  end if;

  insert into attendance_claims (event_id, wallet, status, reserved_at)
    values (p_event_id, p_wallet, 'pending', now())
    returning * into v_claim;
  return query select 'reserved'::text, v_claim.id, null::text;
end;
$$;

-- Release a pending claim after a failed mint: mark failed + free the slot.
create or replace function attendance_release_claim(p_claim_id uuid)
returns void
language plpgsql
as $$
declare
  v_event uuid;
begin
  update attendance_claims set status = 'failed'
    where id = p_claim_id and status = 'pending'
    returning event_id into v_event;
  if v_event is not null then
    update attendance_events
      set minted_count = greatest(minted_count - 1, 0)
      where id = v_event;
  end if;
end;
$$;
