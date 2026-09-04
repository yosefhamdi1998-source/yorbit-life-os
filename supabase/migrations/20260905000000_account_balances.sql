-- Store the account balances Plaid already sends us.
--
-- connected_accounts had 17 columns and not one financial value, so the
-- Net Worth screen read an empty net_worth_entries table and displayed $0
-- after months of real use.
--
-- No new Plaid product, no re-authorisation, no user input needed: the
-- /transactions/get response already contains an `accounts` array where
-- every entry carries balances.current, balances.available and
-- balances.limit. plaid-sync-transactions read `.transactions` and
-- `.total_transactions` off that response and ignored `.accounts`
-- entirely. The same data arrives at connect time in plaid-exchange-token
-- and was likewise discarded.

alter table connected_accounts
  add column if not exists current_balance numeric,
  add column if not exists available_balance numeric,
  add column if not exists balance_limit numeric,
  add column if not exists currency text default 'USD',
  -- Distinct from last_synced_at: a sync can succeed while the balance
  -- payload is missing, and a stale balance shown as current is exactly
  -- the kind of quietly-wrong number this audit has been removing.
  add column if not exists balance_updated_at timestamptz;

comment on column connected_accounts.current_balance is
  'Plaid balances.current at last sync. NULL means never captured - render as unknown, never as zero.';

-- ---------------------------------------------------------------------
-- Manual net worth entries: mark what is hand-entered so the UI can say so
-- ---------------------------------------------------------------------
-- Everything in net_worth_entries is typed by a person and goes stale
-- silently. A car valued 8 months ago sitting next to a live bank balance,
-- with nothing distinguishing them, is a number the user will trust more
-- than it deserves.
alter table net_worth_entries
  add column if not exists value_updated_at timestamptz default now();

-- Backfill so existing rows have an honest age rather than appearing new.
update net_worth_entries
set value_updated_at = coalesce(value_updated_at, updated_date, created_date)
where value_updated_at is null;

-- Keep the age honest automatically: any change to `value` restamps it.
-- Relying on the UI to remember would mean the one code path that forgets
-- produces a stale number labelled fresh.
create or replace function stamp_net_worth_value_change()
returns trigger as $$
begin
  if new.value is distinct from old.value then
    new.value_updated_at := now();
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_stamp_net_worth_value on net_worth_entries;
create trigger trg_stamp_net_worth_value
  before update on net_worth_entries
  for each row
  execute function stamp_net_worth_value_change();
