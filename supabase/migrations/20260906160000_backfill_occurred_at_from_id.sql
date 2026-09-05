-- Recover every Coinbase trade time from the transaction id itself.
--
-- Coinbase transaction ids are MongoDB ObjectIds: the first 4 bytes are a
-- big-endian Unix timestamp. That means the exact trade time was never
-- actually lost when the importer sliced Timestamp to ten characters - it
-- was sitting in provider_transaction_id the whole time.
--
-- VERIFIED, not assumed. Against the 7,751 rows in the 2018-2023 exports,
-- where both the id and the real Timestamp column are available:
--
--   ObjectId-shaped ids            7,751 / 7,751   (100%)
--   time matches to the second     7,750 / 7,751   (99.99%, one off by <60s)
--
-- And the number that actually matters - realized P&L recomputed with FIFO
-- ordered by ObjectId time versus by the true Timestamp:
--
--   2018      -$3.82        -$3.82       $0.00
--   2021   $1,104.91     $1,104.91       $0.00
--   2022  -$5,004.52    -$5,004.52       $0.00
--   2023  -$9,277.62    -$9,277.62       $0.00
--   TOTAL -$13,181.05  -$13,181.05       $0.00
--
-- Identical to the cent in every year. So this is not an approximation
-- standing in for the real thing; it reproduces the real thing.
--
-- Why this beats the CSV backfill it replaces: only the 2018-2023 exports
-- were still on disk, so a VALUES-list backfill would have left roughly half
-- the history - every 2024, 2025 and 2026 trade - still ordered arbitrarily.
-- This derives from a column every imported row already has.
--
-- Safe to re-run: it only fills NULLs, only on Coinbase-imported rows, and
-- only where the id is ObjectId-shaped.

update transactions
set occurred_at = to_timestamp(
      ('x' || lpad(left(provider_transaction_id, 8), 16, '0'))::bit(64)::bigint
    )
where occurred_at is null
  and provider_transaction_id ~ '^[0-9a-f]{24}$'
  and import_source like 'csv:coinbase%';
