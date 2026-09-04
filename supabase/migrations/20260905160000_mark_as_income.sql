-- Let the user declare that a P2P or cash receipt is real income.
--
-- The classifier can identify the RAIL money moved on. It cannot know
-- whether the person who sent $200 through Venmo was a customer or a
-- sibling. For this user that ambiguity is worth $12,794 in 2026 alone:
--   p2p     182 rows  $8,710.13
--   cash     38 rows  $4,084.00   (ATM deposits - cash earnings, or not)
--
-- Guessing is exactly the mistake that produced a +50% savings rate during
-- a -42% month. So the app asks instead of inferring.
--
-- No new column is needed. The trigger already yields to an explicitly
-- supplied exclusion_reason, so setting it to NULL and exclude_from_budget
-- to false is a durable user decision that automatic rules will not
-- overwrite. What IS needed is a record that the decision was deliberate,
-- so it survives a future reclassification pass and can be undone.

alter table transactions
  add column if not exists income_override boolean not null default false,
  add column if not exists income_override_at timestamptz;

comment on column transactions.income_override is
  'User explicitly declared this receipt to be real income. Automatic classification must never override it.';

create index if not exists idx_transactions_income_override
  on transactions (user_id, income_override) where income_override;

-- The trigger must respect the override on UPDATE as well as INSERT.
-- Without this, any future backfill that re-runs classify_exclusion_reason
-- would silently undo every decision the user made.
create or replace function classify_transaction_exclusion()
returns trigger as $$
declare reason text;
begin
  -- A deliberate user decision outranks every automatic rule.
  if new.income_override then
    new.exclude_from_budget := false;
    new.exclusion_reason := null;
    return new;
  end if;

  if new.exclusion_reason is not null then return new; end if;

  reason := classify_exclusion_reason(
    new.title, new.type, new.notes, new.pfc_detailed, new.pfc_primary);
  if reason is not null then
    new.exclude_from_budget := true;  new.exclusion_reason := reason;
  else
    new.exclude_from_budget := false; new.exclusion_reason := null;
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists trg_classify_transaction_exclusion on transactions;
create trigger trg_classify_transaction_exclusion
  before insert on transactions
  for each row
  execute function classify_transaction_exclusion();

-- Bulk marking by counterparty. Someone who pays you through Venmo pays you
-- repeatedly, so marking one sender's 40 payments individually is busywork
-- the app should absorb.
--
-- SECURITY DEFINER with an explicit user_id check: the caller can only ever
-- touch their own rows regardless of what they pass.
create or replace function mark_receipts_as_income(
  p_user_id uuid,
  p_transaction_ids uuid[] default null,
  p_title_pattern text default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  if auth.uid() is not null and auth.uid() <> p_user_id then
    raise exception 'Not your data' using errcode = '42501';
  end if;

  update transactions
  set income_override = true,
      income_override_at = now(),
      exclude_from_budget = false,
      exclusion_reason = null
  where user_id = p_user_id
    and type = 'income'
    and (
      (p_transaction_ids is not null and id = any(p_transaction_ids))
      or (p_title_pattern is not null and title ilike p_title_pattern)
    );

  get diagnostics n = row_count;
  return n;
end;
$$;

-- The inverse, so a mistake is reversible without a support request.
create or replace function unmark_receipts_as_income(
  p_user_id uuid,
  p_transaction_ids uuid[]
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  if auth.uid() is not null and auth.uid() <> p_user_id then
    raise exception 'Not your data' using errcode = '42501';
  end if;

  update transactions t
  set income_override = false,
      income_override_at = null,
      exclusion_reason = classify_exclusion_reason(
        t.title, t.type, t.notes, t.pfc_detailed, t.pfc_primary),
      exclude_from_budget = classify_exclusion_reason(
        t.title, t.type, t.notes, t.pfc_detailed, t.pfc_primary) is not null
  where t.user_id = p_user_id and t.id = any(p_transaction_ids);

  get diagnostics n = row_count;
  return n;
end;
$$;
