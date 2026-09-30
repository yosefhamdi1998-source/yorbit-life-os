-- Verifies the scheduled bank-sync job's authentication WITHOUT syncing:
-- sends the job's exact request (same URL, same Vault-sourced bearer) with
-- {"dry_run": true}. sync-all-accounts authenticates it through the same
-- gateway JWT check and requireSystemCaller, then returns only a count - no
-- Plaid call, no write. Requires cron-auth-fix.sql (legacy service_role JWT)
-- or cron-auth-fix-secret-key.sql (project secret key, with the function
-- deployed verify_jwt = false), and a sync-all-accounts with dry_run support.
-- It sends whichever Vault secret the bank job itself now uses.
--
-- A generic HTTP 200 from somewhere else proves nothing about this job;
-- the expected body below is specific to this path.

-- Step 1 - run alone. Returns a request id. pg_net sends it after commit.
select net.http_post(
  url := 'https://pvjiialxboslqyiiybpe.supabase.co/functions/v1/sync-all-accounts',
  headers := jsonb_build_object(
    'Authorization', 'Bearer ' || (select btrim(decrypted_secret, E' \t\r\n') from vault.decrypted_secrets
      where name = (select case when command like '%cron_secret_key%' then 'cron_secret_key' else 'cron_service_role_jwt' end
                    from cron.job where jobname = 'sync-all-accounts-4h')),
    'Content-Type', 'application/json'),
  body := '{"dry_run": true}'::jsonb
) as request_id;

-- Step 2 - run a few seconds later, substituting the id from step 1.
-- Pass: status_code 200 and content {"dry_run":true,"authenticated":true,"candidates":N}.
-- 401 with UNAUTHORIZED_INVALID_JWT_FORMAT: the bearer is still not a JWT.
-- 401 {"error":"Unauthorized"} from the function itself: the key reached the
-- function but matches neither SUPABASE_SERVICE_ROLE_KEY nor any of
-- SUPABASE_SECRET_KEYS (wrong, revoked or truncated key).
-- select status_code, content from net._http_response where id = <request_id>;

-- After the next scheduled run (every 4 hours), confirm real outcomes with
-- queries 3 and 4 of cron-auth-diagnose.sql: 200 = every account synced;
-- 502 = partial failure, with synced/skipped/failed counts and per-account
-- results in the body; last_synced_at should advance.
