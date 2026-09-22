-- Synthetic users/accounts only. The final exception rolls back every fixture,
-- the test trigger, and the helper function. Run this entire file together.
begin;
create function pg_temp.reject_synthetic_holding() returns trigger language plpgsql as $test$
begin
 if new.security_name='Synthetic reject at insert' then raise exception 'Synthetic storage failure';end if;
 return new;
end $test$;
create trigger test_reject_synthetic_holding before insert on public.investment_holdings
 for each row execute function pg_temp.reject_synthetic_holding();
do $$
declare a uuid:=gen_random_uuid();b uuid:=gen_random_uuid();c uuid:=gen_random_uuid();d uuid:=gen_random_uuid();
 n integer; failures integer:=0; snapshot jsonb;
begin
 insert into auth.users(id,aud,role,email,encrypted_password) values
 (a,'authenticated','authenticated','holdings-a-'||a||'@synthetic.invalid',''),
 (b,'authenticated','authenticated','holdings-b-'||b||'@synthetic.invalid','');
 insert into public.connected_accounts(id,user_id,institution_name,account_name,sync_status,last_synced_at) values
 (c,a,'Synthetic','Synthetic A','syncing','2026-01-01'),(d,b,'Synthetic','Synthetic B','connected','2026-01-01');
 insert into public.investment_holdings(user_id,connected_account_id,security_name,institution_value) values(a,c,'Stale fixture',10),(b,d,'Other account',20);
 snapshot:='[{"provider_security_id":"s1","security_name":"Same name","ticker_symbol":null,"quantity":1,"institution_value":5,"currency":"USD"},{"provider_security_id":"s2","security_name":"Same name","ticker_symbol":null,"quantity":2,"institution_value":10,"currency":"USD"}]';
 execute 'set local role authenticated';
 begin perform public.replace_investment_holdings_snapshot(c,a,snapshot); failures:=failures+1;
 exception when insufficient_privilege then null; end;
 execute 'reset role';
 execute 'set local role service_role';
 begin perform public.replace_investment_holdings_snapshot(c,b,snapshot);failures:=failures+1;
 exception when raise_exception then null;end;
 begin perform public.replace_investment_holdings_snapshot(d,b,snapshot);failures:=failures+1;
 exception when raise_exception then null;end;
 begin perform public.replace_investment_holdings_snapshot(c,a,'[{"provider_security_id":"bad"}]');failures:=failures+1;
 exception when raise_exception then null;end;
 begin perform public.replace_investment_holdings_snapshot(c,a,jsonb_build_array(snapshot->0,snapshot->0));failures:=failures+1;
 exception when raise_exception then null;end;
 select count(*) into n from public.investment_holdings where connected_account_id=c and security_name='Stale fixture';
 if n<>1 then failures:=failures+1;end if;
 if (select last_synced_at from public.connected_accounts where id=c)<>'2026-01-01'::timestamptz then failures:=failures+1;end if;
 n:=public.replace_investment_holdings_snapshot(c,a,snapshot);if n<>2 then failures:=failures+1;end if;
 select count(*) into n from public.investment_holdings where connected_account_id=c;
 if n<>2 then failures:=failures+1;end if;
 select count(*) into n from public.investment_holdings where connected_account_id=d and institution_value=20;
 if n<>1 then failures:=failures+1;end if;
 if (select sync_status from public.connected_accounts where id=c)<>'connected' then failures:=failures+1;end if;
 update public.connected_accounts set sync_status='syncing' where id=c;
 n:=public.replace_investment_holdings_snapshot(c,a,snapshot);if n<>2 then failures:=failures+1;end if;
 select count(*) into n from public.investment_holdings where connected_account_id=c;
 if n<>2 then failures:=failures+1;end if;
 update public.connected_accounts set sync_status='syncing',last_synced_at='2026-01-01' where id=c;
 begin
  perform public.replace_investment_holdings_snapshot(c,a,jsonb_build_array(snapshot->0,jsonb_set(snapshot->1,'{security_name}','"Synthetic reject at insert"')));
  failures:=failures+1;
 exception when raise_exception then null;end;
 select count(*) into n from public.investment_holdings where connected_account_id=c;
 if n<>2 then failures:=failures+1;end if;
 if (select last_synced_at from public.connected_accounts where id=c)<>'2026-01-01'::timestamptz then failures:=failures+1;end if;
 n:=public.replace_investment_holdings_snapshot(c,a,'[]');if n<>0 then failures:=failures+1;end if;
 select count(*) into n from public.investment_holdings where connected_account_id=c;
 if n<>0 then failures:=failures+1;end if;
 execute 'reset role';
 raise exception 'HOLDINGS SNAPSHOT TEST: 18 checks, failures=% (all synthetic changes rolled back)',failures;
end $$;

rollback;
