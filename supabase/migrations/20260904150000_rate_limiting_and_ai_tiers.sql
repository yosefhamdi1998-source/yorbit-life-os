-- Rate limiting + per-user AI budgets.
--
-- Both exist because the app is about to be reachable by people who have
-- no reason to be gentle with it. Today every edge function except
-- ai-coach has no limit of any kind, and ai-coach's limit is a single
-- shared dollar figure that one user can consume entirely.

-- ---------------------------------------------------------------------
-- 1. Fixed-window rate limit counters
-- ---------------------------------------------------------------------
-- Fixed window rather than a sliding log: one row per (key, window)
-- instead of one row per request, so a burst of 10,000 requests writes
-- 1 row, not 10,000. The tradeoff is that a caller can send up to 2x the
-- limit across a window boundary. That is acceptable here — this exists
-- to stop scripted abuse and runaway bills, not to meter billing to the
-- request.
create table if not exists rate_limit_counters (
  key text not null,
  window_start timestamptz not null,
  count integer not null default 0,
  primary key (key, window_start)
);

-- Nothing but the service role should ever see or touch this. No policies
-- means no access for anon or authenticated once RLS is on.
alter table rate_limit_counters enable row level security;

create index if not exists rate_limit_counters_window_idx
  on rate_limit_counters (window_start);

-- Atomically increment and report whether the caller is still under the
-- limit. Doing this in one statement matters: a read-then-write from the
-- edge function would let concurrent requests all read the same count and
-- all decide they were under the limit — the same class of race that made
-- goal contributions overwrite each other.
create or replace function check_rate_limit(
  p_key text,
  p_limit integer,
  p_window_seconds integer
) returns table (allowed boolean, current_count integer, resets_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_window_start timestamptz;
  v_count integer;
begin
  -- Snap to the window grid so every caller in the same period shares a row.
  v_window_start := to_timestamp(
    floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds
  );

  insert into rate_limit_counters (key, window_start, count)
  values (p_key, v_window_start, 1)
  on conflict (key, window_start)
    do update set count = rate_limit_counters.count + 1
  returning count into v_count;

  return query select
    v_count <= p_limit,
    v_count,
    v_window_start + make_interval(secs => p_window_seconds);
end;
$$;

-- Old windows are dead weight. Called opportunistically rather than on a
-- schedule so this needs no cron entry to stay bounded.
create or replace function prune_rate_limit_counters()
returns void
language sql
security definer
set search_path = public
as $$
  delete from rate_limit_counters where window_start < now() - interval '2 days';
$$;

-- ---------------------------------------------------------------------
-- 2. Per-user AI budgets
-- ---------------------------------------------------------------------
-- The existing control is one shared monthly dollar cap. With strangers
-- that means the first heavy user spends everyone else's allowance and
-- every subsequent user sees the feature as broken.
--
-- Tiers are stored per user so the ceiling can differ by plan without a
-- redeploy. `free` is the default and is what an unknown signup gets.
do $$
begin
  if not exists (select 1 from pg_type where typname = 'ai_tier') then
    create type ai_tier as enum ('free', 'pro', 'unlimited');
  end if;
end $$;

alter table profiles
  add column if not exists ai_tier ai_tier not null default 'free';

-- Monthly per-user spend, maintained by the edge function. Kept as its own
-- table rather than summing ai_usage_log on every request: that sum was
-- already an unbounded full-table scan over every row for the month, for
-- every user, on every single call.
create table if not exists ai_user_budgets (
  user_id uuid not null references auth.users(id) on delete cascade,
  month text not null,                    -- 'YYYY-MM', UTC
  requests integer not null default 0,
  spend_usd numeric(10,4) not null default 0,
  primary key (user_id, month)
);

alter table ai_user_budgets enable row level security;

-- A user may read their own usage (so the UI can show "7 of 10 used"),
-- but never write it.
drop policy if exists "own ai budget readable" on ai_user_budgets;
create policy "own ai budget readable" on ai_user_budgets
  for select using (auth.uid() = user_id);

create or replace function record_ai_usage(
  p_user_id uuid,
  p_month text,
  p_spend numeric
) returns table (requests integer, spend_usd numeric)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  insert into ai_user_budgets (user_id, month, requests, spend_usd)
  values (p_user_id, p_month, 1, p_spend)
  on conflict (user_id, month) do update
    set requests = ai_user_budgets.requests + 1,
        spend_usd = ai_user_budgets.spend_usd + p_spend
  returning ai_user_budgets.requests, ai_user_budgets.spend_usd;
end;
$$;

-- ---------------------------------------------------------------------
-- 3. Signup mode
-- ---------------------------------------------------------------------
-- The allowlist trigger is all-or-nothing today: drop it and signup is
-- wide open with nothing in its place. This makes the mode a setting, so
-- opening signup is a value change rather than a schema change, and can
-- be reverted instantly if abuse shows up.
create table if not exists app_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

alter table app_settings enable row level security;

insert into app_settings (key, value)
values ('signup_mode', 'invite_only')
on conflict (key) do nothing;

-- Replaces the hard allowlist check. Behaviour by mode:
--   invite_only  - unchanged; only allowed_emails may sign up
--   open         - anyone may sign up
-- Existing accounts are never affected either way: this is BEFORE INSERT
-- on auth.users, so it only ever sees brand-new rows.
create or replace function enforce_email_allowlist()
returns trigger as $$
declare
  v_mode text;
begin
  select value into v_mode from app_settings where key = 'signup_mode';
  v_mode := coalesce(v_mode, 'invite_only');

  if v_mode = 'open' then
    return new;
  end if;

  if not exists (
    select 1 from allowed_emails where lower(email) = lower(new.email)
  ) then
    raise exception 'Signups are invite-only. Contact the app owner to be added.'
      using errcode = '42501';
  end if;

  return new;
end;
$$ language plpgsql security definer set search_path = public;
