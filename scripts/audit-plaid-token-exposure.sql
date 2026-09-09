-- Read-only. Measures how exposed live Plaid access tokens still are.
--
-- WHY THIS EXISTS
--
-- `plaid_credentials` is the safe home for Plaid access tokens: RLS on, zero
-- policies, so no ordinary role can read it and only service_role (which
-- bypasses RLS) can. That model is sound.
--
-- The problem is the OLD home. Every Plaid link still writes the same live
-- production token to `connected_accounts.access_token_ref` as well
-- (plaid-exchange-token/index.ts), and the vault write immediately after it
-- is explicitly NON-FATAL — on failure it logs and carries on, leaving the
-- legacy column as the only copy. Two separate migrations tried to REVOKE
-- access to that column against the live database and BOTH failed:
--
--     ERROR: P0001: access_token_ref is still SELECTable by authenticated
--
-- because the privilege arrives from a grantor the running role cannot
-- revoke. So the column's protection is unverified by construction.
--
-- `_shared/plaidToken.ts` says the legacy copy "is blanked by 20260907160000
-- once sync is verified against the vault". That migration id is
-- 20260907160000_net_worth_value_positive.sql — it constrains
-- net_worth_entries.value and does not touch Plaid at all. No migration in
-- the tree blanks the column. The retirement step was never written, so the
-- transitional state has no end date and grows with every new bank link.
--
-- This script does not change anything. It answers the three questions that
-- decide what to do next, and every row it returns is a finding.
--
-- Run: npx supabase db query --linked -f scripts/audit-plaid-token-exposure.sql

-- 1. Can an ordinary signed-in role still read the column? This is the
--    assertion both lockdown migrations tried and failed to make true.
select
  'COLUMN STILL READABLE BY CLIENT' as finding,
  grantee                           as detail,
  'revoke did not take'             as note
from (
  select unnest(array['anon','authenticated']) as grantee
) roles
where has_column_privilege(grantee, 'public.connected_accounts', 'access_token_ref', 'SELECT')

union all

-- 2. Can an ordinary signed-in role WRITE it? A client that can set this
--    column chooses which Plaid token the server later syncs with, because
--    getPlaidAccessToken falls back to it whenever the vault has no row.
select
  'COLUMN STILL WRITABLE BY CLIENT',
  grantee || ' has ' || priv,
  'client can choose the token the server syncs with'
from (
  select unnest(array['anon','authenticated']) as grantee,
         unnest(array['INSERT','UPDATE'])      as priv
) w
where has_column_privilege(grantee, 'public.connected_accounts', 'access_token_ref', priv)

union all

-- 3. How many live tokens are sitting in the legacy column, and are they all
--    safely copied to the vault? Anything with no vault row CANNOT have the
--    legacy column blanked yet — blanking it would break that connection.
select
  'LEGACY TOKEN PRESENT',
  count(*)::text || ' connected_accounts row(s) still hold a token',
  count(*) filter (
    where not exists (
      select 1 from plaid_credentials pc
      where pc.connected_account_id = ca.id
        and pc.access_token = ca.access_token_ref
    )
  )::text || ' of them have NO matching vault copy'
from connected_accounts ca
where ca.access_token_ref is not null
  and ca.provider = 'plaid'
having count(*) > 0

union all

-- 4. The RLS policies from the generic loop in schema.sql are still present
--    on this table. `subscriptions` had its equivalents dropped once the
--    entitlement bypass was found; connected_accounts kept them.
select
  'CLIENT WRITE POLICY PRESENT',
  policyname,
  'cmd=' || cmd
from pg_policies
where schemaname = 'public'
  and tablename = 'connected_accounts'
  and cmd in ('INSERT','UPDATE','DELETE');
