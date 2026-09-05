-- CRITICAL: close an authorization bypass on every RPC in the public schema.
--
-- WHAT WAS WRONG
--
-- Postgres grants EXECUTE on a newly created function to PUBLIC automatically.
-- Supabase's `anon` role inherits PUBLIC, and the anon key is not a secret -
-- it ships inside the JavaScript bundle served to every visitor. So every
-- function created in this project has been callable by the entire internet
-- from the moment it was created.
--
-- That alone would be a read exposure. Two things made it a write exposure:
--
--   1. These functions take the account holder's identity as a PARAMETER
--      (p_user_id) instead of deriving it from the session.
--   2. Their guard was written as:
--
--          if auth.uid() is not null and auth.uid() <> p_user_id then
--            raise exception 'Not your data';
--          end if;
--
--      auth.uid() is NULL for an anon-key caller. The `is not null` term
--      therefore switches the guard OFF for precisely the caller it exists
--      to stop. A signed-in user was blocked from touching someone else's
--      data; an anonymous stranger was waved through.
--
-- Verified against production before writing this migration, using only the
-- publishable key from the deployed bundle:
--
--   mark_receipts_as_income(<any uuid>, p_title_pattern => ...)  -> returned 0
--       Not an authorization error. The UPDATE executed. Against a real
--       user id with the pattern '%', an anonymous caller could rewrite
--       every income classification in that account.
--   apply_income_sender(<any uuid>, ...)  -> returned 23503 foreign key
--       It reached the INSERT. It failed only because the probe uuid was
--       not a real user; a real one would have been written.
--   crypto_asset_summary / crypto_yearly_summary / title_matches_income_sender
--       -> executed and returned rows. Anyone holding a user id could read
--       that account's entire trading history.
--
-- THE FIX, in order of how much it is relied upon:
--
--   1. Revoke the default. This is the class fix - without it the NEXT
--      function created here reopens the same hole silently.
--   2. Revoke what is already granted, then grant back only the two
--      functions the client legitimately calls.
--   3. Remove the p_user_id parameter from those two. A guard can be
--      written wrong (it was). A parameter that does not exist cannot be
--      forged. Identity now comes from auth.uid() and nowhere else.
--   4. Repair the inverted guards on the maintenance functions anyway, so
--      the fix does not depend on the grants alone.

-- ---------------------------------------------------------------------------
-- 1. Stop the bleeding for every function created from here on.
-- ---------------------------------------------------------------------------
alter default privileges in schema public revoke execute on functions from public;

-- ---------------------------------------------------------------------------
-- 2. Close the existing surface.
--
-- Safe to do wholesale: the client calls exactly two RPCs (crypto_asset_summary,
-- crypto_yearly_summary), the edge functions call three more as service_role,
-- and no RLS policy calls anything but auth.uid(). Verified by enumerating
-- every .rpc( callsite in src/ and supabase/functions/ and every create policy
-- in this migrations directory.
--
-- Trigger functions are unaffected: PostgREST refuses to expose a function
-- returning `trigger`, and Postgres checks EXECUTE on a trigger function when
-- the trigger is created, not each time it fires.
-- ---------------------------------------------------------------------------
revoke execute on all functions in schema public from public;
revoke execute on all functions in schema public from anon;
revoke execute on all functions in schema public from authenticated;

-- The edge functions authenticate as service_role and must keep working.
grant execute on all functions in schema public to service_role;

-- ---------------------------------------------------------------------------
-- 3. Rebuild the two client-facing functions with no identity parameter.
--
-- Dropping the 1-arg forms is deliberate. Leaving them in place would leave a
-- forgeable entry point one stray GRANT away from being live again.
-- ---------------------------------------------------------------------------
drop function if exists crypto_asset_summary(uuid);
drop function if exists crypto_yearly_summary(uuid);

create or replace function crypto_asset_summary()
returns table (
  asset text,
  txns bigint,
  qty_in numeric,
  qty_out numeric,
  net_qty numeric,
  usd_bought numeric,
  usd_sold numeric,
  net_usd numeric,
  realized_pnl numeric,
  uncosted_proceeds numeric,
  first_date date,
  last_date date
)
language plpgsql
-- VOLATILE, not STABLE: an earlier revision built a temp table here and a
-- stable function may not write one, which made it return zero rows with no
-- error. The temp table is gone (a SECURITY DEFINER function with
-- search_path = public cannot see pg_temp either), but the marker stays
-- accurate rather than optimistic.
volatile
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  r record;
  lots_qty numeric[];
  lots_cost numeric[];
  cur text := null;
  a_txns bigint; a_in numeric; a_out numeric; a_bought numeric; a_sold numeric;
  a_pnl numeric; a_uncosted numeric; a_first date; a_last date;
  sell_qty numeric; take numeric; cost numeric; unmatched numeric;
  i int;
begin
  -- No session, no data. Not `if uid is not null and ...` - that phrasing is
  -- the bug this migration exists to remove.
  if uid is null then
    raise exception 'Sign in required' using errcode = '42501';
  end if;

  for r in
    select t.crypto_asset a, t.date d, t.crypto_quantity q, coalesce(t.amount, 0) amt
    from transactions t
    where t.user_id = uid
      and t.crypto_quantity is not null
      and not t.superseded_by_import
      and t.crypto_asset is not null
      and t.crypto_asset <> 'USD'
    -- coalesce(occurred_at, date) is the FIFO sort key. Where the source
    -- gave a real time, lots are consumed in true trade order; where it
    -- did not, the day's rows fall back to an arbitrary sequence. See
    -- 20260906135000 for what that arbitrariness is worth ($26,085.82
    -- and a sign flip on 2018-2023).
    order by t.crypto_asset, coalesce(t.occurred_at, t.date::timestamptz), t.id
  loop
    if cur is distinct from r.a then
      if cur is not null then
        asset := cur; txns := a_txns; qty_in := round(a_in, 8); qty_out := round(a_out, 8);
        net_qty := round(a_in - a_out, 8); usd_bought := round(a_bought, 2);
        usd_sold := round(a_sold, 2); net_usd := round(a_sold - a_bought, 2);
        realized_pnl := round(a_pnl, 2); uncosted_proceeds := round(a_uncosted, 2);
        first_date := a_first; last_date := a_last;
        return next;
      end if;
      cur := r.a;
      lots_qty := array[]::numeric[]; lots_cost := array[]::numeric[];
      a_txns := 0; a_in := 0; a_out := 0; a_bought := 0; a_sold := 0;
      a_pnl := 0; a_uncosted := 0; a_first := r.d; a_last := r.d;
    end if;

    a_txns := a_txns + 1;
    a_last := r.d;

    if r.q > 0 then
      a_in := a_in + r.q;
      a_bought := a_bought + r.amt;
      lots_qty := array_append(lots_qty, r.q);
      lots_cost := array_append(lots_cost, r.amt / r.q);
    elsif r.q < 0 then
      a_out := a_out - r.q;
      a_sold := a_sold + r.amt;

      sell_qty := -r.q;
      cost := 0;
      i := 1;
      while sell_qty > 0 and i <= coalesce(array_length(lots_qty, 1), 0) loop
        if lots_qty[i] > 0 then
          take := least(lots_qty[i], sell_qty);
          cost := cost + take * lots_cost[i];
          lots_qty[i] := lots_qty[i] - take;
          sell_qty := sell_qty - take;
        end if;
        i := i + 1;
      end loop;

      -- Quantity with no matching lot came from before the export window or
      -- arrived by a path the export does not record. Its proceeds are
      -- tracked separately rather than counted as pure profit, because that
      -- is precisely the error that made a Coinbase tax report read
      -- $147,189 of "gains" that were really sales with no known basis.
      if sell_qty > 0 then
        unmatched := sell_qty / (-r.q);
        a_uncosted := a_uncosted + (r.amt * unmatched);
      end if;

      a_pnl := a_pnl + (r.amt - cost);
    end if;
  end loop;

  if cur is not null then
    asset := cur; txns := a_txns; qty_in := round(a_in, 8); qty_out := round(a_out, 8);
    net_qty := round(a_in - a_out, 8); usd_bought := round(a_bought, 2);
    usd_sold := round(a_sold, 2); net_usd := round(a_sold - a_bought, 2);
    realized_pnl := round(a_pnl, 2); uncosted_proceeds := round(a_uncosted, 2);
    first_date := a_first; last_date := a_last;
    return next;
  end if;
end;
$$;

create or replace function crypto_yearly_summary()
returns table (
  yr text,
  txns bigint,
  usd_bought numeric,
  usd_sold numeric,
  net_flow numeric,
  cash_withdrawn numeric
)
language sql
stable
security definer
set search_path = public
as $$
  select
    left(t.date::text, 4) as yr,
    count(*) filter (where t.crypto_asset <> 'USD'),
    round(coalesce(sum(t.amount) filter (where t.crypto_quantity > 0 and t.crypto_asset <> 'USD'), 0), 2),
    round(coalesce(sum(t.amount) filter (where t.crypto_quantity < 0 and t.crypto_asset <> 'USD'), 0), 2),
    round(coalesce(sum(t.amount) filter (where t.crypto_quantity < 0 and t.crypto_asset <> 'USD'), 0)
        - coalesce(sum(t.amount) filter (where t.crypto_quantity > 0 and t.crypto_asset <> 'USD'), 0), 2),
    -- Cash actually leaving Coinbase for a bank: the money that funded life.
    round(coalesce(sum(t.amount) filter (where t.crypto_asset = 'USD' and t.title ilike 'Coinbase Withdrawal%'), 0), 2)
  from transactions t
  where t.user_id = auth.uid()
    and auth.uid() is not null
    and t.crypto_quantity is not null
    and not t.superseded_by_import
  group by 1
  order by 1;
$$;

-- ---------------------------------------------------------------------------
-- 4. Repair the inverted guards on the maintenance functions.
--
-- Nothing in the app calls these - they exist for one-off income marking - so
-- they stay revoked above. The guards are corrected anyway: a future GRANT
-- should not be able to reopen a data-modifying hole by itself.
-- ---------------------------------------------------------------------------
create or replace function mark_receipts_as_income(
  p_user_id uuid,
  p_transaction_ids uuid[] default null,
  p_title_pattern text default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  if auth.uid() is null or auth.uid() <> p_user_id then
    raise exception 'Not your data' using errcode = '42501';
  end if;

  update transactions
  set income_override = true,
      income_override_at = now(),
      exclude_from_budget = false,
      exclusion_reason = null
  where user_id = p_user_id
    and type = 'income'
    and (
      (p_transaction_ids is not null and id = any(p_transaction_ids))
      or (p_title_pattern is not null and title ilike p_title_pattern)
    );

  get diagnostics n = row_count;
  return n;
end;
$$;

-- Bodies below are carried over verbatim from 20260905160000 and
-- 20260905220000. The ONLY change in each is the guard line. Note that
-- p_transaction_ids has no default here on purpose: an accidental null must
-- not become "every row in the account".
create or replace function unmark_receipts_as_income(
  p_user_id uuid,
  p_transaction_ids uuid[]
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  if auth.uid() is null or auth.uid() <> p_user_id then
    raise exception 'Not your data' using errcode = '42501';
  end if;

  update transactions t
  set income_override = false,
      income_override_at = null,
      exclusion_reason = classify_exclusion_reason(
        t.title, t.type, t.notes, t.pfc_detailed, t.pfc_primary),
      exclude_from_budget = classify_exclusion_reason(
        t.title, t.type, t.notes, t.pfc_detailed, t.pfc_primary) is not null
  where t.user_id = p_user_id and t.id = any(p_transaction_ids);

  get diagnostics n = row_count;
  return n;
end;
$$;

create or replace function apply_income_sender(p_user_id uuid, p_pattern text, p_label text default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare n integer;
begin
  if auth.uid() is null or auth.uid() <> p_user_id then
    raise exception 'Not your data' using errcode = '42501';
  end if;

  insert into income_senders (user_id, sender_pattern, label)
  values (p_user_id, p_pattern, p_label)
  on conflict (user_id, sender_pattern) do update set label = excluded.label;

  update transactions
  set income_override = true,
      income_override_at = now(),
      exclude_from_budget = false,
      exclusion_reason = null
  where user_id = p_user_id
    and type = 'income'
    and title ilike '%' || p_pattern || '%';

  get diagnostics n = row_count;
  return n;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Grant back exactly what the signed-in app needs. Nothing else.
-- ---------------------------------------------------------------------------
grant execute on function crypto_asset_summary() to authenticated;
grant execute on function crypto_yearly_summary() to authenticated;
