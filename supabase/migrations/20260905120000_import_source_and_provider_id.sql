-- Record where each transaction came from, so duplicates can be identified
-- by ORIGIN instead of guessed at from title+date+amount.
--
-- WHY THE OLD DEDUP CANNOT WORK ON THIS DATA
--
-- The dedup key was `title-date-amount`. That assumes two rows sharing
-- those three fields must be the same event. For this user that assumption
-- is simply false: they trade on Coinbase daily and send to gambling sites,
-- routinely 10-20 transactions in one day, frequently for identical
-- amounts. Same title + same date + same amount is their NORMAL PATTERN.
--
-- An audit initially flagged 218 rows / $11,566 as "duplicates". Re-examined
-- by source, only 3 groups had two known distinct origins, and reading even
-- those showed two plaid:BoA rows on the same day for the same amount —
-- indistinguishable from two real Venmo sends. NOTHING was deleted, and
-- nothing should be: losing a real transaction is far worse than keeping a
-- duplicate in a system whose entire job is to be trustworthy about money.
--
-- WHAT ACTUALLY IDENTIFIES A DUPLICATE
--
-- Two things, neither of which was stored:
--   1. provider_transaction_id - Plaid's own stable id for an event. Two
--      rows with the same one are the same event, full stop. Two rows with
--      different ones are different events even if every other field matches.
--   2. import_source - which pipeline created the row. The same real payment
--      arriving once from Plaid and once from a Venmo CSV is a genuine
--      cross-source double import; two rows from the SAME source are two
--      real events the institution reported separately.

alter table transactions
  add column if not exists provider_transaction_id text,
  -- 'plaid' | 'csv:<institution>' | 'manual' | null for pre-existing rows
  add column if not exists import_source text;

-- Partial unique index: one row per Plaid transaction per user.
--
-- This is what makes re-syncing safe. It is deliberately NOT a constraint on
-- title/date/amount - that would reject the user's twentieth identical trade
-- of the day as a duplicate of the first.
--
-- WHERE provider_transaction_id IS NOT NULL leaves every existing row and
-- every CSV/manual row unconstrained, so the index can be added to a table
-- with 15,700 unkeyed rows without rejecting any of them.
create unique index if not exists transactions_provider_tx_unique
  on transactions (user_id, provider_transaction_id)
  where provider_transaction_id is not null;

create index if not exists idx_transactions_import_source
  on transactions (user_id, import_source);

comment on column transactions.provider_transaction_id is
  'Plaid transaction_id. NULL for CSV/manual rows and for everything imported before this column existed - those cannot be deduped reliably and must not be.';
comment on column transactions.import_source is
  'Which pipeline created this row. Used to tell a cross-source double import from two genuine same-day transactions.';

-- Best-effort backfill of source ONLY. provider_transaction_id is left null
-- for historical rows: Plaid ids were never captured and cannot be
-- reconstructed, and inventing one would create false uniqueness.
--
-- `notes` is overloaded - it holds import markers, Coinbase memo text
-- ("Withdrawal to 4744********5891", 161 rows) and free-text user notes -
-- so only the exact known markers are trusted here.
update transactions
set import_source = case
      when notes = 'Imported from Bank of America'  then 'plaid'
      when notes = 'Imported from Venmo - Personal' then 'csv:venmo'
      when notes ilike 'Imported from %'            then 'csv:other'
      else null
    end
where import_source is null
  and notes ilike 'Imported from %';
