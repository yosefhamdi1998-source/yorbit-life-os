-- READ-ONLY. Writes nothing, creates nothing, changes no permission.
--
-- Verifies the LIVE isolation rules, not what the migration files say they
-- should be. The two have already diverged once: two REVOKEs on
-- connected_accounts.access_token_ref were written, applied, and silently
-- did nothing, which is exactly the failure this catches.
--
-- Every row returned is a finding. No rows means every user-owned table
-- enforces owner-only access in the database itself.
--
-- Run: npm run audit:rls-isolation

-- 1. RLS enabled? A table with perfect policies but RLS switched off is
--    wide open — the policies are simply not consulted.
select
  'RLS DISABLED' as finding,
  c.relname      as object,
  'policies exist but are not enforced' as detail
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
  and not c.relrowsecurity
  and exists (select 1 from pg_attribute a
              where a.attrelid = c.oid and a.attname = 'user_id' and a.attnum > 0)

union all

-- 2. A user-owned table with NO policy at all. Under enabled RLS that
--    denies everything, which is safe but usually means a table was added
--    and the policy loop was never updated — the app will look broken.
select
  'NO POLICY ON USER TABLE',
  c.relname,
  'RLS on, zero policies: all client access denied'
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
  and c.relrowsecurity
  and exists (select 1 from pg_attribute a
              where a.attrelid = c.oid and a.attname = 'user_id' and a.attnum > 0)
  and not exists (select 1 from pg_policies p
                  where p.schemaname = 'public' and p.tablename = c.relname)

union all

-- 3. THE CENTRAL CHECK. A policy on a user-owned table whose expression
--    does not mention auth.uid() cannot be scoping rows to the caller.
--    `using (true)` is the classic accident and reads as a normal policy.
select
  'POLICY NOT SCOPED TO CALLER',
  p.tablename || '.' || p.policyname,
  'cmd=' || p.cmd || ' using=' || coalesce(p.qual, '<none>')
from pg_policies p
join pg_class c on c.relname = p.tablename
join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
where p.schemaname = 'public'
  and exists (select 1 from pg_attribute a
              where a.attrelid = c.oid and a.attname = 'user_id' and a.attnum > 0)
  and p.qual is not null
  and p.qual not like '%auth.uid()%'

union all

-- 4. Same for the write side. A WITH CHECK that omits auth.uid() lets a
--    caller INSERT or UPDATE a row carrying somebody else's user_id.
select
  'WRITE CHECK NOT SCOPED TO CALLER',
  p.tablename || '.' || p.policyname,
  'cmd=' || p.cmd || ' with_check=' || coalesce(p.with_check, '<none>')
from pg_policies p
join pg_class c on c.relname = p.tablename
join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
where p.schemaname = 'public'
  and exists (select 1 from pg_attribute a
              where a.attrelid = c.oid and a.attname = 'user_id' and a.attnum > 0)
  and p.cmd in ('INSERT', 'UPDATE', 'ALL')
  and coalesce(p.with_check, '') not like '%auth.uid()%'

union all

-- 5. Anything reachable by the ANONYMOUS role. Signed-out visitors should
--    reach no user table at all.
select
  'ANON HAS TABLE PRIVILEGE',
  table_name || ' (' || privilege_type || ')',
  'anon should not reach user data'
from information_schema.role_table_grants
where table_schema = 'public'
  and grantee = 'anon'
  and table_name in (
    select c.relname from pg_class c
    join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
    where exists (select 1 from pg_attribute a
                  where a.attrelid = c.oid and a.attname = 'user_id' and a.attnum > 0))

union all

-- 6. SECURITY DEFINER functions run as their owner, so an unpinned
--    search_path lets a caller resolve names to objects they control.
select
  'DEFINER FUNCTION WITHOUT PINNED search_path',
  p.proname,
  'security definer, proconfig is null'
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
where p.prosecdef
  and (p.proconfig is null or not exists (
        select 1 from unnest(p.proconfig) cfg where cfg like 'search_path=%'))

union all

-- 7. A SECURITY DEFINER function callable by anon is the strongest form of
--    this problem: it runs with owner privileges for a signed-out caller.
select
  'DEFINER FUNCTION CALLABLE BY ANON',
  p.proname,
  'anon holds EXECUTE on a security definer function'
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
where p.prosecdef
  and has_function_privilege('anon', p.oid, 'EXECUTE');
