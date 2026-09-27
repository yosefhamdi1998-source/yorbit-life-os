-- Repairs the scheduled jobs' authentication for the two NON-AI jobs:
-- bank sync (sync-all-accounts-4h) and subscription reminders
-- (generate-subscription-reminders-daily). Run once in the Supabase SQL Editor.
--
-- Evidence (Codex, read-only, 2026-09-27, via cron-auth-diagnose.sql): the
-- bank job's stored bearer is malformed or truncated; the reminders and
-- weekly-analysis jobs hold non-JWT secret keys; retained responses were 401
-- UNAUTHORIZED_INVALID_JWT_FORMAT. Both shapes are fixed the same way.
--
-- PREREQUISITE (owner, in the dashboard - never pasted into chat or code):
--   Project Settings -> Vault -> Add new secret
--   name:  cron_service_role_jwt
--   value: the LEGACY service_role key (API Keys -> "Legacy API keys" tab;
--          it starts with eyJ). Not the sb_secret_ key: that is not a JWT
--          and is exactly what the gateway rejects.
--   If the legacy keys are disabled on this project, stop - see
--   OWNER_ACTIONS.md; this fix assumes they are enabled.
--
-- What this changes: each job reads its bearer from Vault when it runs, so
-- the key is no longer stored as plain text inside cron.job.command and a
-- future key change needs only a Vault update. Existing schedules are kept.
-- weekly-custom-record-analysis is deliberately NOT touched: re-enabling it
-- starts scheduled AI analysis of users' data, which waits on the AI approval.

-- 1. Refuse to proceed unless Vault holds a well-formed service_role JWT.
--    Reports only a classification, never the value.
do $$
declare
  v text;
  payload text;
begin
  select decrypted_secret into v from vault.decrypted_secrets where name = 'cron_service_role_jwt';
  if v is null then
    raise exception 'Vault secret cron_service_role_jwt does not exist yet';
  end if;
  -- A pasted value often carries a trailing newline; btrim() alone strips only spaces.
  v := btrim(v, E' \t\r\n');
  if v like 'sb_%' then
    raise exception 'cron_service_role_jwt holds a new-format API key (sb_...), which is not a JWT - store the legacy service_role key instead';
  end if;
  if v !~ '^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$' then
    raise exception 'cron_service_role_jwt is not a well-formed JWT (length %) - check it was copied completely', length(v);
  end if;
  payload := translate(split_part(v, '.', 2), '-_', '+/');
  payload := payload || repeat('=', (4 - length(payload) % 4) % 4);
  if convert_from(decode(payload, 'base64'), 'utf8')::jsonb ->> 'role' is distinct from 'service_role' then
    raise exception 'cron_service_role_jwt is a JWT but not the service_role key (the anon key will be refused by the function)';
  end if;
end $$;

-- 2. Point the two existing jobs at the Vault secret, keeping their schedules.
select cron.schedule(
  j.jobname,
  j.schedule,
  format($cmd$
  select net.http_post(
    url := %L,
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (select btrim(decrypted_secret, E' \t\r\n') from vault.decrypted_secrets where name = 'cron_service_role_jwt'),
      'Content-Type', 'application/json'),
    body := '{}'::jsonb
  );
  $cmd$, 'https://pvjiialxboslqyiiybpe.supabase.co/functions/v1/' || f.fn)
)
from cron.job j
join (values ('sync-all-accounts-4h', 'sync-all-accounts'),
             ('generate-subscription-reminders-daily', 'generate-subscription-reminders')) as f(jobname, fn)
  on f.jobname = j.jobname;

-- 3. Confirm (format only, no value): both should read their bearer from Vault;
--    weekly-custom-record-analysis should be unchanged.
select jobname, schedule, active,
       command like '%vault.decrypted_secrets%' as reads_bearer_from_vault
from cron.job
where jobname in ('sync-all-accounts-4h', 'generate-subscription-reminders-daily', 'weekly-custom-record-analysis')
order by jobname;
