-- Tracks every AI Coach call (Advisor Chat + Coaching Plan both go through
-- this) so a hard monthly spend cap and a per-user daily rate limit can be
-- enforced BEFORE calling Anthropic, not discovered after the bill arrives.
create table if not exists ai_usage_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  estimated_cost_usd numeric not null default 0
);

alter table ai_usage_log enable row level security;

-- Someone can see their own usage (a "you've used 12 of 40 today" style
-- readout, if ever surfaced in the UI) but never anyone else's, and never
-- write to it directly — only the edge function (service role) logs rows.
create policy "select own ai usage" on ai_usage_log
  for select using (auth.uid() = user_id);

create index idx_ai_usage_log_user_created on ai_usage_log(user_id, created_at);
create index idx_ai_usage_log_created on ai_usage_log(created_at);
