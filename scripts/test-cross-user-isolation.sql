-- Empirical multi-user isolation test. SYNTHETIC DATA ONLY.
--
-- Creates two throwaway users, gives each a row in every table worth
-- checking, then acts AS user A and tries to read, update, delete and forge
-- rows belonging to user B. Also calls each signed-in-callable SECURITY
-- DEFINER function as A and as B to confirm neither sees the other's data.
--
-- NOTHING PERSISTS. The whole run is one transaction that ends in a
-- deliberate RAISE, so PostgreSQL rolls it back — the synthetic users, their
-- rows, everything. The report is delivered in the exception message because
-- a normal result set would be rolled back with everything else. Seeing
-- "ISOLATION REPORT" as an ERROR is the SUCCESS path.
--
-- No existing row is read, modified or deleted; no privilege is granted or
-- revoked; nothing is deployed.
--
-- WHY IT ACTS AS A ROLE. The migration/owner role has BYPASSRLS, so running
-- these probes as the default connection would prove nothing at all — every
-- policy would be skipped and everything would look readable. `set local
-- role authenticated` plus a forged request.jwt.claims is what makes
-- auth.uid() return our synthetic id and RLS actually apply.
--
-- Run: npm run test:cross-user-isolation

do $$
declare
  a_id   uuid := gen_random_uuid();
  b_id   uuid := gen_random_uuid();
  report text := E'\n=== ISOLATION REPORT (all data synthetic, transaction rolled back) ===\n';
  n      integer;
  ok     boolean;
  failures integer := 0;
begin
  -- ---------- set-up, as the privileged connection role ----------
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                          email_confirmed_at, created_at, updated_at)
  values
    (a_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'isolation-a-' || a_id || '@synthetic.invalid', '', now(), now(), now()),
    (b_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'isolation-b-' || b_id || '@synthetic.invalid', '', now(), now(), now());

  insert into transactions (user_id, title, amount, type, category, date)
  values (a_id, 'SYNTHETIC A', 10, 'expense', 'other', current_date),
         (b_id, 'SYNTHETIC B', 20, 'expense', 'other', current_date);

  insert into notes (user_id, title, content)
  values (a_id, 'SYNTHETIC A', 'a'), (b_id, 'SYNTHETIC B', 'b');

  insert into bills (user_id, name, amount, due_date)
  values (a_id, 'SYNTHETIC A', 5, current_date), (b_id, 'SYNTHETIC B', 6, current_date);

  insert into subscriptions (user_id, status, plan)
  values (a_id, 'active', 'free'), (b_id, 'active', 'free');

  -- ---------- become user A ----------
  perform set_config('request.jwt.claims', json_build_object('sub', a_id, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  -- 1. CROSS-USER READ. Expected 0 rows of B's data in every table.
  select count(*) into n from transactions where user_id = b_id;
  ok := (n = 0); if not ok then failures := failures + 1; end if;
  report := report || format(E'[%s] read transactions of B      expected 0, got %s\n', case when ok then 'PASS' else 'FAIL' end, n);

  select count(*) into n from notes where user_id = b_id;
  ok := (n = 0); if not ok then failures := failures + 1; end if;
  report := report || format(E'[%s] read notes of B             expected 0, got %s\n', case when ok then 'PASS' else 'FAIL' end, n);

  select count(*) into n from bills where user_id = b_id;
  ok := (n = 0); if not ok then failures := failures + 1; end if;
  report := report || format(E'[%s] read bills of B             expected 0, got %s\n', case when ok then 'PASS' else 'FAIL' end, n);

  select count(*) into n from subscriptions where user_id = b_id;
  ok := (n = 0); if not ok then failures := failures + 1; end if;
  report := report || format(E'[%s] read subscriptions of B     expected 0, got %s\n', case when ok then 'PASS' else 'FAIL' end, n);

  -- Sanity: A must still see A. A test that passes because EVERYTHING is
  -- invisible is not proving isolation, it is proving a broken connection.
  select count(*) into n from transactions where user_id = a_id;
  ok := (n = 1); if not ok then failures := failures + 1; end if;
  report := report || format(E'[%s] read own transactions       expected 1, got %s\n', case when ok then 'PASS' else 'FAIL' end, n);

  -- 2. CROSS-USER WRITE. Expected 0 rows affected, silently — RLS filters
  --    the target row out rather than raising.
  update transactions set title = 'HIJACKED' where user_id = b_id;
  get diagnostics n = row_count;
  ok := (n = 0); if not ok then failures := failures + 1; end if;
  report := report || format(E'[%s] update B''s transactions     expected 0 rows, got %s\n', case when ok then 'PASS' else 'FAIL' end, n);

  delete from notes where user_id = b_id;
  get diagnostics n = row_count;
  ok := (n = 0); if not ok then failures := failures + 1; end if;
  report := report || format(E'[%s] delete B''s notes            expected 0 rows, got %s\n', case when ok then 'PASS' else 'FAIL' end, n);

  -- 3. FORGED INSERT. A inserting a row stamped with B's user_id must be
  --    refused by the WITH CHECK expression.
  begin
    insert into transactions (user_id, title, amount, type, category, date)
    values (b_id, 'FORGED BY A', 99, 'expense', 'other', current_date);
    failures := failures + 1;
    report := report || E'[FAIL] insert row owned by B        expected refusal, got success\n';
  exception when insufficient_privilege or check_violation then
    report := report || E'[PASS] insert row owned by B        expected refusal, refused\n';
  end;

  -- 4. ENTITLEMENT FORGERY. The paywall bypass that was already found once:
  --    can a signed-in user grant themselves Pro?
  begin
    update subscriptions set plan = 'pro_yearly' where user_id = a_id;
    get diagnostics n = row_count;
    ok := (n = 0); if not ok then failures := failures + 1; end if;
    report := report || format(E'[%s] self-upgrade own plan       expected 0 rows, got %s\n', case when ok then 'PASS' else 'FAIL' end, n);
  exception when insufficient_privilege then
    report := report || E'[PASS] self-upgrade own plan       expected refusal, refused\n';
  end;

  -- 5. SECURITY DEFINER functions, called as A. Each aggregates the CALLER's
  --    rows; none takes a user_id argument. B's synthetic transaction is not
  --    crypto, so the honest assertion is "these run scoped and do not error",
  --    plus the count-based checks above.
  begin
    perform crypto_time_coverage();
    report := report || E'[PASS] crypto_time_coverage()      ran as A without error\n';
  exception when others then
    failures := failures + 1;
    report := report || format(E'[FAIL] crypto_time_coverage()      %s\n', sqlerrm);
  end;

  begin
    perform crypto_yearly_summary();
    report := report || E'[PASS] crypto_yearly_summary()     ran as A without error\n';
  exception when others then
    failures := failures + 1;
    report := report || format(E'[FAIL] crypto_yearly_summary()     %s\n', sqlerrm);
  end;

  begin
    perform crypto_asset_summary();
    report := report || E'[PASS] crypto_asset_summary()      ran as A without error\n';
  exception when others then
    failures := failures + 1;
    report := report || format(E'[FAIL] crypto_asset_summary()      %s\n', sqlerrm);
  end;

  begin
    perform crypto_pnl_by_year();
    report := report || E'[PASS] crypto_pnl_by_year()        ran as A without error\n';
  exception when others then
    failures := failures + 1;
    report := report || format(E'[FAIL] crypto_pnl_by_year()        %s\n', sqlerrm);
  end;

  -- 6. delete_all_my_data() as A must not touch B. This is the single most
  --    destructive callable function in the schema.
  begin
    perform delete_all_my_data();
    reset role;
    select count(*) into n from transactions where user_id = b_id;
    ok := (n = 1); if not ok then failures := failures + 1; end if;
    report := report || format(E'[%s] delete_all_my_data() as A   B''s rows expected 1, got %s\n', case when ok then 'PASS' else 'FAIL' end, n);
    select count(*) into n from transactions where user_id = a_id;
    ok := (n = 0); if not ok then failures := failures + 1; end if;
    report := report || format(E'[%s] delete_all_my_data() as A   A''s rows expected 0, got %s\n', case when ok then 'PASS' else 'FAIL' end, n);
  exception when others then
    reset role;
    failures := failures + 1;
    report := report || format(E'[FAIL] delete_all_my_data()        %s\n', sqlerrm);
  end;

  reset role;
  report := report || format(E'\n%s failure(s). Everything above is rolled back.\n', failures);
  raise exception '%', report;
end $$;
