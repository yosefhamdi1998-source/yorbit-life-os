-- Synthetic users only. The final exception rolls back ALL fixture writes.
-- A report with failures=0 is the passing result.
do $$
declare
  a uuid := gen_random_uuid(); b uuid := gen_random_uuid();
  failures integer := 0; n integer;
begin
  insert into auth.users (id, aud, role, email, encrypted_password)
    values (a,'authenticated','authenticated','profile-a-'||a||'@synthetic.invalid',''),
           (b,'authenticated','authenticated','profile-b-'||b||'@synthetic.invalid','');
  insert into public.profiles(id,email) values(a,'a@synthetic.invalid'),(b,'b@synthetic.invalid')
    on conflict(id) do nothing;
  perform set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);
  execute 'set local role authenticated';
  begin
    update public.profiles set role='admin' where id=a;
    failures := failures + 1;
  exception when insufficient_privilege then null; end;
  begin
    update public.profiles set ai_tier=ai_tier where id=a;
    failures := failures + 1;
  exception when insufficient_privilege then null; end;
  begin
    update public.profiles set id=gen_random_uuid() where id=a;
    failures := failures + 1;
  exception when insufficient_privilege then null; end;
  update public.profiles set onboarding_completed_at=now(), ai_consent_at=now(),
    ai_consent_declined_at=null, ai_consent_version=1 where id=a;
  get diagnostics n = row_count;
  if n <> 1 then failures := failures + 1; end if;
  update public.profiles set onboarding_completed_at=now() where id=b;
  get diagnostics n = row_count;
  if n <> 0 then failures := failures + 1; end if;
  select count(*) into n from public.profiles where id=a and role='user';
  if n <> 1 then failures := failures + 1; end if;
  execute 'reset role';
  execute 'set local role service_role';
  update public.profiles set role='admin' where id=a;
  get diagnostics n = row_count;
  if n <> 1 then failures := failures + 1; end if;
  execute 'reset role';
  raise exception 'PROFILE AUTHORITY TEST: 7 checks, failures=% (all synthetic changes rolled back)', failures;
end $$;
