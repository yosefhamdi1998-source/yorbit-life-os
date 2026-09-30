-- READ-ONLY launch facts for the owner decisions in OWNER_ACTIONS.md.
-- Counts and names only: no email address, token, key or secret value is
-- returned, and nothing is written. Run once with read access (Codex's
-- connector or the SQL editor). Scheduled-job authentication has its own
-- diagnosis: scripts/cron-auth-diagnose.sql.

-- 1. Can new users confirm their email? (OWNER_ACTIONS item 0)
-- Sign-up requires confirmation. Many recent unconfirmed accounts and no
-- recent confirmations suggests confirmation emails are not being delivered
-- (Supabase's built-in mailer only sends to the project's team).
select
  count(*)                                                                        as users,
  count(*) filter (where email_confirmed_at is not null)                          as confirmed,
  count(*) filter (where email_confirmed_at is null)                              as unconfirmed,
  count(*) filter (where email_confirmed_at is null
                     and created_at > now() - interval '30 days')                 as unconfirmed_last_30_days,
  count(*) filter (where email_confirmed_at > now() - interval '30 days')         as confirmed_last_30_days,
  count(*) filter (where created_at >= timestamp '2026-09-07')                    as created_since_signup_reopened,
  max(email_confirmed_at)                                                         as latest_confirmation
from auth.users;

-- 2. Accounts disconnected by the old client-only path that still hold a
-- bank credential (the app hides disconnected accounts, so their owners
-- cannot finish the removal). Nonzero = an authorized cleanup is needed.
select
  count(*)                              as disconnected_accounts_with_credential,
  count(distinct ca.user_id)            as users,
  count(distinct ca.provider_item_id)   as bank_items
from public.connected_accounts ca
join public.plaid_credentials pc on pc.connected_account_id = ca.id
where ca.sync_status = 'disconnected';

-- 3. Bank connections by state, and how fresh the last successful sync is.
-- 'disconnecting' rows are unfinished disconnects the owner can retry.
select provider, sync_status, count(*) as accounts, max(last_synced_at) as most_recent_sync
from public.connected_accounts
group by provider, sync_status
order by provider, sync_status;

-- 4. Subscription rows (web = stripe, iOS = app_store). Live billing is off
-- in code, so any active/trialing Stripe row predates this release or is a
-- sandbox test account.
select provider, status, plan, count(*) as rows
from public.subscriptions
group by provider, status, plan
order by provider, status, plan;

-- 5. Scheduler credential present in Vault? (name only; OWNER_ACTIONS item 2)
select exists (select 1 from vault.secrets where name = 'cron_service_role_jwt') as cron_service_role_jwt_present;

-- 6. The three September 27 migrations are recorded under the versions the
-- repository files now carry (renamed in fbe2c5b), so a CLI db push sees them
-- as applied rather than new.
select version, name
from supabase_migrations.schema_migrations
where version in ('20260927212600', '20260927213555', '20260927213604')
order by version;
