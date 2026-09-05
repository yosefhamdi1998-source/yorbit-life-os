-- Make the FIFO functions finish. Both were timing out in production.
--
-- WHAT BROKE
--
-- crypto_asset_summary and crypto_pnl_by_year each ran ~8.3s and then died on
-- `canceling statement due to statement timeout`. Measured, not inferred:
--
--   crypto_asset_summary   8333 ms  timeout
--   crypto_pnl_by_year     8375 ms  timeout
--   crypto_yearly_summary   239 ms  7 rows   <- the one that still worked
--
-- Two visible symptoms, one cause:
--
--   * The Investments page showed "total bought $9,000 / total sold $5,000".
--     Those are not wrong numbers from the database - they are the page
--     falling back to aggregating the 400 transactions it had already loaded
--     for the activity feed, because the RPC threw. The yearly CHART kept
--     showing the real hundreds of thousands because crypto_yearly_summary
--     is plain SQL and returns in 239ms.
--   * The whole app felt slow. Every visit to Investments spent ~16 seconds
--     waiting on two queries that were always going to fail.
--
-- THE CAUSE
--
-- The lot walk restarted at the first lot on every disposal:
--
--     i := 1;
--     while sell_qty > 0 and i <= array_length(lots_qty, 1) loop
--
-- so each sale rescanned every lot already consumed. LTC alone has 12,175
-- transactions on this account; that is roughly 74 million array reads for
-- one asset. Quadratic.
--
-- THE FIX
--
-- A head pointer per asset marking the first lot that still has quantity.
-- The scan starts there, and head only ever moves forward, so the total work
-- across all disposals for an asset is linear in the number of lots rather
-- than quadratic. Nothing about the accounting changes - the same lots are
-- consumed in the same order for the same cost. Only the lots that are
-- already empty stop being revisited.

-- ---------------------------------------------------------------------------
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
volatile
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  r record;
  lots_qty numeric[];
  lots_cost numeric[];
  head int;               -- first lot that still has quantity
  n_lots int;
  cur text := null;
  a_txns bigint; a_in numeric; a_out numeric; a_bought numeric; a_sold numeric;
  a_pnl numeric; a_uncosted numeric; a_first date; a_last date;
  sell_qty numeric; take numeric; cost numeric; unmatched numeric;
  i int;
begin
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
      head := 1; n_lots := 0;
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
      n_lots := n_lots + 1;
    elsif r.q < 0 then
      a_out := a_out - r.q;
      a_sold := a_sold + r.amt;

      sell_qty := -r.q;
      cost := 0;
      -- Start at the oldest lot that still has quantity, not at lot 1.
      i := head;
      while sell_qty > 0 and i <= n_lots loop
        if lots_qty[i] > 0 then
          take := least(lots_qty[i], sell_qty);
          cost := cost + take * lots_cost[i];
          lots_qty[i] := lots_qty[i] - take;
          sell_qty := sell_qty - take;
        end if;
        i := i + 1;
      end loop;

      -- head only moves forward, so this costs O(lots) across the whole asset.
      while head <= n_lots and lots_qty[head] <= 0 loop
        head := head + 1;
      end loop;

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

-- ---------------------------------------------------------------------------
create or replace function crypto_pnl_by_year()
returns table (
  yr text,
  realized_pnl numeric,
  uncosted_proceeds numeric,
  proceeds numeric,
  cost_basis numeric,
  disposals bigint
)
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  r record;
  lots_qty numeric[];
  lots_cost numeric[];
  head int;
  n_lots int;
  cur text := null;
  sell_qty numeric; take numeric; cost numeric; unmatched numeric;
  i int;
  base_year int := 1970;
  y int;
  b_pnl numeric[] := array[]::numeric[];
  b_unc numeric[] := array[]::numeric[];
  b_proceeds numeric[] := array[]::numeric[];
  b_cost numeric[] := array[]::numeric[];
  b_n bigint[] := array[]::bigint[];
begin
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
    order by t.crypto_asset, coalesce(t.occurred_at, t.date::timestamptz), t.id
  loop
    if cur is distinct from r.a then
      cur := r.a;
      lots_qty := array[]::numeric[];
      lots_cost := array[]::numeric[];
      head := 1; n_lots := 0;
    end if;

    if r.q > 0 then
      lots_qty := array_append(lots_qty, r.q);
      lots_cost := array_append(lots_cost, r.amt / r.q);
      n_lots := n_lots + 1;
    elsif r.q < 0 then
      y := extract(year from r.d)::int - base_year + 1;
      while coalesce(array_length(b_pnl, 1), 0) < y loop
        b_pnl := array_append(b_pnl, 0::numeric);
        b_unc := array_append(b_unc, 0::numeric);
        b_proceeds := array_append(b_proceeds, 0::numeric);
        b_cost := array_append(b_cost, 0::numeric);
        b_n := array_append(b_n, 0::bigint);
      end loop;

      sell_qty := -r.q;
      cost := 0;
      i := head;
      while sell_qty > 0 and i <= n_lots loop
        if lots_qty[i] > 0 then
          take := least(lots_qty[i], sell_qty);
          cost := cost + take * lots_cost[i];
          lots_qty[i] := lots_qty[i] - take;
          sell_qty := sell_qty - take;
        end if;
        i := i + 1;
      end loop;

      while head <= n_lots and lots_qty[head] <= 0 loop
        head := head + 1;
      end loop;

      if sell_qty > 0 then
        unmatched := sell_qty / (-r.q);
        b_unc[y] := b_unc[y] + (r.amt * unmatched);
      end if;

      b_pnl[y] := b_pnl[y] + (r.amt - cost);
      b_proceeds[y] := b_proceeds[y] + r.amt;
      b_cost[y] := b_cost[y] + cost;
      b_n[y] := b_n[y] + 1;
    end if;
  end loop;

  for i in 1 .. coalesce(array_length(b_pnl, 1), 0) loop
    if b_n[i] > 0 then
      yr := (base_year + i - 1)::text;
      realized_pnl := round(b_pnl[i], 2);
      uncosted_proceeds := round(b_unc[i], 2);
      proceeds := round(b_proceeds[i], 2);
      cost_basis := round(b_cost[i], 2);
      disposals := b_n[i];
      return next;
    end if;
  end loop;
end;
$$;

revoke execute on function crypto_asset_summary() from public, anon;
revoke execute on function crypto_pnl_by_year() from public, anon;
grant execute on function crypto_asset_summary() to authenticated;
grant execute on function crypto_pnl_by_year() to authenticated;
