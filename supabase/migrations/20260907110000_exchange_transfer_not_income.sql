-- A transfer from your own exchange account is not earned income.
--
-- WHAT WAS WRONG
--
-- Seven Plaid rows titled exactly "Coinbase" were categorised `salary` and
-- counted as income, inflating 2026 earnings by $847.34:
--
--   2026-06-04  income  $75.66  [salary]  Coinbase
--   2026-06-29  income  $115.25 [salary]  Coinbase
--   2026-06-29  income  $137.55 [salary]  Coinbase
--   2026-06-29  income  $120.84 [salary]  Coinbase
--   2026-07-06  income  $115.69 [salary]  Coinbase
--   2026-07-10  income  $147.38 [salary]  Coinbase
--   2026-07-10  income  $134.97 [salary]  Coinbase
--
-- 832 sibling rows describing the same movement WERE excluded, because their
-- descriptors are longer and matched the existing rule ("COIN*YHAMDI ... PMNT
-- RCVD"). These seven arrive from Plaid with the merchant name already
-- cleaned to the bare word, so the substring the rule looked for was gone.
-- Plaid tidying a description is not a reason to reclassify money.
--
-- Money moving between the user's own bank and their own exchange is a
-- balance movement on both sides: the deposit is not spending and the
-- withdrawal is not earnings. Real crypto income is realized P&L, which
-- crypto_pnl_by_year computes separately from actual closed positions.
--
-- SCOPE, deliberately narrow. Swept every counted income row (217 of them)
-- for exchange and wallet names before writing this. Only Coinbase leaked:
--   zelle   6 rows $1,110.00  - ride payments, correctly counted as income
--   venmo   5 rows    $50.82  - cash-back rewards, genuinely income
--   coinbase 7 rows   $847.34  - THIS BUG
-- So this rule names exchanges only. It must never catch Zelle or Venmo,
-- which carry real income for this user.

-- ---------------------------------------------------------------------------
-- 1. Repair the existing rows.
-- ---------------------------------------------------------------------------
update transactions
set exclude_from_budget = true,
    exclusion_reason = 'investment',
    category = 'investment'
where superseded_by_import = false
  and crypto_quantity is null
  and exclude_from_budget = false
  and type = 'income'
  -- Anchored, not a substring search. `\y` is a Postgres word boundary, so
  -- this matches the standalone word and not "Coinbase Pro Rewards" style
  -- descriptors that may carry different meaning later.
  and title ~* '\ycoinbase\y'
  -- Only bare, transfer-shaped descriptors. A row whose title carries more
  -- than the exchange name and a reference is left alone for a human to
  -- judge rather than silently reclassified.
  and length(regexp_replace(title, '[^a-zA-Z]', '', 'g')) <= 20;

-- ---------------------------------------------------------------------------
-- 2. Stop it recurring, for every exchange - not just the one that leaked.
-- ---------------------------------------------------------------------------
create or replace function is_exchange_transfer(p_title text)
returns boolean
language sql
immutable
as $$
  select p_title is not null
     and p_title ~* '\y(coinbase|binance|kraken|gemini|crypto\.com|blockfi|bitstamp|bitfinex|okcoin)\y'
     -- Wallet and P2P services are deliberately absent: Zelle and Venmo
     -- carry this user's actual rent and ride income. A rule that swept
     -- "money apps" generally would erase $1,110 of real earnings.
     and length(regexp_replace(p_title, '[^a-zA-Z]', '', 'g')) <= 20;
$$;

comment on function is_exchange_transfer(text) is
  'True for a bare exchange-name descriptor, e.g. Plaid''s cleaned "Coinbase". '
  'Such a row is a balance movement between the user''s own accounts, never '
  'earned income. Excludes Zelle/Venmo on purpose - those carry real income.';

revoke execute on function is_exchange_transfer(text) from public, anon, authenticated;
grant execute on function is_exchange_transfer(text) to service_role;
