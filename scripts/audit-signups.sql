-- Owner-only read-only audit. Never commit the resulting private roster.
select jsonb_build_object(
 'users',(select jsonb_agg(x) from (
 select u.id,u.email,coalesce(u.raw_user_meta_data->>'full_name',u.raw_user_meta_data->>'name') as name,
 u.created_at,u.email_confirmed_at,u.last_sign_in_at,
 exists(select 1 from public.profiles p where p.id=u.id) as has_profile,
 (select count(*) from public.transactions t where t.user_id=u.id) as transactions,
 (select count(*) from public.budgets b where b.user_id=u.id) as budgets,
 (select count(*) from public.bills b where b.user_id=u.id) as bills,
 (select count(*) from public.connected_accounts c where c.user_id=u.id) as bank_accounts,
 (select count(distinct c.provider_item_id) from public.connected_accounts c where c.user_id=u.id) as bank_connections,
 (select jsonb_agg(distinct c.sync_status) from public.connected_accounts c where c.user_id=u.id) as bank_statuses,
 (select jsonb_agg(distinct i.provider) from auth.identities i where i.user_id=u.id) as login_providers
 from auth.users u order by u.created_at) x),
 'orphan_profiles',(select count(*) from public.profiles p where not exists(select 1 from auth.users u where u.id=p.id)),
 'duplicate_normalized_emails',(select count(*) from (select lower(trim(email)) from auth.users group by 1 having count(*)>1) d),
 'total_bank_connections',(select count(distinct provider_item_id) from public.connected_accounts),
 'bank_connection_shared_between_users',(select count(*) from (select provider_item_id from public.connected_accounts where provider_item_id is not null group by 1 having count(distinct user_id)>1) c)
) as signup_audit;
