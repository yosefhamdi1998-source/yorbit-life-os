-- Realized profit and loss bucketed by year.
--
-- crypto_yearly_summary already returns money bought and money sold per year,
-- but volume is not profit. Selling $400k and buying $400k in the same year
-- says nothing about whether the year was good. This answers the question the
-- chart is actually for: in each year, did the coins that were SOLD go out
-- above or below what they cost?
--
-- The FIFO walk cannot be done per year in isolation - a coin bought in 2019
-- and sold in 2024 has its cost basis set five years earlier. So the walk runs
-- once, chronologically, across the whole history per asset, and each disposal
-- is attributed to the year the SALE happened. That is also how a tax year
-- works, so the numbers line up with a Form 8949.
--
-- Uncosted proceeds are reported as their own column per year, never folded
-- into profit. A year where old coins with no purchase record were sold looks
-- enormously profitable if you skip that distinction; it is the single error
-- that made a Coinbase tax summary read $147,189 of gains on an account that
-- was actually down.
--
-- Takes no arguments. Identity comes from auth.uid(), never a parameter.
-- See 20260906140000_lock_down_rpc_surface.sql for why that matters.
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
  cur text := null;
  sell_qty numeric; take numeric; cost numeric; unmatched numeric;
  i int;
  -- Year buckets. Parallel arrays indexed by (year - base_year) + 1.
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
    -- Same FIFO sort key as crypto_asset_summary; see 20260906135000.
    order by t.crypto_asset, coalesce(t.occurred_at, t.date::timestamptz), t.id
  loop
    -- New asset: reset the lot queue. Cost basis never carries across assets.
    if cur is distinct from r.a then
      cur := r.a;
      lots_qty := array[]::numeric[];
      lots_cost := array[]::numeric[];
    end if;

    if r.q > 0 then
      lots_qty := array_append(lots_qty, r.q);
      lots_cost := array_append(lots_cost, r.amt / r.q);
    elsif r.q < 0 then
      y := extract(year from r.d)::int - base_year + 1;
      -- Grow the buckets to reach this year.
      while coalesce(array_length(b_pnl, 1), 0) < y loop
        b_pnl := array_append(b_pnl, 0::numeric);
        b_unc := array_append(b_unc, 0::numeric);
        b_proceeds := array_append(b_proceeds, 0::numeric);
        b_cost := array_append(b_cost, 0::numeric);
        b_n := array_append(b_n, 0::bigint);
      end loop;

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

revoke execute on function crypto_pnl_by_year() from public;
grant execute on function crypto_pnl_by_year() to authenticated;
