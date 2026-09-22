-- PROPOSED — NOT APPLIED, AND DELIBERATELY NOT IN supabase/migrations/.
--
-- A file under migrations/ runs on the next `supabase db push`. This one
-- changes what a destructive function destroys, so it stays outside that path
-- until the owner approves the scope below. Move it into migrations/ with a
-- timestamped name to adopt it.
--
-- ============================================================================
-- THE TWO ACTIONS ARE DIFFERENT
-- ============================================================================
--
-- 1. "Delete all your financial data" (Settings) — THE ACCOUNT SURVIVES.
--    Runs delete_all_my_data(). This is the one being changed.
--
-- 2. "Delete account" (Settings) — PERMANENT.
--    Runs the delete-account Edge Function, which already: cancels Stripe
--    subscriptions and refuses to continue if cancellation is unconfirmed;
--    removes Plaid Items and refuses to continue if disconnection is
--    unconfirmed; deletes advisor messages and conversations; then deletes the
--    auth user, which cascades to every table carrying user_id. That path is
--    comprehensive and is NOT changed here.
--
-- ============================================================================
-- PROPOSED SCOPE FOR ACTION 1
-- ============================================================================
--
-- ALREADY CLEARED (8): transactions, budgets, bills, goals, savings_goals,
--   net_worth_entries, investment_holdings, ai_insight_caches.
--
-- PROPOSED TO ADD (3) — these are financial records and survive today:
--   advisor_conversations, advisor_messages
--       The AI Coach history. It is a detailed discussion of the owner's
--       income, spending and debts — arguably the most sensitive financial
--       record in the app. Someone clearing their financial data would not
--       expect their money conversations to remain.
--   custom_records
--       Rows the owner entered into their own forms, which in a finance app
--       are overwhelmingly financial. The form DEFINITION (custom_forms) is a
--       tool and is kept; the data captured by it is not.
--
-- DELIBERATELY KEPT, with reasons — see scripts/test-delete-coverage.mjs,
-- which fails if any user-owned table is neither cleared nor listed there:
--   habits, tasks, health_logs, journal_entries  not financial records at all.
--       Clearing them would be over-deletion in the opposite direction: someone
--       resetting their budget has not asked to lose their journal.
--   notes                       general notepad. OWNER DECISION PENDING.
--   subscriptions               the account survives, so the entitlement must.
--   connected_accounts          bank links stay reusable; clearing forces a
--                               full re-connect nobody asked for.
--   bank_sync_logs              audit trail, kept for support.
--   notifications               transient and self-expiring.
--   custom_forms                the tool, not the data.
--
-- EXTERNAL SERVICES: unchanged by this action. Stripe subscriptions and Plaid
-- Items are NOT touched, because the account survives and the owner keeps using
-- it. Only "Delete account" reaches external services.
--
-- COPY: the success toast currently says "All your financial data has been
-- removed", which overstates it whatever this scope ends up being. That is
-- corrected separately and does not need this migration.

begin;

create or replace function delete_all_my_data()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from transactions where user_id = auth.uid();
  delete from budgets where user_id = auth.uid();
  delete from savings_goals where user_id = auth.uid();
  delete from goals where user_id = auth.uid();
  delete from bills where user_id = auth.uid();
  delete from net_worth_entries where user_id = auth.uid();
  delete from ai_insight_caches where user_id = auth.uid();
  delete from investment_holdings where user_id = auth.uid();
  -- Added by this proposal. Messages first: they reference conversations.
  delete from advisor_messages where user_id = auth.uid();
  delete from advisor_conversations where user_id = auth.uid();
  delete from custom_records where user_id = auth.uid();
end;
$$;

commit;
