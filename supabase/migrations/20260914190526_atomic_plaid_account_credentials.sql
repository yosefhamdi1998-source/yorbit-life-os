-- Only the authenticated Edge Function's service client may call this.
-- A failure rolls back every account and private credential in this call.
create or replace function public.save_plaid_accounts_private(p_user_id uuid, p_item_id text, p_access_token text, p_accounts jsonb)
returns setof public.connected_accounts
language plpgsql security invoker set search_path = '' as $$
declare a jsonb; saved public.connected_accounts;
begin
  if p_user_id is null or nullif(p_item_id,'') is null or nullif(p_access_token,'') is null
     or p_accounts is null or jsonb_typeof(p_accounts) <> 'array' then
    raise exception 'Invalid bank account payload';
  end if;
  if jsonb_array_length(p_accounts) < 1 or jsonb_array_length(p_accounts) > 100 then
    raise exception 'Invalid account count';
  end if;
  for a in select value from jsonb_array_elements(p_accounts) loop
    if nullif(a->>'provider_account_id','') is null then raise exception 'Missing provider account'; end if;
    insert into public.connected_accounts
      (user_id,provider,institution_name,account_name,account_type,account_mask,provider_account_id,provider_item_id,access_token_ref,sync_status,current_balance,available_balance,balance_limit,currency,balance_updated_at)
    values
      (p_user_id,'plaid',a->>'institution_name',a->>'account_name',a->>'account_type',a->>'account_mask',a->>'provider_account_id',p_item_id,null,'connected',
      (a->>'current_balance')::numeric,(a->>'available_balance')::numeric,(a->>'balance_limit')::numeric,coalesce(a->>'currency','USD'),(a->>'balance_updated_at')::timestamptz)
    returning * into saved;
    insert into public.plaid_credentials(user_id,connected_account_id,access_token,item_id)
      values(p_user_id,saved.id,p_access_token,p_item_id);
    return next saved;
  end loop;
end;
$$;
revoke all on function public.save_plaid_accounts_private(uuid,text,text,jsonb) from public, anon, authenticated;
grant execute on function public.save_plaid_accounts_private(uuid,text,text,jsonb) to service_role;
