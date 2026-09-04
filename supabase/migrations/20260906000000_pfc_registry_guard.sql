-- A registry of every Plaid PFC value the classifier explicitly handles,
-- plus a guard that surfaces anything new instead of silently defaulting.
--
-- WHY. TRANSFER_OUT_CRYPTO arrived from a routine sync and silently
-- reclassified 113 crypto purchases as ordinary spending. Nothing failed,
-- nothing logged, and it was found only because a consistency check
-- happened to be run afterwards. Plaid maintains ~100+ detailed categories
-- and adds to them; every addition is a chance to repeat that.
--
-- The registry is deliberately NOT an attempt to transcribe Plaid's full
-- taxonomy from memory - that list would itself go stale and would be
-- asserting knowledge rather than checking it. It records what THIS
-- classifier decides for the values it has actually seen or explicitly
-- handles, and flags everything else for a human.

create table if not exists pfc_registry (
  pfc_detailed text primary key,
  -- What the classifier does with it: 'investment' | 'transfer' | 'cash' |
  -- 'p2p' | 'spending' (counted) | 'fallthrough' (defers to text rules)
  disposition text not null,
  note text,
  added_at timestamptz not null default now()
);

alter table pfc_registry enable row level security;

insert into pfc_registry (pfc_detailed, disposition, note) values
  -- Explicitly mapped by classify_exclusion_reason.
  ('TRANSFER_OUT_CRYPTO',                          'investment', 'Coinbase purchase. The value whose absence caused the bug.'),
  ('TRANSFER_IN_CRYPTO',                           'investment', 'Crypto proceeds'),
  ('TRANSFER_OUT_INVESTMENT_AND_RETIREMENT_FUNDS', 'investment', null),
  ('TRANSFER_IN_INVESTMENT_AND_RETIREMENT_FUNDS',  'investment', null),
  ('TRANSFER_OUT_ACCOUNT_TRANSFER',                'transfer',   null),
  ('TRANSFER_IN_ACCOUNT_TRANSFER',                 'transfer',   null),
  ('TRANSFER_OUT_SAVINGS',                         'transfer',   null),
  ('TRANSFER_IN_SAVINGS',                          'transfer',   null),
  ('TRANSFER_OUT_INTERNAL_ACCOUNT_TRANSFER',       'transfer',   null),
  ('TRANSFER_IN_INTERNAL_ACCOUNT_TRANSFER',        'transfer',   null),
  ('TRANSFER_OUT_WITHDRAWAL',                      'cash',       null),
  ('TRANSFER_OUT_OTHER_TRANSFER_OUT',              'p2p',        null),
  ('TRANSFER_IN_OTHER_TRANSFER_IN',                'p2p',        null),
  ('TRANSFER_OUT_THIRD_PARTY',                     'p2p',        null),
  ('TRANSFER_IN_THIRD_PARTY',                      'p2p',        null),
  -- Deliberately deferred to the text rules. TRANSFER_* and OTHER_* values
  -- describe a rail or an absence of knowledge, not what the money was.
  ('TRANSFER_IN_TRANSFER_IN_FROM_APPS',            'fallthrough','Apple Cash / PayFare both arrive here; the counterparty decides'),
  ('TRANSFER_OUT_TRANSFER_OUT_FROM_APPS',          'fallthrough','Venmo/Cash App sends'),
  ('TRANSFER_IN_DEPOSIT',                          'fallthrough','ATM deposit vs paycheque - the title decides'),
  ('OTHER_OTHER',                                  'fallthrough','Plaid could not classify it; not a claim of ordinariness')
on conflict (pfc_detailed) do nothing;

-- Every non-TRANSFER, non-OTHER value is treated as real spending or
-- income and returns early. Those are recorded as seen rather than
-- pre-declared, so the registry reflects reality instead of a guess.
insert into pfc_registry (pfc_detailed, disposition, note)
select distinct pfc_detailed, 'spending', 'auto-recorded: Plaid category treated as real spending/income'
from transactions
where pfc_detailed is not null
  and pfc_detailed not like 'TRANSFER%'
  and pfc_detailed not like 'OTHER%'
on conflict (pfc_detailed) do nothing;

-- THE GUARD. Any PFC value present in the data but absent from the
-- registry is unreviewed - nobody has decided what it should mean.
create or replace function unregistered_pfc_values()
returns table (pfc_detailed text, rows bigint, total_usd numeric, sample_title text)
language sql
stable
as $$
  select t.pfc_detailed, count(*), round(sum(t.amount)::numeric, 2), min(t.title)
  from transactions t
  left join pfc_registry r on r.pfc_detailed = t.pfc_detailed
  where t.pfc_detailed is not null and r.pfc_detailed is null
  group by t.pfc_detailed
  order by count(*) desc;
$$;

-- Called after a sync so an unknown value is visible in the logs at the
-- moment it arrives, rather than whenever someone next thinks to check.
create or replace function log_unregistered_pfc()
returns integer
language plpgsql
as $$
declare
  r record;
  n integer := 0;
begin
  for r in select * from unregistered_pfc_values() loop
    raise warning 'UNREGISTERED PFC VALUE: % (% rows, $%). Sample: %. Classifier has no explicit rule; it is falling through to text matching. Review and add to pfc_registry.',
      r.pfc_detailed, r.rows, r.total_usd, r.sample_title;
    n := n + 1;
  end loop;
  return n;
end;
$$;
