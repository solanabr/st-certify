-- Attendance metadata expansion (POAP-informed) + per-claim mint serials.
--
-- New event fields feed the event's shared metadata JSON — POAP's convention
-- (city/country, start/end dates, event URL) adapted to one freeform
-- `location`, an optional `end_date` for multi-day events, and an optional
-- public `event_url`. Existing events keep their already-published JSONs;
-- only events created after this migration carry the new attributes.
--
-- `mint_serial` numbers each attendee's cNFT ("Event #42") in the Bubblegum
-- leaf name — assigned atomically at slot-take time inside
-- attendance_reserve_claim, so it needs no extra write on the mint hot path.
-- Named mint_serial (not `serial`) to avoid colliding with the SQL type
-- keyword in column-definition position.

alter table attendance_events
  add column if not exists location text not null default '',
  add column if not exists end_date date,
  add column if not exists event_url text not null default '';

alter table attendance_claims
  add column if not exists mint_serial integer;

-- attendance_reserve_claim gains a `mint_serial` output column: the capacity
-- slot number this wallet's claim holds. Semantics per outcome:
--   'reserved' (fresh or failed→re-take) → newly taken slot number
--                                          (post-increment minted_count)
--   'retry'                              → the row's stored serial (the slot
--                                          was never released)
--   'already_claimed' / 'in_flight'      → the row's stored serial
--                                          (null for pre-0004 rows)
-- A release (minted_count decrement) can hand a number to the next fresh
-- reservation while the 0003 failed→minted trigger later re-takes a slot for
-- the released claim — a rare duplicate display number. Accepted: the serial
-- is leaf-name cosmetics; (event_id, wallet) and the claims table stay the
-- uniqueness authority.
--
-- Adding an OUT column changes the function's row type, which CREATE OR
-- REPLACE refuses — DROP + CREATE, which resets privileges, so the 0003
-- posture (pinned search_path, service-role-only EXECUTE) is re-applied
-- below. 0002's header comment stays the invariant reference.
drop function if exists public.attendance_reserve_claim(uuid, text);

create function public.attendance_reserve_claim(p_event_id uuid, p_wallet text)
returns table (outcome text, claim_id uuid, existing_tx_sig text, mint_serial integer)
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_claim attendance_claims%rowtype;
  v_serial integer;
begin
  select * into v_claim from attendance_claims
    where event_id = p_event_id and wallet = p_wallet
    for update;

  if found then
    if v_claim.status = 'minted' then
      return query select 'already_claimed'::text, v_claim.id, v_claim.tx_sig, v_claim.mint_serial;
      return;
    elsif v_claim.status = 'pending' then
      if v_claim.reserved_at > now() - interval '90 seconds' then
        return query select 'in_flight'::text, v_claim.id, null::text, v_claim.mint_serial;
        return;
      end if;
      update attendance_claims
        set reserved_at = now()
        where id = v_claim.id;
      return query select 'retry'::text, v_claim.id, null::text, v_claim.mint_serial;
      return;
    else
      -- failed → needs a fresh capacity slot (it was released on failure)
      update attendance_events
        set minted_count = minted_count + 1
        where id = p_event_id
          and (max_supply is null or minted_count < max_supply)
        returning minted_count into v_serial;
      if not found then
        return query select 'exhausted'::text, null::uuid, null::text, null::integer;
        return;
      end if;
      update attendance_claims
        set status = 'pending', tx_sig = null, reserved_at = now(),
            mint_serial = v_serial
        where id = v_claim.id;
      return query select 'reserved'::text, v_claim.id, null::text, v_serial;
      return;
    end if;
  end if;

  update attendance_events
    set minted_count = minted_count + 1
    where id = p_event_id
      and (max_supply is null or minted_count < max_supply)
    returning minted_count into v_serial;
  if not found then
    return query select 'exhausted'::text, null::uuid, null::text, null::integer;
    return;
  end if;

  insert into attendance_claims (event_id, wallet, status, reserved_at, mint_serial)
    values (p_event_id, p_wallet, 'pending', now(), v_serial)
    returning * into v_claim;
  return query select 'reserved'::text, v_claim.id, null::text, v_claim.mint_serial;
end;
$$;

revoke all on function public.attendance_reserve_claim(uuid, text)
  from public, anon, authenticated;
grant execute on function public.attendance_reserve_claim(uuid, text)
  to service_role;
