-- App Review demo account: FICTIONAL data only, never an existing customer.
-- 1. Create and confirm a dedicated reviewer account through normal signup.
-- 2. In the trusted admin dashboard, set that account's app_metadata
--    app_review_fixture=true (not user-editable user_metadata).
-- 3. Set DEMO_USER below to that dedicated account's UUID. No credentials here.
-- 4. Run once, then sign in and verify every advertised reviewer flow.
-- Refuses ordinary accounts and any existing financial records/connections.
-- Never deletes data or grants Pro. Pro must come through sandbox purchases.
-- To refresh fixtures, create a NEW dedicated review account; this script
-- intentionally refuses reruns rather than erasing records a tester may add.

do $$
declare
  -- ⚠️ REPLACE THIS with the reviewer account's uuid from step 2.
  DEMO_USER uuid := '00000000-0000-0000-0000-000000000000';
  -- Anchor everything to today so the account never looks abandoned. A
  -- reviewer opening a demo whose newest transaction is four months old
  -- reasonably concludes the app is broken.
  demo_account uuid;
  today date := current_date;
  m0 text := to_char(current_date, 'YYYY-MM');
begin
  if DEMO_USER = '00000000-0000-0000-0000-000000000000' then
    raise exception 'Set DEMO_USER to the reviewer account uuid first';
  end if;
  if not exists (select 1 from auth.users where id = DEMO_USER) then
    raise exception 'No auth user with id %. Create the account through signup first.', DEMO_USER;
  end if;

  perform 1 from auth.users where id = DEMO_USER
    and raw_app_meta_data ->> 'app_review_fixture' = 'true' for update;
  if not found then
    raise exception 'Use a dedicated review account marked app_review_fixture in trusted app metadata';
  end if;
  if exists (select 1 from transactions where user_id = DEMO_USER)
    or exists (select 1 from budgets where user_id = DEMO_USER)
    or exists (select 1 from bills where user_id = DEMO_USER)
    or exists (select 1 from savings_goals where user_id = DEMO_USER)
    or exists (select 1 from net_worth_entries where user_id = DEMO_USER)
    or exists (select 1 from connected_accounts where user_id = DEMO_USER)
    or exists (select 1 from investment_holdings where user_id = DEMO_USER) then
    raise exception 'Reviewer financial data and connections must be empty; nothing was changed';
  end if;

  -- ── Income: a plausible salary, twice monthly, six months back ──────────
  insert into transactions (user_id, title, amount, type, category, date, exclude_from_budget)
  select DEMO_USER, 'Payroll — Northwind Traders', 2450.00, 'income', 'salary',
         (date_trunc('month', today) - (i || ' month')::interval + interval '14 days')::date, false
  from generate_series(0, 5) i
  where (date_trunc('month', today) - (i || ' month')::interval + interval '14 days')::date <= today;

  insert into transactions (user_id, title, amount, type, category, date, exclude_from_budget)
  select DEMO_USER, 'Payroll — Northwind Traders', 2450.00, 'income', 'salary',
         (date_trunc('month', today) - (i || ' month')::interval + interval '27 days')::date, false
  from generate_series(0, 5) i
  where (date_trunc('month', today) - (i || ' month')::interval + interval '27 days')::date <= today;

  insert into transactions (user_id, title, amount, type, category, date, exclude_from_budget)
  select DEMO_USER, 'Freelance — Contoso design work', 600.00, 'income', 'freelance',
         (date_trunc('month', today) - (i || ' month')::interval + interval '9 days')::date, false
  from generate_series(0, 3) i
  where (date_trunc('month', today) - (i || ' month')::interval + interval '9 days')::date <= today;

  -- ── Spending: recognisable categories, varied amounts ───────────────────
  insert into transactions (user_id, title, amount, type, category, date, exclude_from_budget)
  values
    (DEMO_USER, 'Rent — Maple Court Apartments', 1650.00, 'expense', 'housing', today - 3,  false),
    (DEMO_USER, 'City Power & Light',              128.40, 'expense', 'housing', today - 5,  false),
    (DEMO_USER, 'Fresh Market groceries',          214.86, 'expense', 'food',    today - 1,  false),
    (DEMO_USER, 'Fresh Market groceries',          167.22, 'expense', 'food',    today - 9,  false),
    (DEMO_USER, 'Corner Cafe',                      6.75,  'expense', 'food',    today,      false),
    (DEMO_USER, 'Corner Cafe',                      6.75,  'expense', 'food',    today - 2,  false),
    (DEMO_USER, 'Metro transit pass',               96.00, 'expense', 'transport', today - 7, false),
    (DEMO_USER, 'Shell fuel',                       52.31, 'expense', 'transport', today - 4, false),
    (DEMO_USER, 'Streamly subscription',            15.99, 'expense', 'entertainment', today - 6, false),
    (DEMO_USER, 'Cinema — two tickets',             28.00, 'expense', 'entertainment', today - 12, false),
    (DEMO_USER, 'Northside Pharmacy',               34.10, 'expense', 'health',  today - 8,  false),
    (DEMO_USER, 'Dental checkup',                  120.00, 'expense', 'health',  today - 20, false),
    (DEMO_USER, 'Everyday Goods — household',       88.45, 'expense', 'shopping', today - 11, false),
    (DEMO_USER, 'Trailhead Outfitters',            142.00, 'expense', 'shopping', today - 16, false);

  -- Four months of history so trends and comparisons have something to draw.
  insert into transactions (user_id, title, amount, type, category, date, exclude_from_budget)
  select DEMO_USER, v.title, v.amt, 'expense', v.cat,
         (today - ((i * 30) + v.off))::date, false
  from generate_series(1, 4) i,
       (values ('Rent — Maple Court Apartments', 1650.00, 'housing', 3),
               ('Fresh Market groceries',         198.40, 'food', 6),
               ('City Power & Light',             119.75, 'housing', 5),
               ('Metro transit pass',              96.00, 'transport', 7),
               ('Streamly subscription',           15.99, 'entertainment', 6)
       ) as v(title, amt, cat, off);

  -- ── Budgets ────────────────────────────────────────────────────────────
  insert into budgets (user_id, category, monthly_limit, month) values
    (DEMO_USER, 'housing',       1700, m0),
    (DEMO_USER, 'food',           600, m0),
    (DEMO_USER, 'transport',      250, m0),
    (DEMO_USER, 'entertainment',  150, m0),
    (DEMO_USER, 'health',         200, m0),
    (DEMO_USER, 'shopping',       300, m0);

  -- ── Bills: one paid, one due soon, one overdue, so all three states show ─
  insert into bills (user_id, name, amount, due_date, is_paid, is_recurring, category) values
    (DEMO_USER, 'Rent — Maple Court',   1650.00, today + 9,  false, true, 'housing'),
    (DEMO_USER, 'Phone — Cellular One',   62.00, today + 3,  false, true, 'phone'),
    (DEMO_USER, 'Renters insurance',      18.50, today - 2,  false, true, 'insurance'),
    (DEMO_USER, 'City Power & Light',    128.40, today - 6,  true,  true, 'utilities'),
    (DEMO_USER, 'Streamly',               15.99, today + 14, false, true, 'subscription');

  -- ── Goals ──────────────────────────────────────────────────────────────
  insert into savings_goals (user_id, name, target_amount, current_amount, target_date) values
    (DEMO_USER, 'Emergency fund', 6000, 2400, (today + 300)),
    (DEMO_USER, 'Trip to Lisbon',  2500,  850, (today + 210));

  -- ── Net worth: makes Cash on Hand become a real net worth ──────────────
  insert into net_worth_entries (user_id, name, type, value) values
    (DEMO_USER, 'Checking account',     'asset',      3120.55),
    (DEMO_USER, 'Savings account',      'asset',      8450.00),
    (DEMO_USER, 'Car (2019 hatchback)', 'asset',     11200.00),
    (DEMO_USER, 'Credit card balance',  'liability',   940.22),
    (DEMO_USER, 'Student loan',         'liability', 12600.00);

  -- Synthetic display-only positions, with no provider token or bank link.
  insert into connected_accounts (user_id, provider, institution_name, account_name, account_type, sync_status)
  values (DEMO_USER, 'plaid', 'Fictional Review Brokerage', 'Demo holdings — no bank connection', 'investment', 'not_connected')
  returning id into demo_account;
  insert into investment_holdings (user_id, connected_account_id, security_name, ticker_symbol, quantity, institution_value, currency)
  values (DEMO_USER, demo_account, 'Fictional Review Fund', 'DEMO', 12, 1440, 'USD'),
         (DEMO_USER, demo_account, 'Fictional Review Bond', 'TEST', 8, 800, 'USD');

  raise notice 'Fictional reviewer data written';
end $$;

-- Verify: expect 47-50 transactions (no future paydays), 6 budgets, 5 bills, 2 goals, 5 net-worth entries and 2 holdings.
-- select
--   (select count(*) from transactions      where user_id = '<uuid>') as transactions,
--   (select count(*) from budgets           where user_id = '<uuid>') as budgets,
--   (select count(*) from bills             where user_id = '<uuid>') as bills,
--   (select count(*) from savings_goals     where user_id = '<uuid>') as goals,
--   (select count(*) from net_worth_entries where user_id = '<uuid>') as net_worth;
