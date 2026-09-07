-- Move Plaid access tokens out of a client-readable table entirely.
--
-- WHY NOT THE GRANT APPROACH (20260907120000)
--
-- That migration tried to hide one column with REVOKE. Two attempts failed
-- against the live database, both caught by its own assertion:
--
--     ERROR: P0001: access_token_ref is still SELECTable by authenticated
--
-- First attempt revoked at COLUMN level while the role held table-wide
-- SELECT, which in Postgres is a no-op. Second attempt revoked at TABLE level
-- and still failed, which means the privilege arrives by a path the running
-- role cannot revoke - a grant issued by a different grantor, since Postgres
-- lets you revoke only what you granted and warns rather than errors when you
-- try. Chasing that would mean discovering exactly which role granted what and
-- running as that role.
--
-- This approach does not care. RLS is not a grant: a table with RLS enabled
-- and NO policies returns zero rows to every ordinary role no matter who
-- granted what, and service_role bypasses RLS entirely so the edge functions
-- are unaffected. It removes the whole question rather than answering it.
--
-- WHAT THIS IS PROTECTING
--
-- A live Plaid PRODUCTION access token: ongoing read access to a real bank
-- account, no expiry, no per-user revocation. Verified readable from an
-- ordinary signed-in browser session before this change:
--
--     select('id,access_token_ref').limit(3)  ->  3 rows, "access-produ..."
--
-- ROLLOUT IS DELIBERATELY IN TWO STEPS. This migration COPIES tokens to the
-- new table and leaves the old column populated, so nothing breaks if the
-- edge functions have not been redeployed yet. Only after sync is verified
-- against the new table does 20260907160000 blank the old column. Deleting a
-- bank credential before its replacement is proven would mean every user
-- re-linking their bank.

-- ---------------------------------------------------------------------------
-- 1. The vault table.
-- ---------------------------------------------------------------------------
create table if not exists plaid_credentials (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  connected_account_id uuid not null references connected_accounts(id) on delete cascade,
  access_token text not null,
  item_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (connected_account_id)
);

comment on table plaid_credentials is
  'Live Plaid access tokens. RLS is ON with NO policies, so no ordinary role '
  'can read a single row; only service_role (which bypasses RLS) may touch '
  'this. Never add a policy here, and never expose it through PostgREST to '
  'anon or authenticated.';

-- ---------------------------------------------------------------------------
-- 2. RLS on, and deliberately no policies.
--
-- This is the whole security model. "No policy" is not an oversight to be
-- fixed later - it is the mechanism. Adding any policy to this table hands
-- bank credentials to whoever it matches.
-- ---------------------------------------------------------------------------
alter table plaid_credentials enable row level security;
alter table plaid_credentials force row level security;

-- Belt as well as braces. If a future GRANT ALL ON ALL TABLES sweeps this up,
-- RLS still returns nothing.
revoke all on plaid_credentials from public;
revoke all on plaid_credentials from anon;
revoke all on plaid_credentials from authenticated;
grant all on plaid_credentials to service_role;

create index if not exists plaid_credentials_account_idx
  on plaid_credentials (connected_account_id);

-- ---------------------------------------------------------------------------
-- 3. Copy the existing tokens across. Idempotent.
-- ---------------------------------------------------------------------------
insert into plaid_credentials (user_id, connected_account_id, access_token, item_id)
select ca.user_id, ca.id, ca.access_token_ref, ca.provider_item_id
from connected_accounts ca
where ca.access_token_ref is not null
  and ca.provider = 'plaid'
on conflict (connected_account_id) do update
  set access_token = excluded.access_token,
      item_id      = excluded.item_id,
      updated_at   = now();

-- ---------------------------------------------------------------------------
-- 4. Report, so the operator sees the copy actually happened.
-- ---------------------------------------------------------------------------
do $$
declare
  src int;
  dst int;
begin
  select count(*) into src from connected_accounts
    where access_token_ref is not null and provider = 'plaid';
  select count(*) into dst from plaid_credentials;

  raise notice 'plaid tokens: % in connected_accounts, % now in plaid_credentials', src, dst;

  if dst < src then
    raise exception 'Copy incomplete: % source tokens but only % copied', src, dst;
  end if;
end $$;
