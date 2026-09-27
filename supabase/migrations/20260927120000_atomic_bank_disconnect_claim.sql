-- Server-side bank disconnect: a visible, retryable state; a serialized
-- decision about revoking a shared Plaid Item; an atomic finish; and a guard
-- so the client can no longer skip the server.
--
-- Never deployed in its first form (02c562b). Rewritten after that version
-- was run against a real PostgreSQL 17 instance and failed on every call:
-- its OUT parameters were named `provider` and `provider_item_id`, so
-- unqualified column references were ambiguous. Output names below no
-- longer collide, and every column reference is table-qualified anyway.
--
-- WHY A SEPARATE 'disconnecting' STATE
--
-- Marking an account 'disconnected' before revocation and credential
-- cleanup actually succeed would hide an unfinished operation: the app hides
-- disconnected accounts, so the user could neither see that it failed nor
-- retry it. 'disconnecting' stays visible, cannot be synced or reconnected,
-- and only finalize_bank_disconnect moves it to 'disconnected' - in the same
-- transaction that deletes its credential.
--
-- WHY THE ADVISORY LOCK
--
-- One Plaid Item can back several connected_accounts rows
-- (save_plaid_accounts_private stores one row, and one copy of the token,
-- per account from a single Link session). Revoking the Item revokes it for
-- all of them, so a disconnect may only revoke once no sibling still needs
-- it. Reading that with a plain SELECT lets two siblings disconnected at the
-- same moment each see the other as active and both skip revocation,
-- leaving the Item live with no token left to revoke it. The lock is
-- transaction-scoped: held only while deciding, never across the Plaid API
-- call, which the Edge Function makes after this commits.

alter table public.connected_accounts
  drop constraint if exists connected_accounts_sync_status_check;

alter table public.connected_accounts
  add constraint connected_accounts_sync_status_check
  check (sync_status in (
    'not_connected',
    'connected',
    'syncing',
    'error',              -- transient; retry is worth offering
    'reconnect_required', -- terminal until the user re-authenticates
    'disconnecting',      -- disconnect requested, not yet confirmed; retryable
    'disconnected'        -- revocation settled and credential deleted
  ));

comment on column public.connected_accounts.sync_status is
  'not_connected | connected | syncing | error | reconnect_required | '
  'disconnecting | disconnected. `disconnecting` means a disconnect was '
  'requested but its revocation or cleanup has not been confirmed; it stays '
  'visible and retryable. Only the server moves an account into or out of '
  'disconnecting/disconnected (see guard_bank_disconnect_state).';

-- ---------------------------------------------------------------------------
-- 1. Claim: move the account to 'disconnecting' and decide, under a lock,
--    whether this caller must revoke the shared Item.
-- ---------------------------------------------------------------------------
create or replace function public.claim_bank_disconnect(p_user_id uuid, p_account_id uuid)
returns table(account_provider text, item_id text, account_status text, sibling_active boolean)
language plpgsql security invoker set search_path = '' as $$
declare
  v_item text;
  v_provider text;
  v_status text;
  v_siblings boolean;
begin
  -- Unlocked lookup to learn which lock to take. Same error for a missing id
  -- and another user's id, so neither confirms the other. provider_item_id
  -- is set once at link time and is not writable by clients.
  select ca.provider_item_id into v_item
    from public.connected_accounts ca
   where ca.id = p_account_id and ca.user_id = p_user_id;
  if not found then
    raise exception 'bank account not found' using errcode = 'P0002';
  end if;

  -- Every account sharing an Item takes the same key; an account with no
  -- Item still serializes duplicate requests on itself.
  perform pg_advisory_xact_lock(
    hashtext('bank_disconnect:' || coalesce(v_item, p_account_id::text))::bigint);

  -- Fresh read after the lock. FOR UPDATE also makes a concurrent sync claim
  -- on this row wait, then re-check its conditions against 'disconnecting'.
  select ca.provider, ca.sync_status into v_provider, v_status
    from public.connected_accounts ca
   where ca.id = p_account_id and ca.user_id = p_user_id
     for update;

  if v_status not in ('disconnecting', 'disconnected') then
    update public.connected_accounts ca
       set sync_status = 'disconnecting', error_message = null
     where ca.id = p_account_id and ca.user_id = p_user_id;
    v_status := 'disconnecting';
  end if;

  -- Always computed fresh, including on a retry of an unfinished disconnect:
  -- a retry must never revoke an Item a still-connected sibling depends on.
  -- Siblings already disconnecting or disconnected have given it up.
  select exists (
    select 1
      from public.connected_accounts s
     where s.user_id = p_user_id
       and s.provider_item_id = v_item
       and s.id <> p_account_id
       and s.sync_status not in ('disconnecting', 'disconnected')
  ) into v_siblings;

  return query select v_provider, v_item, v_status, v_siblings;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Finalize: delete this account's own credential and mark it
--    disconnected in one transaction - never one without the other.
-- ---------------------------------------------------------------------------
create or replace function public.finalize_bank_disconnect(p_user_id uuid, p_account_id uuid)
returns boolean
language plpgsql security invoker set search_path = '' as $$
begin
  perform 1
    from public.connected_accounts ca
   where ca.id = p_account_id and ca.user_id = p_user_id
     and ca.sync_status in ('disconnecting', 'disconnected')
     for update;
  if not found then
    -- Only an account already claimed for disconnect can be finished.
    raise exception 'bank account is not being disconnected' using errcode = 'P0002';
  end if;

  delete from public.plaid_credentials pc
   where pc.connected_account_id = p_account_id and pc.user_id = p_user_id;

  update public.connected_accounts ca
     set sync_status = 'disconnected', access_token_ref = null, error_message = null
   where ca.id = p_account_id and ca.user_id = p_user_id;

  return true;
end;
$$;

revoke all on function public.claim_bank_disconnect(uuid, uuid) from public, anon, authenticated;
revoke all on function public.finalize_bank_disconnect(uuid, uuid) from public, anon, authenticated;
grant execute on function public.claim_bank_disconnect(uuid, uuid) to service_role;
grant execute on function public.finalize_bank_disconnect(uuid, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 3. Guard: signed-in clients may still update their own rows (the reconnect
--    flow sets reconnect_required -> connected), but may not skip the server
--    by writing 'disconnecting'/'disconnected' themselves, resurrect an
--    account that is being or has been disconnected, or delete a bank row -
--    deleting it cascades away the credential without revoking the Item.
--    A trigger rather than REVOKE: grants on this table have previously
--    failed to revoke on the live database (see _shared/plaidToken.ts).
-- ---------------------------------------------------------------------------
create or replace function public.guard_bank_disconnect_state()
returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'DELETE' then
      raise exception 'Bank connections can only be removed through Disconnect'
        using errcode = '42501';
    end if;
    if new.sync_status is distinct from old.sync_status
       and (new.sync_status in ('disconnecting', 'disconnected')
            or old.sync_status in ('disconnecting', 'disconnected')) then
      raise exception 'Only the server can change a bank connection to or from disconnected'
        using errcode = '42501';
    end if;
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_bank_disconnect_state on public.connected_accounts;
create trigger trg_guard_bank_disconnect_state
  before update or delete on public.connected_accounts
  for each row execute function public.guard_bank_disconnect_state();
