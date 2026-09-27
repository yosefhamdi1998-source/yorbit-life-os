-- Repairs the scheduled BANK SYNC job's authentication. Run once in the
-- Supabase SQL Editor, only after cron-auth-diagnose.sql confirms the
-- stored bearer is the problem.
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
-- What this changes: the job reads its bearer from Vault each time it runs,
-- so the key is no longer stored as plain text inside cron.job.command, and
-- a future key change needs only a Vault update. It keeps the job's current
-- schedule and touches ONLY sync-all-accounts-4h. The reminders and weekly
-- AI analysis jobs likely share the same fault (see the diagnosis), but
-- re-enabling the AI job starts sending users' financial summaries to the
-- AI provider on a schedule - that is a separate, explicit owner decision.

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

-- 2. Point the existing job at the Vault secret, keeping its schedule.
select cron.schedule(
  j.jobname,
  j.schedule,
  $cmd$
  select net.http_post(
    url := 'https://pvjiialxboslqyiiybpe.supabase.co/functions/v1/sync-all-accounts',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (select btrim(decrypted_secret, E' \t\r\n') from vault.decrypted_secrets where name = 'cron_service_role_jwt'),
      'Content-Type', 'application/json'),
    body := '{}'::jsonb
  );
  $cmd$
)
from cron.job j
where j.jobname = 'sync-all-accounts-4h';

-- 3. Confirm (format only, no value): expect 'read from Vault at run time'.
select jobname, schedule, active,
       command like '%vault.decrypted_secrets%' as reads_bearer_from_vault
from cron.job where jobname = 'sync-all-accounts-4h';
