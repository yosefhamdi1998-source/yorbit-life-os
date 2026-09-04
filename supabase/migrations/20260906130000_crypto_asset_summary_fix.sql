-- Rewrite crypto_asset_summary without a temp table.
--
-- The previous version stored FIFO results in a temp table, which a
-- SECURITY DEFINER function with `set search_path = public` cannot see -
-- pg_temp is not on that path. It returned zero rows with no error, which
-- is exactly the silent-wrongness this audit keeps eliminating.
--
-- This version accumulates into arrays and RETURN NEXT per asset, so there
-- is no cross-schema visibility question at all.
--
-- REALIZED P&L IS FIFO. Average cost is simpler but wrong for someone who
-- accumulates and sells repeatedly - 12,175 LTC transactions here. FIFO is
-- also what Coinbase's own tax reports use, so the figures are comparable.
-- Signature changes (a new OUT column) require a drop; CREATE OR REPLACE
-- cannot alter a function's return type.
drop function if exists crypto_asset_summary(uuid);

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
  r record;
  lots_qty numeric[];
  lots_cost numeric[];
  cur text := null;
  a_txns bigint; a_in numeric; a_out numeric; a_bought numeric; a_sold numeric;
  a_pnl numeric; a_uncosted numeric; a_first date; a_last date;
  sell_qty numeric; take numeric; cost numeric; unmatched numeric;
  i int;
begin
  for r in
    select t.crypto_asset a, t.date d, t.crypto_quantity q, coalesce(t.amount, 0) amt
    from transactions t
    where t.user_id = p_user_id
      and t.crypto_quantity is not null
      and not t.superseded_by_import
      and t.crypto_asset is not null
      and t.crypto_asset <> 'USD'
    order by t.crypto_asset, t.date, t.id
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
