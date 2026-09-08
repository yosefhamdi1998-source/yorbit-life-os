BEGIN;
-- Billing entitlements are populated by trusted server webhooks, never by clients.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.subscriptions FROM PUBLIC, anon, authenticated;
DROP POLICY IF EXISTS subscriptions_insert_own ON public.subscriptions;
DROP POLICY IF EXISTS subscriptions_update_own ON public.subscriptions;
DROP POLICY IF EXISTS subscriptions_delete_own ON public.subscriptions;
-- Keep the existing owner-scoped SELECT policy and server service_role grants.
DO $check$
BEGIN
  IF has_table_privilege('authenticated','public.subscriptions','INSERT') OR has_table_privilege('authenticated','public.subscriptions','UPDATE') OR has_table_privilege('authenticated','public.subscriptions','DELETE') THEN RAISE EXCEPTION 'Client subscription writes still allowed'; END IF;
  IF NOT has_table_privilege('authenticated','public.subscriptions','SELECT') THEN RAISE EXCEPTION 'Client subscription reads unavailable'; END IF;
  IF NOT has_table_privilege('service_role','public.subscriptions','INSERT') OR NOT has_table_privilege('service_role','public.subscriptions','UPDATE') OR NOT has_table_privilege('service_role','public.subscriptions','DELETE') THEN RAISE EXCEPTION 'Server billing writes unavailable'; END IF;
END;
$check$;
COMMIT;
