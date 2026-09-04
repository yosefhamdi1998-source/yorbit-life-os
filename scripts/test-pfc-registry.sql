-- Fails when Plaid sends a personal_finance_category the classifier has
-- never been told what to do with.
--
-- TRANSFER_OUT_CRYPTO arrived from a routine sync and silently reclassified
-- 113 crypto purchases as ordinary spending. Nothing failed and nothing
-- logged; it was found only because someone happened to run a consistency
-- check afterwards. Plaid has ~100+ detailed categories and adds to them,
-- so this will happen again - the only question is whether it is noticed.
--
-- Run: npx supabase db query --linked -f scripts/test-pfc-registry.sql
--
-- Any row returned is a FAILURE.

-- 1. Values present in real data that nobody has reviewed.
select
  'UNREGISTERED PFC VALUE' as failure,
  pfc_detailed              as detail,
  rows::text                as rows,
  total_usd::text           as usd,
  left(sample_title, 44)    as sample
from unregistered_pfc_values()

union all

-- 2. A registry entry claiming a disposition the classifier does not
--    actually produce. Catches the registry drifting away from the code -
--    the same class of failure as enum drift, where two lists agree on
--    paper and disagree in practice.
select
  'REGISTRY DISAGREES WITH CLASSIFIER',
  r.pfc_detailed,
  count(*)::text,
  round(sum(t.amount)::numeric, 2)::text,
  'registry says ' || r.disposition || ', classifier produced ' ||
    coalesce(t.exclusion_reason, 'COUNTED')
from pfc_registry r
join transactions t on t.pfc_detailed = r.pfc_detailed
where not t.income_override
  -- Payment-processor payouts deliberately outrank PFC: Uber paying a
  -- driver is wages regardless of the rail it arrives on, and Plaid labels
  -- those rails TRANSFER_IN_*. That override is intentional, so it is not
  -- a disagreement.
  and t.title !~* '\y(uber pro card|payfare|raiser|lyft driver|doordash|instacart|grubhub)\y'
  and r.disposition in ('investment', 'transfer', 'cash', 'p2p')
  and coalesce(t.exclusion_reason, '~') is distinct from r.disposition
group by r.pfc_detailed, r.disposition, t.exclusion_reason

union all

-- 3. A value the registry marks as ordinary spending that is nonetheless
--    being excluded. Means a text rule is overriding a Plaid category the
--    registry says is authoritative.
select
  'SPENDING VALUE BEING EXCLUDED',
  r.pfc_detailed,
  count(*)::text,
  round(sum(t.amount)::numeric, 2)::text,
  'excluded as ' || t.exclusion_reason
from pfc_registry r
join transactions t on t.pfc_detailed = r.pfc_detailed
where r.disposition = 'spending'
  and t.exclusion_reason is not null
  and not t.income_override
group by r.pfc_detailed, t.exclusion_reason;
