-- Classify Venmo CSV rows by import_source, not by notes.
--
-- BUG INTRODUCED BY THE PREVIOUS MIGRATION. The classifier identified rows
-- imported from a Venmo CSV by reading notes ~* 'imported from venmo',
-- because at the time `notes` was the only place origin was recorded. The
-- notes-separation migration then moved that marker into import_source and
-- nulled the notes - which silently disabled the rule for every row, while
-- leaving the ALREADY-STORED classifications untouched.
--
-- The result was the same source classified two different ways depending on
-- when the row happened to be classified:
--     Uber Pro Card   34 counted / 12 p2p
--     PayFare         18 counted /  7 p2p
--     Apple Cash       2 counted / 41 p2p
--
-- Two lessons, both recorded because they generalise:
--   1. A rule that reads a column is coupled to that column. Moving data
--      out from under a rule requires re-running it, not just moving the
--      data.
--   2. Stored classification is a CACHE of a function's output. Any change
--      to the function's inputs invalidates it, and nothing was enforcing
--      that.

create or replace function classify_exclusion_reason(
  p_title text,
  p_type text,
  p_notes text default null,
  p_pfc_detailed text default null,
  p_pfc_primary text default null,
  p_import_source text default null
)
returns text
language plpgsql
immutable
as $$
declare
  t text := coalesce(p_title, '');
  n text := coalesce(p_notes, '');
  d text := upper(coalesce(p_pfc_detailed, ''));
  src text := lower(coalesce(p_import_source, ''));
  is_card boolean;
begin
  -- 1. Plaid's own structural classification wins outright where present.
  if d <> '' then
    if d in ('TRANSFER_OUT_ACCOUNT_TRANSFER','TRANSFER_IN_ACCOUNT_TRANSFER',
             'TRANSFER_OUT_SAVINGS','TRANSFER_IN_SAVINGS',
             'TRANSFER_OUT_INTERNAL_ACCOUNT_TRANSFER',
             'TRANSFER_IN_INTERNAL_ACCOUNT_TRANSFER') then
      return 'transfer';
    end if;
    if d in ('TRANSFER_OUT_INVESTMENT_AND_RETIREMENT_FUNDS',
             'TRANSFER_IN_INVESTMENT_AND_RETIREMENT_FUNDS') then
      return 'investment';
    end if;
    if d = 'TRANSFER_OUT_WITHDRAWAL' then return 'cash'; end if;
    if d in ('TRANSFER_OUT_OTHER_TRANSFER_OUT','TRANSFER_IN_OTHER_TRANSFER_IN') then
      return 'p2p';
    end if;
    return null;
  end if;

  is_card := t ~* '\y(venmo|cash ?app|apple cash)\s*card\y';

  if t ~* '\y(rebate|refund|reversal)\y' or t ~* '\ycash back reward\y' then
    return null;
  end if;

  if t ~* '\y(coinbase|litecoin|ethereum|bitcoin|dogecoin|binance|kraken)'
     or t ~* '^coin\*' then
    return 'investment';
  end if;

  -- Payment-processor payouts are WAGES. Checked before every P2P rule so a
  -- driver payout is never reclassified by the rail it arrived on.
  if t ~* '\y(uber pro card|payfare|lyft driver|doordash|instacart|grubhub)\y' then
    return null;
  end if;

  if t ~* '\yonline banking transfer\y'
     or t ~* '\ykeep ?the ?change\y'
     or t ~* '\y(instant add money|instant transfer to|add funds)\y' then
    return 'transfer';
  end if;

  if not is_card
     and (t ~* '\y(zelle|venmo|cash ?app|apple cash)\y'
          or t ~* '\ypmnt (sent|rcvd)\y') then
    return 'p2p';
  end if;

  -- Venmo CSV rows carry the COUNTERPARTY as the title - a person's name,
  -- with no keyword to match. Keyed on import_source now that origin has a
  -- column of its own; the notes fallback stays only for rows imported
  -- before import_source existed.
  if p_type = 'income' and (src like 'csv:venmo%' or n ~* '\yimported from venmo\y') then
    return 'p2p';
  end if;

  if not is_card and t ~* '\yatm\y' then
    return 'cash';
  end if;

  return null;
end;
$$;

drop function if exists classify_exclusion_reason(text, text, text, text, text);

create or replace function classify_transaction_exclusion()
returns trigger as $$
declare reason text;
begin
  if new.income_override then
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

-- Re-run classification over every row, because the stored values are a
-- stale cache of the old function. Rows the user explicitly marked as
-- income are skipped - a deliberate decision outranks any automatic rule.
with nv as (
  select id, classify_exclusion_reason(title, type, notes, pfc_detailed, pfc_primary, import_source) r
  from transactions where not income_override
)
update transactions t
set exclusion_reason = nv.r, exclude_from_budget = (nv.r is not null)
from nv where t.id = nv.id
  and (coalesce(t.exclusion_reason,'~') is distinct from coalesce(nv.r,'~')
       or t.exclude_from_budget is distinct from (nv.r is not null));
