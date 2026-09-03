-- Two different things get excluded from budgeting, and conflating them
-- put bank-to-bank transfers on the Investments page:
--
--   investment — crypto trading and funding an exchange
--   transfer   — moving money between your own accounts
--
-- Both are correctly kept out of income/spending totals; only the first
-- belongs in Investments.
alter table transactions
  add column if not exists exclusion_reason text
  check (exclusion_reason in ('investment', 'transfer'));

-- Anything already excluded was flagged by the crypto backfill.
update transactions
set exclusion_reason = 'investment'
where exclude_from_budget = true and exclusion_reason is null;

-- Crypto that the first pass missed. It only matched titles STARTING with
-- "Coinbase", so it skipped the bank's own descriptors ("COIN*YHAMDI",
-- "Venmo Card - Coinbase", "PMNT SENT ... Coinbase Oakland CA") and every
-- row named after the asset instead of the exchange ("Litecoin Sale").
update transactions
set exclude_from_budget = true, exclusion_reason = 'investment'
where exclude_from_budget = false
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

-- Moving money between your own accounts. Counting the outbound leg as
-- spending and the inbound leg as income inflated both sides of every
-- total while representing no real economic activity.
update transactions
set exclude_from_budget = true, exclusion_reason = 'transfer'
where exclude_from_budget = false
  and title ilike '%online banking transfer%';

create index if not exists idx_transactions_exclusion_reason
  on transactions(user_id, exclusion_reason);
