-- Fix two errors in the PFC-first branch.
--
-- HOW THIS SURFACED. The user refreshed two accounts to populate balances.
-- That sync was the first to store personal_finance_category, so 291 rows
-- suddenly had PFC where every previous row had none - and the PFC branch
-- had never been exercised against real data.
--
-- ERROR 1 - MISSING VALUE. Plaid returns TRANSFER_OUT_CRYPTO for a Coinbase
-- purchase. That value was not in the handled list, so 113 crypto buys were
-- classified as ORDINARY SPENDING, inflating real spending by the full
-- amount of the user's crypto activity.
--
-- ERROR 2 - THE DESIGN, WHICH IS THE REAL BUG. The branch ended with a
-- blanket `return null`, meaning "PFC has spoken, this is ordinary money."
-- That was too strong a claim. PFC describes the RAIL a transaction moved
-- on; it does not always establish what the money WAS. Returning null for
-- any unrecognised value asserts certainty the data does not support, and
-- guarantees this exact failure again the first time Plaid adds a category.
--
-- The original reason for the blanket return was to stop a substring rule
-- overriding Plaid. That concern was valid when the text rules were
-- unanchored ILIKE matches; they are now structural (word boundaries,
-- anchored prefixes), so falling through is the safer default. An
-- unrecognised PFC value now defers to the text rules instead of silently
-- declaring the row ordinary.

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
  -- 0. Payment-processor payouts are WAGES, decided before anything else.
  --    Uber paying a driver is income regardless of the rail it arrives on,
  --    and Plaid labels those rails TRANSFER_IN_* - so letting PFC decide
  --    first classified real earnings as peer transfers.
  if t ~* '\y(uber pro card|payfare|raiser|lyft driver|doordash|instacart|grubhub)\y' then
    return null;
  end if;

  -- 1. Plaid's structural classification, for the values it settles.
  if d <> '' then
    -- Crypto. TRANSFER_OUT_CRYPTO was the missing value that classified 113
    -- Coinbase purchases as ordinary spending.
    if d in ('TRANSFER_OUT_CRYPTO','TRANSFER_IN_CRYPTO',
             'TRANSFER_OUT_INVESTMENT_AND_RETIREMENT_FUNDS',
             'TRANSFER_IN_INVESTMENT_AND_RETIREMENT_FUNDS') then
      return 'investment';
    end if;
    if d in ('TRANSFER_OUT_ACCOUNT_TRANSFER','TRANSFER_IN_ACCOUNT_TRANSFER',
             'TRANSFER_OUT_SAVINGS','TRANSFER_IN_SAVINGS',
             'TRANSFER_OUT_INTERNAL_ACCOUNT_TRANSFER',
             'TRANSFER_IN_INTERNAL_ACCOUNT_TRANSFER') then
      return 'transfer';
    end if;
    if d = 'TRANSFER_OUT_WITHDRAWAL' then return 'cash'; end if;
    if d in ('TRANSFER_OUT_OTHER_TRANSFER_OUT','TRANSFER_IN_OTHER_TRANSFER_IN',
             'TRANSFER_OUT_THIRD_PARTY','TRANSFER_IN_THIRD_PARTY') then
      return 'p2p';
    end if;

    -- A non-TRANSFER PFC value describes real spending or real income, and
    -- Plaid is authoritative there - return early so no text rule overrides
    -- it. Anything else (an unrecognised TRANSFER_* value, or a category
    -- Plaid adds later) falls through to the text rules rather than being
    -- silently declared ordinary.
    -- OTHER_OTHER is Plaid saying "I could not classify this", not
    -- "this is ordinary spending". Treating it as authoritative counted
    -- Venmo person-payments as real spending. Uncertainty must defer to
    -- the text rules, not end the decision.
    if d not like 'TRANSFER%' and d not like 'OTHER%' then
      return null;
    end if;
  end if;

  is_card := t ~* '\y(venmo|cash ?app|apple cash)\s*card\y';

  if t ~* '\y(rebate|refund|reversal)\y' or t ~* '\ycash ?back\y' then
    return null;
  end if;

  if t ~* '\y(coinbase|litecoin|ethereum|bitcoin|dogecoin|binance|kraken)'
     or t ~* '^coin\*' then
    return 'investment';
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

  if p_type = 'income' and (src like 'csv:venmo%' or n ~* '\yimported from venmo\y') then
    return 'p2p';
  end if;

  if not is_card and t ~* '\yatm\y' then
    return 'cash';
  end if;

  return null;
end;
$$;

-- Re-run over every row that is not an explicit user decision.
with nv as (
  select id, classify_exclusion_reason(title, type, notes, pfc_detailed, pfc_primary, import_source) r
  from transactions where not income_override
)
update transactions t
set exclusion_reason = nv.r, exclude_from_budget = (nv.r is not null)
from nv where t.id = nv.id
  and (coalesce(t.exclusion_reason,'~') is distinct from coalesce(nv.r,'~')
       or t.exclude_from_budget is distinct from (nv.r is not null));
