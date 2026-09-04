-- Persistent "this sender pays me" rules.
--
-- Marking rows one at a time fixes history and nothing else. Rent arrives
-- every month and rides are paid weekly, so without a durable rule the user
-- would re-mark the same senders forever, and any month they forgot would
-- silently understate income.
--
-- The classifier can identify the RAIL money moved on. It cannot know
-- whether the person who sent $900 through Zelle is a tenant or a sibling.
-- That is knowledge only the user has, so the app stores it rather than
-- guessing - guessing is what produced a +50% savings rate during a -42%
-- month.

create table if not exists income_senders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  -- Matched case-insensitively against the transaction title. Stored as the
  -- name rather than a regex so the UI can show a plain list the user can
  -- read and remove.
  sender_pattern text not null,
  label text,
  created_at timestamptz not null default now(),
  unique (user_id, sender_pattern)
);

alter table income_senders enable row level security;

drop policy if exists "own income senders" on income_senders;
create policy "own income senders" on income_senders
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Does any of this user's sender rules match this title?
--
-- SECURITY DEFINER so the classifier can consult it while running inside a
-- trigger, where the caller's role may not be able to read the table.
create or replace function title_matches_income_sender(p_user_id uuid, p_title text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from income_senders s
    where s.user_id = p_user_id
      and p_title ilike '%' || s.sender_pattern || '%'
  );
$$;

-- The trigger consults the sender list before any automatic rule.
create or replace function classify_transaction_exclusion()
returns trigger as $$
declare reason text;
begin
  -- An explicit per-row decision is the strongest signal.
  if new.income_override then
    new.exclude_from_budget := false;
    new.exclusion_reason := null;
    return new;
  end if;

  -- Then a standing "this person pays me" rule. Income only: a payment TO
  -- a tenant is not income, and the same name appears on both sides.
  if new.type = 'income'
     and title_matches_income_sender(new.user_id, new.title) then
    new.exclude_from_budget := false;
    new.exclusion_reason := null;
    return new;
  end if;

  if new.exclusion_reason is not null then return new; end if;

  reason := classify_exclusion_reason(
    new.title, new.type, new.notes, new.pfc_detailed, new.pfc_primary, new.import_source);
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

-- Applies a sender rule to history as well as future rows, so adding a
-- sender does not leave past payments misclassified.
create or replace function apply_income_sender(p_user_id uuid, p_pattern text, p_label text default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare n integer;
begin
  if auth.uid() is not null and auth.uid() <> p_user_id then
    raise exception 'Not your data' using errcode = '42501';
  end if;

  insert into income_senders (user_id, sender_pattern, label)
  values (p_user_id, p_pattern, p_label)
  on conflict (user_id, sender_pattern) do update set label = excluded.label;

  update transactions
  set income_override = true,
      income_override_at = now(),
      exclude_from_budget = false,
      exclusion_reason = null
  where user_id = p_user_id
    and type = 'income'
    and title ilike '%' || p_pattern || '%';

  get diagnostics n = row_count;
  return n;
end;
$$;
