BEGIN;
SET LOCAL ROLE authenticated;
DO $test$
DECLARE blocked boolean := false;
BEGIN
  BEGIN
    UPDATE public.subscriptions SET status='active' WHERE false;
  EXCEPTION WHEN insufficient_privilege THEN blocked := true;
  END;
  IF NOT blocked THEN RAISE EXCEPTION 'Client can still write subscription status'; END IF;
  PERFORM count(*) FROM public.subscriptions;
END;
$test$;
SELECT 'Client writes blocked; reads still available' AS result;
ROLLBACK;
