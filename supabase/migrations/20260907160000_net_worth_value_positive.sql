-- net_worth_entries.value had no sign/bound check at all — budgets and
-- bills both already constrain their amount columns (monthly_limit > 0 and
-- <= 10000000, amount > 0 and <= 10000000), but this table was missed. A
-- typo like -5000 for an asset was accepted silently and subtracted from
-- net worth instead of adding to it — `type` (asset/liability) is what's
-- supposed to decide the sign, not the number itself. Client-side validation
-- alone (Finance.jsx saveNW) is a suggestion; this is the real enforcement.
--
-- Adding the constraint directly would fail outright if any existing row
-- already violates it, so existing bad rows are fixed FIRST — a typo'd
-- negative almost certainly meant the positive amount, so this takes the
-- absolute value rather than silently deleting someone's entry. Zero-value
-- rows (meaningless either way) are removed. Both are logged by count so
-- this isn't a silent rewrite of someone's data.
do $$
declare
  negative_count integer;
  zero_count integer;
begin
  select count(*) into negative_count from net_worth_entries where value < 0;
  select count(*) into zero_count from net_worth_entries where value = 0;

  if negative_count > 0 then
    raise notice 'net_worth_value_positive: correcting % negative value(s) to their absolute value', negative_count;
    update net_worth_entries set value = abs(value) where value < 0;
  end if;

  if zero_count > 0 then
    raise notice 'net_worth_value_positive: removing % zero-value entry(ies)', zero_count;
    delete from net_worth_entries where value = 0;
  end if;
end $$;

-- 1,000,000,000 is a sanity ceiling, not a realistic limit — high enough
-- that no genuine entry (a house, a business) ever hits it, low enough to
-- catch a fat-fingered extra digit or two.
alter table net_worth_entries
  drop constraint if exists net_worth_entries_value_check;
alter table net_worth_entries
  add constraint net_worth_entries_value_check check (value > 0 and value <= 1000000000);
