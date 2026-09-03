-- Track what history a connected account ACTUALLY has, rather than
-- assuming the window we asked for is the window we got. Plaid backfills
-- an item's history asynchronously after connect, and each institution
-- caps how far back it will go — so "we requested 5 years" says nothing
-- about what's really there. These two columns let the app tell the
-- truth: the real earliest transaction on record, and whether a full
-- (rather than 30-day incremental) fetch has ever completed.
alter table connected_accounts
  add column if not exists history_start_date date,
  add column if not exists history_backfilled_at timestamptz;
