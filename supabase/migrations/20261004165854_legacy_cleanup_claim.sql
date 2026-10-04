-- Maintenance may only finish an existing disconnect. A stale candidate list
-- must never turn a newly active/replaced account into a new disconnect.
-- Same lock order as claim_bank_disconnect: Item advisory lock, then row lock.
create or replace function public.claim_legacy_bank_disconnect(
  p_user_id uuid, p_account_id uuid, p_expected_item_id text
)
returns table(account_provider text, item_id text, account_status text, sibling_active boolean)
language plpgsql security invoker set search_path = '' as $$
declare
  v_account public.connected_accounts%rowtype;
begin
  perform pg_advisory_xact_lock(
    hashtext('bank_disconnect:' || coalesce(p_expected_item_id, p_account_id::text))::bigint);
  select ca.* into v_account from public.connected_accounts ca
   where ca.id = p_account_id and ca.user_id = p_user_id for update;
  if not found then
    raise exception 'bank account not found' using errcode = 'P0002';
  end if;
  if v_account.provider is distinct from 'plaid'
     or v_account.sync_status not in ('disconnecting', 'disconnected')
     or v_account.provider_item_id is distinct from p_expected_item_id then
    raise exception 'bank account no longer eligible for maintenance' using errcode = '55000';
  end if;
  return query select * from public.claim_bank_disconnect(p_user_id, p_account_id);
end;
$$;

revoke all on function public.claim_legacy_bank_disconnect(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.claim_legacy_bank_disconnect(uuid, uuid, text) to service_role;
