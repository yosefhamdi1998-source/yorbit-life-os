-- Holdings are a current bank snapshot, not an append-only transaction ledger.
-- Stable provider IDs distinguish securities even when names or tickers match.
alter table public.investment_holdings add column if not exists provider_security_id text;
alter table public.investment_holdings drop constraint if exists investment_holdings_connected_account_id_security_name_tick_key;
create unique index if not exists investment_holdings_provider_security_unique
 on public.investment_holdings(connected_account_id,provider_security_id)
 where provider_security_id is not null;

create or replace function public.replace_investment_holdings_snapshot(
 p_account_id uuid,p_user_id uuid,p_holdings jsonb
) returns integer language plpgsql security invoker set search_path=''
as $$
declare n integer;
begin
 -- Serialize replacement with disconnects, and verify the worker's owner.
 perform 1 from public.connected_accounts
 where id=p_account_id and user_id=p_user_id and sync_status='syncing' for update;
 if not found then raise exception 'Account is not available for this sync'; end if;
 if p_holdings is null or jsonb_typeof(p_holdings)<>'array' then
  raise exception 'Holdings snapshot must be an array';
 end if;
 if exists(select 1 from jsonb_array_elements(p_holdings) h where
   jsonb_typeof(h)<>'object' or jsonb_typeof(h->'provider_security_id') is distinct from 'string'
   or coalesce(h->>'provider_security_id','')='' or jsonb_typeof(h->'institution_value') is distinct from 'number'
   or jsonb_typeof(h->'quantity') is distinct from 'number'
   or jsonb_typeof(h->'security_name') is distinct from 'string'
   or coalesce(h->>'security_name','')=''
   or jsonb_typeof(h->'currency') is distinct from 'string' or coalesce(h->>'currency','')=''
 ) then raise exception 'Holdings snapshot is incomplete'; end if;
 if (select count(*) from jsonb_array_elements(p_holdings))<>
    (select count(distinct h->>'provider_security_id') from jsonb_array_elements(p_holdings) h)
 then raise exception 'Holdings snapshot has duplicate security IDs'; end if;

 delete from public.investment_holdings where connected_account_id=p_account_id and user_id=p_user_id;
 insert into public.investment_holdings(user_id,connected_account_id,provider_security_id,security_name,ticker_symbol,quantity,institution_value,currency)
 select p_user_id,p_account_id,h->>'provider_security_id',h->>'security_name',h->>'ticker_symbol',
  (h->>'quantity')::numeric,(h->>'institution_value')::numeric,h->>'currency'
 from jsonb_array_elements(p_holdings) h;
 get diagnostics n=row_count;
 update public.connected_accounts set sync_status='connected',error_message=null,last_synced_at=now()
 where id=p_account_id and user_id=p_user_id;
 return n;
end $$;
revoke all on function public.replace_investment_holdings_snapshot(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.replace_investment_holdings_snapshot(uuid,uuid,jsonb) to service_role;
