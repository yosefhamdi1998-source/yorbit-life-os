-- App Store (RevenueCat) entitlements, recorded server-side.
--
-- Until now only the iOS app knew about an App Store purchase (the
-- RevenueCat SDK); the server did not, so ai-coach gave iOS subscribers the
-- free allowance and the web app showed them as free. The revenuecat-webhook
-- and revenuecat-sync functions now write one row per user with
-- provider = 'app_store', derived from RevenueCat's current customer info -
-- never from anything the client sends.
--
-- Same table as Stripe on purpose: every existing reader already treats an
-- active/trialing, non-free row as Pro (ai-coach, the web Pro check), while
-- the Stripe-specific readers only look at rows with Stripe ids (billing
-- portal, the cancel-before-delete step), which these rows never have.
-- Clients still cannot write this table (20260908234547).

alter table public.subscriptions
  add column if not exists provider text not null default 'stripe';

alter table public.subscriptions
  drop constraint if exists subscriptions_provider_check;
alter table public.subscriptions
  add constraint subscriptions_provider_check check (provider in ('stripe', 'app_store'));

alter table public.subscriptions
  add column if not exists store_product_id text,
  add column if not exists store_environment text;

alter table public.subscriptions
  drop constraint if exists subscriptions_store_environment_check;
alter table public.subscriptions
  add constraint subscriptions_store_environment_check
  check (store_environment is null or store_environment in ('production', 'sandbox'));

-- One App Store row per user: RevenueCat reports entitlement state per
-- customer, and concurrent webhook/sync writes must converge on one row.
create unique index if not exists subscriptions_one_app_store_row_per_user
  on public.subscriptions (user_id)
  where provider = 'app_store';

comment on column public.subscriptions.provider is
  'stripe | app_store. app_store rows are written only by revenuecat-webhook / '
  'revenuecat-sync from RevenueCat''s current customer info.';
