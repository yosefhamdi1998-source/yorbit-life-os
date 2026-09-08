BEGIN;
CREATE TEMP TABLE yorbit_trigger_check(value numeric, value_updated_at timestamptz, updated_date timestamptz);
CREATE TRIGGER check_touch BEFORE UPDATE ON yorbit_trigger_check FOR EACH ROW EXECUTE FUNCTION public.touch_updated_date();
CREATE TRIGGER check_value BEFORE UPDATE ON yorbit_trigger_check FOR EACH ROW EXECUTE FUNCTION public.stamp_net_worth_value_change();
INSERT INTO yorbit_trigger_check(value) VALUES (1);
UPDATE yorbit_trigger_check SET value=2;
DO $test$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM yorbit_trigger_check WHERE value=2 AND updated_date IS NOT NULL AND value_updated_at IS NOT NULL) THEN RAISE EXCEPTION 'Timestamp trigger failed'; END IF;
  IF public.is_exchange_transfer('Coinbase') IS DISTINCT FROM true THEN RAISE EXCEPTION 'Exchange classifier failed'; END IF;
  IF public.classify_exclusion_reason('PayFare','income') IS NOT NULL THEN RAISE EXCEPTION 'Wage classifier failed'; END IF;
  IF public.classify_exclusion_reason('Coinbase','expense') IS DISTINCT FROM 'investment' THEN RAISE EXCEPTION 'Investment classifier failed'; END IF;
  PERFORM count(*) FROM public.unregistered_pfc_values();
END;
$test$;
SELECT 'Function checks passed; test table rolled back' AS result;
ROLLBACK;
