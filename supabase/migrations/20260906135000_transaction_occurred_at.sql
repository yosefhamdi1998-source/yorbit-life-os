-- Store the time of day a transaction happened.
--
-- WHY THIS IS NOT COSMETIC
--
-- transactions.date is a `date`. The Coinbase importer sliced the export's
-- Timestamp to ten characters and threw the rest away. FIFO cost basis then
-- had nothing to sort by within a day, so crypto_asset_summary walked lots in
--
--     order by crypto_asset, date, id
--
-- where `id` is a random uuid. On an account that trades 10-20 times a day,
-- that means the lots consumed by a sale were picked arbitrarily from among
-- that day's purchases.
--
-- Measured on the real 2018-2023 exports (scripts/test-crypto-pnl.js), same
-- data and same FIFO, changing nothing but the within-day sequence:
--
--     true timestamp order    -$13,083.92
--     date-only order         +$13,001.90
--     difference               $26,085.82
--
-- The sign flips. 2022 alone reads +$10,478.50 instead of -$5,004.52. An app
-- that tells someone they made ten thousand dollars in a year they lost five
-- thousand is worse than an app that says nothing.
--
-- occurred_at is nullable on purpose. Rows imported before this column
-- existed have no time to recover, and a fabricated midnight would be a
-- guess dressed as a fact. The P&L functions sort by
-- coalesce(occurred_at, date::timestamptz) and the UI reports how much of
-- the history has real times, so a partially-backfilled account is visibly
-- partial rather than quietly wrong.

alter table transactions
  add column if not exists occurred_at timestamptz;

comment on column transactions.occurred_at is
  'Exact time of the transaction where the source provides one. NULL means '
  'the source gave a date only, or the row predates this column. FIFO cost '
  'basis sorts by coalesce(occurred_at, date::timestamptz), so NULLs fall '
  'back to date-only ordering and their intra-day sequence is arbitrary.';

-- Supports the per-asset chronological walk the FIFO functions do.
create index if not exists transactions_user_asset_time_idx
  on transactions (user_id, crypto_asset, occurred_at, date)
  where crypto_quantity is not null;

-- Lets the UI state plainly how much of the P&L rests on real times.
create or replace function crypto_time_coverage()
returns table (
  total_rows bigint,
  with_time bigint,
  disposals bigint,
  disposals_with_time bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    count(*),
    count(*) filter (where occurred_at is not null),
    count(*) filter (where crypto_quantity < 0),
    count(*) filter (where crypto_quantity < 0 and occurred_at is not null)
  from transactions
  where user_id = auth.uid()
    and auth.uid() is not null
    and crypto_quantity is not null
    and not superseded_by_import
    and crypto_asset is not null
    and crypto_asset <> 'USD';
$$;

revoke execute on function crypto_time_coverage() from public;
grant execute on function crypto_time_coverage() to authenticated;
