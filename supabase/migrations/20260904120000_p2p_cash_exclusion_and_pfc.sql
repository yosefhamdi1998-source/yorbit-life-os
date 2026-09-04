-- Two changes, both aimed at the same problem: over half of all spending
-- was landing in "Other", which quietly degrades Budget, Spending Summary
-- and the AI Coach all at once.
--
-- 1. Sending money to a person (Venmo/Zelle/Cash App) and pulling cash out
--    of an ATM are not spending *categories*. They have no merchant and no
--    category, and forcing them into a category breakdown makes every
--    chart wrong. They get excluded from budgeting the same way investment
--    activity and self-transfers already are — still the user's data,
--    still visible on the Payments Sent page, just not pretending to be
--    a spending category.
--
-- 2. Store Plaid's own personal_finance_category on the row. Previously
--    only the mapped result was kept, so any later improvement to the
--    mapping could never be applied to already-imported rows without
--    re-fetching everything from Plaid.

alter table transactions
  add column if not exists pfc_primary text,
  add column if not exists pfc_detailed text;

-- Extend the allowed exclusion reasons. Note: src/lib/enums.js must be
-- updated to match, and `npm run check:enums` will fail the build if it
-- isn't — that check exists precisely because this kind of drift caused
-- two silent, invisible bugs.
alter table transactions drop constraint if exists transactions_exclusion_reason_check;
alter table transactions
  add constraint transactions_exclusion_reason_check
  check (exclusion_reason in ('investment', 'transfer', 'p2p', 'cash'));

-- Backfill: person-to-person payments.
update transactions
set exclude_from_budget = true, exclusion_reason = 'p2p'
where exclude_from_budget = false
  and exclusion_reason is null
  and (
    title ilike '%zelle%'
    or title ilike '%venmo%'
    or title ilike '%cash app%'
    or title ilike '%cashapp%'
    or title ilike '%pmnt sent%'
  );

-- Backfill: cash withdrawals.
update transactions
set exclude_from_budget = true, exclusion_reason = 'cash'
where exclude_from_budget = false
  and exclusion_reason is null
  and (
    title ilike '%atm%'
    or title ilike '%withdrwl%'
    or title ilike '%withdrawal%'
  );

-- Keep new inserts classified the same way, from any path (Plaid sync,
-- CSV/PDF import, manual add) — the trigger is the backstop so this can't
-- drift back the way the original one-time backfill did.
create or replace function classify_transaction_exclusion()
returns trigger as $$
begin
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
  elsif new.title ilike '%zelle%'
    or new.title ilike '%venmo%'
    or new.title ilike '%cash app%'
    or new.title ilike '%cashapp%'
    or new.title ilike '%pmnt sent%'
  then
    new.exclude_from_budget := true;
    new.exclusion_reason := 'p2p';
  elsif new.title ilike '%atm%'
    or new.title ilike '%withdrwl%'
    or new.title ilike '%withdrawal%'
  then
    new.exclude_from_budget := true;
    new.exclusion_reason := 'cash';
  end if;

  return new;
end;
$$ language plpgsql security definer set search_path = public;

create index if not exists idx_transactions_pfc_detailed on transactions(pfc_detailed);
