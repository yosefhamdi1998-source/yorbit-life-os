-- Atomically decides whether a bank-disconnect request is responsible for
-- revoking the Plaid Item behind it, and marks the account itself
-- disconnected, in one transaction.
--
-- WHY THIS EXISTS
--
-- One Plaid Item can back several of a user's connected_accounts rows at
-- once (save_plaid_accounts_private creates one row per account returned
-- from a single Link session - checking + savings from one bank login, for
-- example), each holding its own copy of the same access token. Revoking
-- the Item revokes it for all of them, so a disconnect must skip calling
-- Plaid whenever a sibling account still needs that same Item.
--
-- The Edge Function used to read that sibling state with a plain SELECT,
-- then decide, then write - three separate round trips. Two sibling
-- accounts disconnected at the same moment could each run that SELECT
-- before the other's write landed, each observe the other as still active,
-- and both skip revocation. The Item then stays live at Plaid forever, with
-- no local token left anywhere to revoke it later, since both requests also
-- deleted their own credential copy. Reproduced synthetically; see
-- scripts/test-bank-disconnect.mjs.
--
-- HOW THIS FIXES IT
--
-- pg_advisory_xact_lock serializes every disconnect for accounts sharing an
-- Item behind one lock, held only for this transaction (released
-- automatically on commit or rollback - never held across the slow Plaid
-- API call the Edge Function makes afterward, outside this function
-- entirely). The second concurrent call blocks here until the first
-- commits, then re-reads sync_status fresh - so it correctly sees the
-- first's write instead of a stale snapshot from before either ran.
create or replace function public.claim_bank_disconnect(p_user_id uuid, p_account_id uuid)
returns table(provider text, provider_item_id text, already_disconnected boolean, sibling_active boolean)
language plpgsql security invoker set search_path = '' as $$
declare
  v_item_id text;
  v_provider text;
  v_status text;
  v_sibling_count int;
begin
  -- Unlocked lookup just to learn which Item (if any) this account belongs
  -- to, and to confirm ownership - same "does not exist" response for a
  -- wrong id and a right id owned by someone else, so neither confirms the
  -- other. Re-read fresh after locking below; this row's own status here is
  -- not otherwise relied on.
  select ca.provider_item_id into v_item_id
    from public.connected_accounts ca
    where ca.id = p_account_id and ca.user_id = p_user_id;

  if not found then
    raise exception 'not found';
  end if;

  -- Accounts with no item_id share nothing and need no lock. Every account
  -- sharing an Item resolves the exact same lock key, so this always
  -- serializes correctly regardless of which specific sibling (or a
  -- duplicate request for this very account) is racing it.
  if v_item_id is not null then
    perform pg_advisory_xact_lock(hashtext('bank_disconnect:' || v_item_id)::bigint);
  end if;

  select provider, sync_status into v_provider, v_status
    from public.connected_accounts where id = p_account_id and user_id = p_user_id;

  if v_status = 'disconnected' then
    -- Already done (or a concurrent call just finished it while this one
    -- waited on the lock above) - the caller still re-attempts credential
    -- cleanup on its own, since an earlier attempt's cleanup step may have
    -- failed without undoing this.
    return query select v_provider, v_item_id, true, false;
    return;
  end if;

  select count(*) into v_sibling_count
    from public.connected_accounts
    where user_id = p_user_id and provider_item_id = v_item_id and id <> p_account_id
      and sync_status <> 'disconnected';

  update public.connected_accounts set sync_status = 'disconnected'
    where id = p_account_id and user_id = p_user_id;

  return query select v_provider, v_item_id, false, (v_sibling_count > 0);
end;
$$;

revoke all on function public.claim_bank_disconnect(uuid, uuid) from public, anon, authenticated;
grant execute on function public.claim_bank_disconnect(uuid, uuid) to service_role;
