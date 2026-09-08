select jsonb_build_object(
 'tables',(select jsonb_agg(x) from (select c.relname as name,c.relrowsecurity as rls,has_table_privilege('anon',c.oid,'select') as anon_select,(select count(*) from pg_policy p where p.polrelid=c.oid) as policies from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r') x),
 'definer_functions',(select jsonb_agg(x) from (select p.proname as name,has_function_privilege('anon',p.oid,'execute') as anon_execute,has_function_privilege('authenticated',p.oid,'execute') as user_execute from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prosecdef) x)
) as access_audit;
