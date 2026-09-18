-- Read-only. Measures how exposed live Plaid access tokens still are.
--
-- WHY THIS EXISTS
--
-- `plaid_credentials` is the safe home for Plaid access tokens: RLS on, zero
-- policies, so no ordinary role can read it and only service_role (which
-- bypasses RLS) can. That model is sound.
--
-- The problem is the OLD home, `connected_accounts.access_token_ref`.
--
-- NEW links are no longer affected: since migration 20260914190526
-- (save_plaid_accounts_private) the insert writes NULL into that column, so
-- nothing added from that point holds a second copy of the token. That half is
-- fixed and this script should confirm it stays fixed.
--
-- What remains is the accounts linked BEFORE that change, and there the
-- column's protection is unverified by construction: two separate migrations
-- tried to REVOKE access to it against the live database and BOTH failed —
--
--     ERROR: P0001: access_token_ref is still SELECTable by authenticated
--
-- because the privilege arrives from a grantor the running role cannot revoke.
--
-- Nothing has blanked those older rows. `_shared/plaidToken.ts` still says the
-- legacy copy "is blanked by 20260907160000 once sync is verified against the
-- vault", but that id is 20260907160000_net_worth_value_positive.sql, which
-- constrains net_worth_entries.value and never touches Plaid. No migration in
-- the tree clears the column, so the comment describes a step that was never
-- written. The count below is what decides whether that still matters.
--
-- VERIFIED STATE, 2026-09-18. Run against the linked project:
--
--     plaid accounts ............................ 9
--     ...holding a legacy token ................. 0
--     rows in plaid_credentials vault ........... 9
--
-- So every connected account's token now lives only in the vault, and the old
-- column is empty. The exposure this script was written to measure is closed in
-- practice; from here its job is to prove it stays closed.
--
-- Two things it still reports, deliberately. The column remains readable and
-- writable by `authenticated` (those REVOKEs really did fail), and
-- connected_accounts still carries client INSERT/UPDATE/DELETE policies. With
-- the column empty and getPlaidAccessToken checking the vault FIRST, a value a
-- client wrote there would be ignored for any account that has a vault row —
-- and all nine do. That is defence in depth worth keeping visible, not a live
-- hole. If the legacy count ever climbs above zero, it becomes one again.
--
-- This script does not change anything. Every row it returns is a finding.
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
