-- The investment/transfer split (previous two migrations) was a one-time
-- backfill only — it fixed every row that existed at the time, but nothing
-- classified NEW rows going forward. Any Coinbase/crypto transaction synced
-- from Plaid, imported from a CSV/PDF, or added manually after that point
-- silently defaulted to exclude_from_budget=false and leaked straight back
-- into spending totals and the Money page — exactly the bug that was meant
-- to be fixed. A trigger runs on every insert, from every code path
-- (client app, Plaid sync edge function, anything added later), so this
-- can't drift out of sync the way three separate app-level checks could.
create or replace function classify_transaction_exclusion()
returns trigger as $$
begin
  -- Never override a value a caller deliberately set.
  if new.exclusion_reason is not null then
    return new;
  end if;

  if new.title ilike '%coinbase%'
    or new.title ilike 'COIN*%'
    or new.title ilike '%litecoin%'
    or new.title ilike '%ethereum%'
    or new.title ilike '%bitcoin%'
    or new.title ilike '%dogecoin%'
    or new.title ilike '%binance%'
    or new.title ilike '%kraken%'
  then
    new.exclude_from_budget := true;
    new.exclusion_reason := 'investment';
  elsif new.title ilike '%online banking transfer%' then
    new.exclude_from_budget := true;
    new.exclusion_reason := 'transfer';
  end if;

  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_classify_transaction_exclusion on transactions;
create trigger trg_classify_transaction_exclusion
  before insert on transactions
  for each row
  execute function classify_transaction_exclusion();

-- Catch anything inserted between the last backfill and this trigger going
-- live (e.g. today's testing / new Plaid syncs).
update transactions
set exclude_from_budget = true, exclusion_reason = 'investment'
where exclude_from_budget = false
  and exclusion_reason is null
  and (
    title ilike '%coinbase%'
    or title ilike 'COIN*%'
    or title ilike '%litecoin%'
    or title ilike '%ethereum%'
    or title ilike '%bitcoin%'
    or title ilike '%dogecoin%'
    or title ilike '%binance%'
    or title ilike '%kraken%'
  );

update transactions
set exclude_from_budget = true, exclusion_reason = 'transfer'
where exclude_from_budget = false
  and exclusion_reason is null
  and title ilike '%online banking transfer%';
