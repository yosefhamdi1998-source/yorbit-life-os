-- CRITICAL: Plaid production access tokens are readable from the browser.
--
-- WHAT WAS WRONG
--
-- connected_accounts.access_token_ref holds a live Plaid PRODUCTION access
-- token - ongoing read access to a real bank account, no expiry, no per-user
-- revocation. Row-level security scopes the ROW to its owner, but RLS has no
-- concept of a column: any signed-in session could simply ask for it.
--
-- Verified from an ordinary authenticated browser session, not inferred:
--
--   supabase.from('connected_accounts').select('id,access_token_ref').limit(3)
--   -> 3 rows, 3 tokens, values beginning "access-produ..."
--
-- So the exposure is not merely "someone who steals the service key". It is
-- every signed-in session, every browser extension with page access, and any
-- XSS on any page of the app. Earlier notes in this repo claimed tokens were
-- "never sent to the browser"; that claim was wrong and this migration is the
-- correction.
--
-- The column name made it easy to miss. "_ref" reads like a pointer to a
-- secret held elsewhere. It is the secret.
--
-- THE FIX, in two independent layers
--
--   1. Column-level REVOKE. Postgres grants privileges per column, which is
--      exactly the tool RLS lacks. anon and authenticated lose SELECT on this
--      one column and keep it on every other. service_role is unaffected
--      because it bypasses grants, so every edge function keeps working with
--      no code change.
--
--   2. Encryption at rest, in 20260907130000. Layer 1 stops the live app from
--      handing the token out; layer 2 is what protects a stolen backup or a
--      leaked service key. They defend different attackers and neither
--      replaces the other.
--
-- WHY THIS CANNOT BREAK LINKED ACCOUNTS
--
-- Nothing in src/ selects this column. The only client reference is
-- Settings.jsx, which already destructures it out of the export payload:
--     rows.map(({ access_token_ref, ...rest }) => rest)
-- and a `select('*')` from the client simply returns the other columns rather
-- than erroring. The edge functions that do read it - plaid-sync-transactions,
-- plaid-sync-holdings, delete-account - all authenticate as service_role.

-- ---------------------------------------------------------------------------
-- 1. Take the column away from every browser-facing role.
--
-- TABLE-level revoke first, and this ordering is the whole trick. In Postgres
-- a column-level REVOKE removes only column-level grants; a role holding
-- SELECT on the WHOLE table keeps access to every column regardless. The
-- first version of this migration revoked only the column and the assertion
-- below caught it in production:
--
--     ERROR: P0001: access_token_ref is still SELECTable by authenticated
--
-- which is precisely why the assertion exists. Revoke the table, then grant
-- back the columns that are allowed.
--
-- PUBLIC is included because both anon and authenticated inherit from it, so
-- a PUBLIC grant would keep the token readable no matter what the named roles
-- are denied.
-- ---------------------------------------------------------------------------
revoke select on connected_accounts from public;
revoke select on connected_accounts from anon;
revoke select on connected_accounts from authenticated;

revoke insert, update on connected_accounts from public;
revoke insert, update on connected_accounts from anon;
revoke insert, update on connected_accounts from authenticated;

-- Grant back every OTHER column, generated from the catalogue rather than
-- typed. A hand-written list was wrong on the first attempt (guessed `mask`
-- and `item_id`; the table has `account_mask` and `provider_item_id`) and
-- would also silently omit any column added later.
do $$
declare
  cols text;
begin
  select string_agg(quote_ident(column_name), ', ' order by column_name)
    into cols
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'connected_accounts'
    and column_name <> 'access_token_ref';

  execute format('grant select (%s) on connected_accounts to authenticated', cols);
  execute format('grant insert (%s) on connected_accounts to authenticated', cols);
end $$;

-- Writes the app legitimately performs: presentation and sync bookkeeping.
-- Never credentials.
grant update (account_name, sync_status, last_synced_at, balance_updated_at, error_message)
  on connected_accounts to authenticated;

grant delete on connected_accounts to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Prove it, in the same transaction that changed it.
--
-- has_column_privilege returns the effective privilege after the statements
-- above. If a future migration re-grants the table wholesale, this raises and
-- that migration fails loudly instead of silently re-exposing bank tokens.
-- ---------------------------------------------------------------------------
do $$
begin
  if has_column_privilege('authenticated', 'connected_accounts', 'access_token_ref', 'SELECT') then
    raise exception 'access_token_ref is still SELECTable by authenticated';
  end if;
  if has_column_privilege('anon', 'connected_accounts', 'access_token_ref', 'SELECT') then
    raise exception 'access_token_ref is still SELECTable by anon';
  end if;
  if not has_column_privilege('authenticated', 'connected_accounts', 'account_name', 'SELECT') then
    raise exception 'ordinary columns lost SELECT - the app would break';
  end if;
end $$;

comment on column connected_accounts.access_token_ref is
  'LIVE Plaid production access token. Despite the "_ref" suffix this is the '
  'secret itself, not a pointer to one. SELECT is revoked from anon and '
  'authenticated at the column level; only service_role may read it. Never '
  'add it to a client query or an export.';
