-- Preserve function behavior and privileges; remove caller-controlled name resolution.
BEGIN;
ALTER FUNCTION public.touch_updated_date() SET search_path = '';
ALTER FUNCTION public.stamp_net_worth_value_change() SET search_path = '';
ALTER FUNCTION public.is_exchange_transfer(text) SET search_path = '';
ALTER FUNCTION public.classify_exclusion_reason(text,text,text,text,text,text) SET search_path = '';
CREATE OR REPLACE FUNCTION public.unregistered_pfc_values()
RETURNS TABLE(pfc_detailed text, rows bigint, total_usd numeric, sample_title text)
LANGUAGE sql STABLE SET search_path = '' AS $fn$
  SELECT t.pfc_detailed, count(*), round(sum(t.amount)::numeric, 2), min(t.title)
  FROM public.transactions t
  LEFT JOIN public.pfc_registry r ON r.pfc_detailed = t.pfc_detailed
  WHERE t.pfc_detailed IS NOT NULL AND r.pfc_detailed IS NULL
  GROUP BY t.pfc_detailed ORDER BY count(*) DESC;
$fn$;
CREATE OR REPLACE FUNCTION public.log_unregistered_pfc()
RETURNS integer LANGUAGE plpgsql SET search_path = '' AS $fn$
DECLARE r record; n integer := 0;
BEGIN
  FOR r IN SELECT * FROM public.unregistered_pfc_values() LOOP
    RAISE WARNING 'UNREGISTERED PFC VALUE: % (% rows, $%). Sample: %. Classifier has no explicit rule; it is falling through to text matching. Review and add to pfc_registry.',
      r.pfc_detailed, r.rows, r.total_usd, r.sample_title;
    n := n + 1;
  END LOOP;
  RETURN n;
END;
$fn$;
COMMIT;
