-- Stop `notes` being a dual-purpose field.
--
-- It currently holds three unrelated kinds of data at once:
--   659  'Imported from Bank of America'   <- machine import marker
--   394  'Imported from Venmo - Personal'  <- machine import marker
--   161  'Withdrawal to 4744********5891'  <- Coinbase's own memo text
--   110  'Withdrawal to 4744********7049'  <- Coinbase's own memo text
--  2116  (null)
--        ...plus whatever the user types on a transaction.
--
-- Two costs. The user's own notes are mixed with machine output, so the
-- notes field is not really theirs. And origin had to be INFERRED from a
-- string that also contains memo text, which is how a duplicate audit ended
-- up unable to establish where any row came from.
--
-- After this migration:
--   import_source          where the row came from      (machine)
--   import_run_id          which sync/import created it (machine)
--   provider_memo          the institution's own memo   (machine, read-only)
--   notes                  the user's note, and nothing else

alter table transactions
  add column if not exists import_run_id text,
  add column if not exists provider_memo text;

create index if not exists idx_transactions_import_run
  on transactions (user_id, import_run_id);

comment on column transactions.notes is
  'The USER''s note. Never written by an importer.';
comment on column transactions.provider_memo is
  'Memo text supplied by the institution (e.g. Coinbase "Withdrawal to ...."). Machine-written, read-only to the user.';
comment on column transactions.import_run_id is
  'Identifies the sync or import that created this row, so one run can be traced or reversed.';

-- 1. Institution memo text moves out of notes into provider_memo.
--    Matched narrowly on the shapes actually present rather than anything
--    resembling a memo, so a genuine user note is never moved.
update transactions
set provider_memo = notes,
    notes = null
where notes is not null
  and provider_memo is null
  and (notes ~* '^Withdrawal to '
       or notes ~* '^Deposit from '
       or notes ~* '^Congrats, you earned cash back'
       or notes ~* '^EDI PYMNTS$');

-- 2. Import markers were never user content. import_source already carries
--    this information (backfilled in the previous migration), so the marker
--    string itself is redundant and is cleared.
update transactions
set notes = null
where notes ilike 'Imported from %';

-- 3. Anything still in notes is the user's own text and is left untouched.
