select jsonb_build_object(
 'columns', (select jsonb_agg(jsonb_build_object('table',table_name,'column',column_name)) from information_schema.columns where table_schema='public' and table_name in ('profiles','connected_accounts','transactions','budgets','bills','app_settings')),
 'signup_triggers',(select jsonb_agg(pg_get_triggerdef(oid)) from pg_trigger where tgrelid='auth.users'::regclass and not tgisinternal),
 'signup_function',(select pg_get_functiondef(oid) from pg_proc where proname='enforce_email_allowlist' and pronamespace='public'::regnamespace)
) as signup_schema;
