-- Crypto/brokerage holdings (Coinbase and similar) synced via Plaid's
-- Investments product. Separate from `transactions` on purpose — a holding
-- is a current position (symbol, quantity, value as of the last sync), not
-- a dated income/expense event, so it doesn't fit that table's shape.
create table if not exists investment_holdings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  connected_account_id uuid not null references connected_accounts(id) on delete cascade,
  security_name text,
  ticker_symbol text,
  quantity numeric,
  institution_value numeric not null default 0,
  currency text default 'USD',
  updated_date timestamptz not null default now(),
  created_date timestamptz not null default now(),
  unique (connected_account_id, security_name, ticker_symbol)
);

alter table investment_holdings enable row level security;

create policy "Users can view their own holdings"
  on investment_holdings for select
  using (auth.uid() = user_id);

-- Holdings are written only by the sync edge function using the
-- service-role key, which bypasses RLS entirely — no insert/update/delete
-- policy needed for end users, same pattern as `transactions` imported via
-- plaid-sync-transactions.

create index if not exists investment_holdings_user_id_idx on investment_holdings(user_id);
create index if not exists investment_holdings_connected_account_id_idx on investment_holdings(connected_account_id);
