-- Tracks whether the 80%-of-monthly-budget warning has already gone out
-- this month, so it fires once (to everyone) instead of on every request
-- past the threshold. Not user-scoped RLS — this is purely an internal
-- dedupe sentinel for the edge function, never read by the client.
create table if not exists ai_usage_alerts (
  month text primary key,
  created_at timestamptz not null default now()
);

alter table ai_usage_alerts enable row level security;
-- No policies — inaccessible to anon/authenticated entirely, same as
-- ai_usage_log's writes; only the edge function's service-role key touches it.
