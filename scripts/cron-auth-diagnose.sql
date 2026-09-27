-- READ-ONLY diagnosis of the scheduled-job authentication failures.
-- Safe to run with read access: it reports the FORMAT of each job's stored
-- bearer credential, never the credential itself, and changes nothing.
--
-- Background: the Edge Functions gateway (verify_jwt = true for these
-- functions, see supabase/config.toml) answered the sync job with
-- 401 UNAUTHORIZED_INVALID_JWT_FORMAT. That code means the bearer is not a
-- well-formed JWT at all - which a rotated-but-valid legacy key would not
-- cause. This project uses Supabase's newer API keys (the frontend ships an
-- sb_publishable_ key); the matching sb_secret_ key is "a short string, not
-- a JWT" per Supabase's API key docs. Leading hypothesis: that secret key
-- (or a truncated value) was pasted where the legacy service_role JWT
-- belongs. Query 1 confirms or rules that out.

-- 1. Bearer format per job (no values shown).
select
  j.jobname,
  j.schedule,
  j.active,
  case
    when j.command like '%vault.decrypted_secrets%' then 'read from Vault at run time'
    when m.bearer is null then 'no Bearer header found'
    when m.bearer like 'sb_secret_%' then 'NEW secret key: not a JWT - gateway rejects it (INVALID_JWT_FORMAT)'
    when m.bearer like 'sb_publishable_%' then 'publishable key: not a JWT and not a server credential'
    when m.bearer like '<%' then 'unreplaced template placeholder'
    when m.bearer ~ '^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$' then 'JWT-shaped (legacy key format)'
    else 'malformed or truncated'
  end as bearer_format,
  length(m.bearer) as bearer_length,
  substring(j.command from 'functions/v1/([a-z-]+)') as target_function
from cron.job j
left join lateral (select (regexp_match(j.command, 'Bearer ([^''"\s)]+)'))[1] as bearer) m on true
order by j.jobname;

-- 2. Did each job's SQL run? (Only proves the request was queued, not that
--    the function accepted it - see query 3.)
select j.jobname, d.status, d.return_message, d.start_time
from cron.job_run_details d
join cron.job j using (jobid)
where d.start_time > now() - interval '7 days'
order by d.start_time desc
limit 40;

-- 3. What the functions actually answered. pg_net keeps responses for a few
--    hours only, so look soon after a scheduled run. sync-all-accounts
--    answers 200 when every account synced, 502 with synced/skipped/failed
--    counts and per-account results when some failed (a partial failure).
select
  r.id,
  r.created,
  r.status_code,
  left(r.content, 300) as response_excerpt
from net._http_response r
where r.created > now() - interval '24 hours'
order by r.created desc
limit 40;

-- 4. Is anything actually being synced?
select sync_status, count(*) as accounts, max(last_synced_at) as most_recent_sync
from public.connected_accounts
group by sync_status
order by sync_status;
