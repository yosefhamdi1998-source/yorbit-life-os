-- ALTERNATIVE scheduled-job repair that needs nobody to copy a key.
-- Use this OR cron-auth-fix.sql (legacy service_role JWT), not both.
--
-- Supabase's documented pattern for calling an Edge Function with a new
-- project secret key (sb_secret_...) is verify_jwt = false plus a check of
-- that key inside the function (https://supabase.com/docs/guides/api/api-keys).
-- requireSystemCaller (supabase/functions/_shared/supabase.ts) compares the
-- caller's Bearer key, in constant time, with the SUPABASE_SECRET_KEYS the
-- runtime injects; anything else still needs a signed-in admin.
--
-- PREREQUISITES, in order:
--   1. Owner approval to deploy sync-all-accounts and
--      generate-subscription-reminders with verify_jwt = false (set it for
--      those two in supabase/config.toml as part of that deploy). While the
--      gateway still requires a JWT, a secret key never reaches the check.
--   2. The deployed functions include isProjectSecretKey (commit that added
--      this file or later).
--
-- What this does:
--   1. If Vault has no cron_secret_key yet, copies the sb_secret_ key already
--      stored in the reminders (or weekly analysis) job into Vault. The value
--      is never selected or shown. If no job holds one, it stops and asks for
--      a secret key to be added to Vault by the owner (API Keys > Secret keys).
--   2. Refuses anything but a complete sb_secret_ key.
--   3. Points bank sync and reminders at it, keeping their schedules. The
--      weekly AI job is not touched (re-enabling it waits on the AI approval).
-- Then run cron-auth-verify.sql: it sends the same key the job now uses.

-- 1-2. Vault secret, created from the existing job if needed, then checked.
do $$
declare
  v text;
begin
  if not exists (select 1 from vault.decrypted_secrets where name = 'cron_secret_key') then
    select substring(command from 'Bearer (sb_secret_[A-Za-z0-9_-]+)') into v
    from cron.job
    where jobname in ('generate-subscription-reminders-daily', 'weekly-custom-record-analysis')
      and command ~ 'Bearer sb_secret_'
    order by jobname limit 1;
    if v is null then
      raise exception 'No job holds an sb_secret_ key to reuse. Add a project secret key to Vault as cron_secret_key (API Keys > Secret keys), then run this again.';
    end if;
    perform vault.create_secret(v, 'cron_secret_key', 'Scheduled job authentication (project secret key)');
  end if;
  select btrim(decrypted_secret, E' \t\r\n') into v from vault.decrypted_secrets where name = 'cron_secret_key';
  if v !~ '^sb_secret_[A-Za-z0-9_-]{20,}$' then
    raise exception 'cron_secret_key is not a complete sb_secret_ key (length %) - replace it in Vault', length(v);
  end if;
end $$;

-- 3. Point the two existing jobs at the Vault secret, keeping their schedules.
select cron.schedule(
  j.jobname,
  j.schedule,
  format($cmd$
  select net.http_post(
    url := %L,
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (select btrim(decrypted_secret, E' \t\r\n') from vault.decrypted_secrets where name = 'cron_secret_key'),
      'Content-Type', 'application/json'),
    body := '{}'::jsonb
  );
  $cmd$, 'https://pvjiialxboslqyiiybpe.supabase.co/functions/v1/' || f.fn)
)
from cron.job j
join (values ('sync-all-accounts-4h', 'sync-all-accounts'),
             ('generate-subscription-reminders-daily', 'generate-subscription-reminders')) as f(jobname, fn)
  on f.jobname = j.jobname;

-- 4. Confirm (format only, no value).
select jobname, schedule, active,
       command like '%cron_secret_key%' as reads_secret_key_from_vault
from cron.job
where jobname in ('sync-all-accounts-4h', 'generate-subscription-reminders-daily', 'weekly-custom-record-analysis')
order by jobname;
