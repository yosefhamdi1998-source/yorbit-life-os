-- Yoglow: Base44 -> Supabase schema
-- Run this whole file once in the Supabase SQL Editor (Project -> SQL Editor -> New query).
-- Safe to re-run: uses IF NOT EXISTS / OR REPLACE everywhere.

-- ============================================================
-- 0. Extensions
-- ============================================================
create extension if not exists "pgcrypto"; -- gen_random_uuid()
create extension if not exists "pg_cron";   -- for scheduled jobs (see bottom of file)

-- ============================================================
-- 1. Profiles (mirrors auth.users, adds app-specific fields)
-- ============================================================
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  role text not null default 'user' check (role in ('user', 'admin')),
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id);

-- Auto-create a profile row whenever someone signs up
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, role)
  values (new.id, new.email, 'user')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- 2. Helper: standard "user owns this row" RLS, applied per table below
-- ============================================================
-- (no shared function needed — each table gets its own auth.uid() = user_id policy
--  so query plans stay simple and each policy is independently auditable)

-- ============================================================
-- 3. Core entity tables
--    Every table: id uuid pk, user_id -> auth.users, created_date, updated_date
--    Column names match the app's existing field names exactly (see base44/entities/*.jsonc)
-- ============================================================

-- Transaction -----------------------------------------------
create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  amount numeric not null,
  type text not null default 'expense' check (type in ('income','expense')),
  category text not null default 'other' check (category in (
    'housing','food','transport','entertainment','health','shopping',
    'education','savings','salary','freelance','investment','other')),
  date date not null,
  notes text,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now()
);
create index if not exists idx_transactions_user_date on public.transactions(user_id, date desc);

-- Bill --------------------------------------------------------
create table if not exists public.bills (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  amount numeric not null,
  due_date date not null,
  category text not null default 'other' check (category in (
    'housing','utilities','phone','insurance','subscription','credit_card','loan','other')),
  is_paid boolean not null default false,
  is_recurring boolean not null default true,
  notes text,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now()
);
create index if not exists idx_bills_user_due on public.bills(user_id, due_date);
create index if not exists idx_bills_subscription_unpaid on public.bills(user_id, category, is_paid, is_recurring);

-- Budget --------------------------------------------------------
create table if not exists public.budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category text not null check (category in (
    'housing','food','transport','entertainment','health','shopping',
    'education','savings','other')),
  monthly_limit numeric not null,
  month text not null,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now()
);
create index if not exists idx_budgets_user_month on public.budgets(user_id, month);

-- Goal --------------------------------------------------------
create table if not exists public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  description text,
  category text not null default 'personal' check (category in (
    'career','health','finance','relationships','learning','personal','other')),
  target_date date,
  status text not null default 'active' check (status in ('active','completed','paused')),
  milestones jsonb not null default '[]'::jsonb,
  progress numeric not null default 0,
  target_amount numeric,
  savings_amount numeric not null default 0,
  ai_nudge text, -- not in the original Goal.jsonc schema, but Goals.jsx writes/reads it (Base44 entities are schema-less at runtime)
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now()
);
create index if not exists idx_goals_user on public.goals(user_id);

-- SavingsGoal --------------------------------------------------
create table if not exists public.savings_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  target_amount numeric not null,
  current_amount numeric not null default 0,
  icon text not null default '🎯',
  color text not null default '#059669',
  target_date date,
  notes text,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now()
);
create index if not exists idx_savings_goals_user on public.savings_goals(user_id);

-- NetWorthEntry --------------------------------------------------
create table if not exists public.net_worth_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  type text not null check (type in ('asset','liability')),
  value numeric not null,
  category text check (category in (
    'cash','investment','property','vehicle','crypto','loan','mortgage','credit_card','other')),
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now()
);
create index if not exists idx_net_worth_user on public.net_worth_entries(user_id);

-- Habit --------------------------------------------------------
create table if not exists public.habits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  description text,
  frequency text not null default 'daily' check (frequency in ('daily','weekly')),
  icon text,
  color text,
  target_days_per_week numeric not null default 7,
  completions jsonb not null default '[]'::jsonb,
  streak numeric not null default 0,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now()
);
create index if not exists idx_habits_user on public.habits(user_id);

-- Task --------------------------------------------------------
create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  description text,
  due_date date,
  priority text not null default 'medium' check (priority in ('low','medium','high','urgent')),
  category text,
  status text not null default 'todo' check (status in ('todo','in_progress','done')),
  goal_id uuid references public.goals(id) on delete set null,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now()
);
create index if not exists idx_tasks_user_due on public.tasks(user_id, due_date);

-- HealthLog --------------------------------------------------------
create table if not exists public.health_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  weight numeric,
  sleep_hours numeric,
  water_intake numeric,
  steps numeric,
  workout text,
  workout_duration numeric,
  mood numeric check (mood between 1 and 10),
  energy numeric check (energy between 1 and 10),
  notes text,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now()
);
create index if not exists idx_health_logs_user_date on public.health_logs(user_id, date desc);

-- JournalEntry --------------------------------------------------------
create table if not exists public.journal_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  content text not null,
  mood text check (mood in ('great','good','neutral','bad','terrible')),
  tags jsonb not null default '[]'::jsonb,
  ai_prompt_used text,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now()
);
create index if not exists idx_journal_user_date on public.journal_entries(user_id, date desc);

-- Note --------------------------------------------------------
create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  content text,
  tags jsonb not null default '[]'::jsonb,
  color text,
  is_pinned boolean not null default false,
  ai_summary text,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now()
);
create index if not exists idx_notes_user on public.notes(user_id);

-- CustomForm --------------------------------------------------------
create table if not exists public.custom_forms (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  icon text default '📋',
  color text,
  description text,
  fields jsonb not null default '[]'::jsonb,
  is_favorite boolean not null default false,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now()
);
create index if not exists idx_custom_forms_user on public.custom_forms(user_id);

-- CustomRecord --------------------------------------------------------
create table if not exists public.custom_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  form_id uuid not null references public.custom_forms(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  notes text,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now()
);
create index if not exists idx_custom_records_user_form on public.custom_records(user_id, form_id);
create index if not exists idx_custom_records_created on public.custom_records(created_date desc);

-- AIInsightCache --------------------------------------------------------
create table if not exists public.ai_insight_caches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in ('briefing','coach')),
  date text not null,
  content jsonb not null,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now()
);
create index if not exists idx_ai_cache_user_type_date on public.ai_insight_caches(user_id, type, date);

-- Notification --------------------------------------------------------
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  message text not null,
  type text not null default 'subscription_renewal' check (type in (
    'subscription_renewal','bill_due','goal','info')),
  related_id text,
  related_type text,
  due_date date,
  amount numeric,
  is_read boolean not null default false,
  action_url text,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now()
);
create index if not exists idx_notifications_user on public.notifications(user_id, created_date desc);
-- used by generateSubscriptionReminders to dedupe by related_id across ALL users' rows it can see (service role)
create index if not exists idx_notifications_type_related on public.notifications(type, related_id);

-- ConnectedAccount (disabled/no-op today; created for when bank sync is re-enabled)
create table if not exists public.connected_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null default 'plaid' check (provider in ('plaid','teller')),
  institution_name text not null,
  account_name text not null,
  account_type text,
  account_mask text,
  provider_account_id text,
  provider_item_id text,
  access_token_ref text,
  last_synced_at timestamptz,
  sync_status text not null default 'not_connected' check (sync_status in (
    'not_connected','connected','syncing','error','disconnected')),
  error_message text,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now()
);
create index if not exists idx_connected_accounts_user on public.connected_accounts(user_id);
create index if not exists idx_connected_accounts_status on public.connected_accounts(sync_status);

-- BankSyncLog (disabled/no-op today)
create table if not exists public.bank_sync_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('plaid','teller')),
  connected_account_id uuid references public.connected_accounts(id) on delete cascade,
  started_at timestamptz not null,
  finished_at timestamptz,
  status text not null check (status in ('success','partial','failed')),
  imported_count numeric not null default 0,
  skipped_duplicate_count numeric not null default 0,
  error_count numeric not null default 0,
  message text,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now()
);
create index if not exists idx_bank_sync_logs_user on public.bank_sync_logs(user_id);

-- Subscription (disabled/no-op today; created for when Stripe billing is re-enabled)
create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  stripe_customer_id text,
  stripe_subscription_id text,
  plan text not null default 'free' check (plan in ('free','pro_monthly','pro_yearly')),
  status text not null default 'active' check (status in (
    'active','canceled','past_due','trialing','incomplete')),
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now()
);
create index if not exists idx_subscriptions_user on public.subscriptions(user_id);
create index if not exists idx_subscriptions_stripe_customer on public.subscriptions(stripe_customer_id);

-- ============================================================
-- 3b. Advisor chat tables (new — replaces base44's agents.* SDK for AdvisorChat.jsx)
--     Simple conversation/message log + Realtime, NOT a general agent platform.
-- ============================================================
create table if not exists public.advisor_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  agent_name text not null default 'financial_advisor',
  metadata jsonb default '{}'::jsonb,
  created_date timestamptz not null default now()
);
alter table public.advisor_conversations enable row level security;
drop policy if exists "advisor_conversations_own" on public.advisor_conversations;
create policy "advisor_conversations_own" on public.advisor_conversations
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists public.advisor_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.advisor_conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user','assistant')),
  content text not null,
  created_date timestamptz not null default now()
);
create index if not exists idx_advisor_messages_conversation on public.advisor_messages(conversation_id, created_date);
alter table public.advisor_messages enable row level security;
drop policy if exists "advisor_messages_select_own" on public.advisor_messages;
create policy "advisor_messages_select_own" on public.advisor_messages
  for select using (auth.uid() = user_id);
drop policy if exists "advisor_messages_insert_own" on public.advisor_messages;
create policy "advisor_messages_insert_own" on public.advisor_messages
  for insert with check (auth.uid() = user_id);
-- Note: the assistant's reply is inserted by the ai-coach Edge Function using the
-- service-role key, which bypasses RLS — so no "insert as assistant" policy is needed
-- for regular users, and users can never spoof an assistant message themselves.

-- Enable Realtime for the messages table so AdvisorChat.jsx's subscription works
alter publication supabase_realtime add table public.advisor_messages;

-- ============================================================
-- 4. updated_date auto-touch trigger, applied to every table above
-- ============================================================
create or replace function public.touch_updated_date()
returns trigger language plpgsql as $$
begin
  new.updated_date = now();
  return new;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'transactions','bills','budgets','goals','savings_goals','net_worth_entries',
    'habits','tasks','health_logs','journal_entries','notes','custom_forms',
    'custom_records','ai_insight_caches','notifications','connected_accounts',
    'bank_sync_logs','subscriptions'
  ]
  loop
    execute format('drop trigger if exists trg_touch_updated_date on public.%I;', t);
    execute format(
      'create trigger trg_touch_updated_date before update on public.%I
       for each row execute function public.touch_updated_date();', t);
  end loop;
end $$;

-- ============================================================
-- 5. Row Level Security: every table, same shape
--    Users can only ever see/write their own rows.
--    Edge Functions use the SERVICE ROLE key, which bypasses RLS entirely —
--    that's how deleteAccount/customForms/etc. can act on a user's behalf.
-- ============================================================
do $$
declare
  t text;
begin
  foreach t in array array[
    'transactions','bills','budgets','goals','savings_goals','net_worth_entries',
    'habits','tasks','health_logs','journal_entries','notes','custom_forms',
    'custom_records','ai_insight_caches','notifications','connected_accounts',
    'bank_sync_logs','subscriptions'
  ]
  loop
    execute format('alter table public.%I enable row level security;', t);

    execute format('drop policy if exists "%I_select_own" on public.%I;', t, t);
    execute format(
      'create policy "%I_select_own" on public.%I for select using (auth.uid() = user_id);', t, t);

    execute format('drop policy if exists "%I_insert_own" on public.%I;', t, t);
    execute format(
      'create policy "%I_insert_own" on public.%I for insert with check (auth.uid() = user_id);', t, t);

    execute format('drop policy if exists "%I_update_own" on public.%I;', t, t);
    execute format(
      'create policy "%I_update_own" on public.%I for update using (auth.uid() = user_id) with check (auth.uid() = user_id);', t, t);

    execute format('drop policy if exists "%I_delete_own" on public.%I;', t, t);
    execute format(
      'create policy "%I_delete_own" on public.%I for delete using (auth.uid() = user_id);', t, t);
  end loop;
end $$;

-- custom_records also needs the parent form to belong to the same user
-- (defense in depth beyond the FK — prevents attaching records to someone else's form
--  if a user_id mismatch ever slipped through the app layer)
drop policy if exists "custom_records_insert_own" on public.custom_records;
create policy "custom_records_insert_own" on public.custom_records
  for insert with check (
    auth.uid() = user_id
    and exists (select 1 from public.custom_forms f where f.id = form_id and f.user_id = auth.uid())
  );

-- ============================================================
-- 6. Scheduled jobs (pg_cron) for the 3 background functions
--    These call the deployed Edge Functions over HTTP using pg_net.
--    Replace <PROJECT_REF> and <SERVICE_ROLE_KEY> after deploying,
--    or set them via Vault (recommended) — see MIGRATION_STEPS.md "Cron" section.
-- ============================================================
create extension if not exists pg_net;

-- Daily at 08:00 UTC: create "renews soon" notifications for upcoming subscription bills
select cron.schedule(
  'generate-subscription-reminders-daily',
  '0 8 * * *',
  $$
  select net.http_post(
    url := 'https://<PROJECT_REF>.supabase.co/functions/v1/generate-subscription-reminders',
    headers := jsonb_build_object('Authorization', 'Bearer <SERVICE_ROLE_KEY>', 'Content-Type', 'application/json'),
    body := '{}'::jsonb
  );
  $$
);

-- Weekly, Monday 09:00 UTC: AI analysis of custom form records
select cron.schedule(
  'weekly-custom-record-analysis',
  '0 9 * * 1',
  $$
  select net.http_post(
    url := 'https://<PROJECT_REF>.supabase.co/functions/v1/weekly-custom-record-analysis',
    headers := jsonb_build_object('Authorization', 'Bearer <SERVICE_ROLE_KEY>', 'Content-Type', 'application/json'),
    body := '{}'::jsonb
  );
  $$
);

-- Only relevant once Plaid bank sync is re-enabled (currently disabled) — every 4 hours
select cron.schedule(
  'sync-all-accounts-4h',
  '0 */4 * * *',
  $$
  select net.http_post(
    url := 'https://<PROJECT_REF>.supabase.co/functions/v1/sync-all-accounts',
    headers := jsonb_build_object('Authorization', 'Bearer <SERVICE_ROLE_KEY>', 'Content-Type', 'application/json'),
    body := '{}'::jsonb
  );
  $$
);

-- To disable a job later: select cron.unschedule('generate-subscription-reminders-daily');
-- To see all jobs: select * from cron.job;
