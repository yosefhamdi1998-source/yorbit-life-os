-- No real records read or changed. Final exception rolls back all fixtures.
do $$
declare
 a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); ca uuid:=gen_random_uuid(); cb uuid:=gen_random_uuid();
 fa uuid:=gen_random_uuid(); fb uuid:=gen_random_uuid(); ra uuid:=gen_random_uuid(); n integer; failures integer:=0;
begin
 insert into auth.users(id,aud,role,email,encrypted_password) values
 (a,'authenticated','authenticated','child-a-'||a||'@synthetic.invalid',''),
 (b,'authenticated','authenticated','child-b-'||b||'@synthetic.invalid','');
 insert into public.advisor_conversations(id,user_id) values(ca,a),(cb,b);
 insert into public.custom_forms(id,user_id,name) values(fa,a,'Synthetic A'),(fb,b,'Synthetic B');
 insert into public.custom_records(id,user_id,form_id) values(ra,a,fa);
 perform set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);
 execute 'set local role authenticated';
 begin
  insert into public.advisor_messages(conversation_id,user_id,role,content) values(cb,a,'user','Synthetic foreign parent');
  failures:=failures+1;
 exception when insufficient_privilege then null; end;
 begin
  update public.custom_records set form_id=fb where id=ra;
  failures:=failures+1;
 exception when insufficient_privilege then null; end;
 begin
  insert into public.custom_records(user_id,form_id) values(a,fb);
  failures:=failures+1;
 exception when insufficient_privilege then null; end;
 insert into public.advisor_messages(conversation_id,user_id,role,content) values(ca,a,'user','Synthetic own parent');
 get diagnostics n=row_count; if n<>1 then failures:=failures+1; end if;
 update public.custom_records set form_id=fa,notes='Synthetic own edit' where id=ra;
 get diagnostics n=row_count; if n<>1 then failures:=failures+1; end if;
 select count(*) into n from public.advisor_messages where conversation_id=cb;
 if n<>0 then failures:=failures+1; end if;
 raise exception 'CHILD OWNERSHIP TEST: 6 checks, failures=% (all synthetic changes rolled back)',failures;
end $$;
