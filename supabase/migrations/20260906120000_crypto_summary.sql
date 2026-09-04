-- Crypto analytics computed in Postgres, not in the browser.
--
-- The Investments page loaded every crypto row to aggregate client-side.
-- That was 2,234 kB and 14,913 rows before this import; it is now 17,274.
-- These functions return ~87 rows and a handful of yearly buckets instead.
--
-- REALIZED P&L USES FIFO. Average cost is easier but wrong for anyone who
-- accumulates and sells repeatedly, which is exactly this pattern - 12,175
-- LTC transactions. FIFO is also what Coinbase's own tax reports use, so
-- the numbers can be compared against them.

-- Per-asset summary: flows, position, and realized profit.
create or replace function crypto_asset_summary(p_user_id uuid)
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
  first_date date,
  last_date date
)
language plpgsql
-- VOLATILE, not STABLE: the FIFO walk builds a temp table, and a stable
-- function is forbidden from writing one. Declaring it stable made the
-- function silently return zero rows.
volatile
security definer
set search_path = public
as $$
declare
  r record;
  -- FIFO lot queue per asset: parallel arrays of remaining qty and unit cost.
  lots_qty numeric[];
  lots_cost numeric[];
  cur_asset text := null;
  sell_qty numeric;
  take numeric;
  proceeds numeric;
  cost numeric;
  pnl numeric;
  i int;
begin
  drop table if exists _pnl;
  create temp table _pnl (asset text primary key, realized numeric);

  -- Walk every asset's history in order, maintaining a FIFO lot queue.
  for r in
    select t.crypto_asset a, t.date d, t.crypto_quantity q, t.amount amt
    from transactions t
    where t.user_id = p_user_id
      and t.crypto_quantity is not null
      and not t.superseded_by_import
      and t.crypto_asset is not null
      and t.crypto_asset <> 'USD'
    order by t.crypto_asset, t.date, t.id
  loop
    if cur_asset is distinct from r.a then
      if cur_asset is not null then
        insert into _pnl values (cur_asset, coalesce(pnl, 0))
        on conflict (asset) do update set realized = excluded.realized;
      end if;
      cur_asset := r.a;
      lots_qty := array[]::numeric[];
      lots_cost := array[]::numeric[];
      pnl := 0;
    end if;

    if r.q > 0 then
      -- Acquisition. Unit cost is the USD paid divided by the quantity; a
      -- zero-cost receive (airdrop, transfer in) enters at cost 0, which is
      -- also how Coinbase treats a lot with no known basis.
      lots_qty := array_append(lots_qty, r.q);
      lots_cost := array_append(lots_cost, case when r.q <> 0 then coalesce(r.amt, 0) / r.q else 0 end);
    elsif r.q < 0 then
      -- Disposal. Consume oldest lots first.
      sell_qty := -r.q;
      proceeds := coalesce(r.amt, 0);
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
      -- Any quantity left unmatched came from before the export window;
      -- it contributes proceeds with no cost, exactly as Coinbase reports
      -- a lot whose basis is "Not available".
      pnl := pnl + (proceeds - cost);
    end if;
  end loop;

  if cur_asset is not null then
    insert into _pnl values (cur_asset, coalesce(pnl, 0))
    on conflict (asset) do update set realized = excluded.realized;
  end if;

  return query
  select
    t.crypto_asset,
    count(*),
    round(sum(t.crypto_quantity) filter (where t.crypto_quantity > 0), 8),
    round(-sum(t.crypto_quantity) filter (where t.crypto_quantity < 0), 8),
    round(sum(t.crypto_quantity), 8),
    round(sum(t.amount) filter (where t.crypto_quantity > 0), 2),
    round(sum(t.amount) filter (where t.crypto_quantity < 0), 2),
    round(coalesce(sum(t.amount) filter (where t.crypto_quantity < 0), 0)
        - coalesce(sum(t.amount) filter (where t.crypto_quantity > 0), 0), 2),
    round(coalesce(p.realized, 0), 2),
    min(t.date),
    max(t.date)
  from transactions t
  left join _pnl p on p.asset = t.crypto_asset
  where t.user_id = p_user_id
    and t.crypto_quantity is not null
    and not t.superseded_by_import
    and t.crypto_asset is not null
    and t.crypto_asset <> 'USD'
  group by t.crypto_asset, p.realized
  order by count(*) desc;
end;
$$;

-- Yearly rollup for the chart.
create or replace function crypto_yearly_summary(p_user_id uuid)
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
  where t.user_id = p_user_id
    and t.crypto_quantity is not null
    and not t.superseded_by_import
  group by 1
  order by 1;
$$;
