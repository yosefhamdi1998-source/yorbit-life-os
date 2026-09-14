begin;
do $test$
declare u uuid; n integer; rejected boolean := false;
begin
 select id into u from auth.users limit 1;
 if u is null then raise exception 'No fixture owner available'; end if;
 perform public.save_plaid_accounts_private(u,'synthetic-atomic-check','synthetic-token-not-real',
 '[{"provider_account_id":"fixture-1","institution_name":"Synthetic QA","account_name":"Temporary check","current_balance":0}]'::jsonb);
 select count(*) into n from public.connected_accounts a join public.plaid_credentials c on c.connected_account_id=a.id
 where a.provider_item_id='synthetic-atomic-check' and a.user_id=u and a.access_token_ref is null and c.access_token='synthetic-token-not-real';
 if n<>1 then raise exception 'Private save check failed'; end if;
 begin
  perform public.save_plaid_accounts_private(u,'synthetic-rollback-check','synthetic-token-not-real',
  '[{"provider_account_id":"fixture-2","institution_name":"Synthetic QA","account_name":"Temporary check"},{}]'::jsonb);
 exception when others then rejected := true;
 end;
 if not rejected then raise exception 'Invalid partial batch accepted'; end if;
 if exists(select 1 from public.connected_accounts where provider_item_id='synthetic-rollback-check') then raise exception 'Partial account remained'; end if;
 if exists(select 1 from public.plaid_credentials where item_id='synthetic-rollback-check') then raise exception 'Partial credential remained'; end if;
 if has_function_privilege('anon','public.save_plaid_accounts_private(uuid,text,text,jsonb)','EXECUTE') or
 has_function_privilege('authenticated','public.save_plaid_accounts_private(uuid,text,text,jsonb)','EXECUTE') or
 not has_function_privilege('service_role','public.save_plaid_accounts_private(uuid,text,text,jsonb)','EXECUTE') then raise exception 'Incorrect function grants'; end if;
end $test$;
select 'PASS: private storage, partial-batch rollback and service-only grants; entire test rolled back' as result;
rollback;
