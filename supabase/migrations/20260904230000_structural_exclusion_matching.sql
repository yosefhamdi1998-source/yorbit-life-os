-- Replace substring guessing with structural matching.
--
-- ROOT CAUSE of every misclassification found in the audit: rules were
-- unanchored ILIKE substring tests against a free-text bank descriptor.
-- '%atm%' matches TREATMENT. '%venmo%' matches the Venmo debit card. A
-- substring says nothing about what a row IS.
--
-- The right signal is Plaid's personal_finance_category, which describes
-- the transaction structurally instead of textually. Measured coverage on
-- this database: ZERO of 15,700 rows have pfc_detailed populated. The
-- columns were added by a migration that only fills them on new syncs, and
-- none has run since. So PFC is used FIRST where present — every future
-- Plaid row — and title matching remains the only available signal for
-- existing rows.
--
-- Where title matching is unavoidable it is now structural rather than
-- substring:
--   * \y word boundaries, so 'atm' never matches inside TREATMENT
--   * anchored prefixes for descriptors with a known shape
--   * rail-vs-counterparty separation: 'venmo' followed by 'card' is a
--     SPENDING INSTRUMENT and must never be read as a person-to-person
--     payment. Those are opposite categories.

create or replace function classify_exclusion_reason(
  p_title text,
  p_type text,
  p_notes text default null,
  p_pfc_detailed text default null,
  p_pfc_primary text default null
)
returns text
language plpgsql
immutable
as $$
declare
  t text := coalesce(p_title, '');
  n text := coalesce(p_notes, '');
  d text := upper(coalesce(p_pfc_detailed, ''));
  is_card boolean;
begin
  -- ------------------------------------------------------------------
  -- 1. STRUCTURAL: Plaid's own classification, when we have it.
  -- ------------------------------------------------------------------
  -- Plaid already distinguishes a card purchase from a transfer from a
  -- withdrawal. Where it has spoken, no amount of title parsing improves
  -- on it, so it wins outright.
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
    if d = 'TRANSFER_OUT_WITHDRAWAL' then
      return 'cash';
    end if;
    if d in ('TRANSFER_OUT_OTHER_TRANSFER_OUT','TRANSFER_IN_OTHER_TRANSFER_IN') then
      return 'p2p';
    end if;
    -- Any other PFC value describes real spending or real income. Falling
    -- through to the text rules here would let a substring override Plaid,
    -- which is the whole bug — so stop.
    return null;
  end if;

  -- ------------------------------------------------------------------
  -- 2. TEXTUAL fallback, for rows with no PFC (CSV imports, manual entry,
  --    and every row imported before pfc_detailed existed).
  -- ------------------------------------------------------------------

  -- RAIL vs COUNTERPARTY. 'Venmo Card - APPLE.COM/BILL' is a debit card
  -- purchase at Apple. 'Venmo' alone is a payment to a person. Same brand,
  -- opposite categories — the word that follows decides, not its presence.
  is_card := t ~* '\y(venmo|cash ?app|apple cash)\s*card\y';

  -- Money coming back is not money going out. Checked first because these
  -- descriptors contain the literal string "ATM".
  if t ~* '\y(rebate|refund|reversal)\y' or t ~* '\ycash back reward\y' then
    return null;
  end if;

  -- Investing. Checked before the card exemption so crypto bought with a
  -- Venmo card is still investing.
  -- LEADING boundary only. Bank descriptors concatenate the merchant with
  -- a suffix: 'PAYPAL *COINBASEINC 4029357733 CA' is a real Coinbase
  -- purchase, and requiring a trailing boundary made it read as ordinary
  -- spending. These names are distinctive enough that a leading boundary
  -- is sufficient. Contrast 'atm' below, which is three common letters and
  -- needs boundaries on BOTH sides.
  if t ~* '\y(coinbase|litecoin|ethereum|bitcoin|dogecoin|binance|kraken)'
     or t ~* '^coin\*' then
    return 'investment';
  end if;

  -- Payment-processor payouts are WAGES. Uber paying a driver is income,
  -- not a peer sending money.
  if t ~* '\y(uber pro card|payfare|lyft driver|doordash|instacart|grubhub)\y' then
    return null;
  end if;

  -- The user's own money moving between the user's own accounts.
  if t ~* '\yonline banking transfer\y'
     or t ~* '\ykeep ?the ?change\y'
     or t ~* '\y(instant add money|instant transfer to|add funds)\y' then
    return 'transfer';
  end if;

  -- Person-to-person. Card purchases are exempt by construction.
  if not is_card
     and (t ~* '\y(zelle|venmo|cash ?app|apple cash)\y'
          or t ~* '\ypmnt (sent|rcvd)\y') then
    return 'p2p';
  end if;

  -- Venmo CSV rows carry the COUNTERPARTY as the title — a person's name,
  -- with no keyword to match. The import note is the only signal, and only
  -- for income: an expense on that import is the Venmo card at a merchant.
  if p_type = 'income' and n ~* '\yimported from venmo\y' then
    return 'p2p';
  end if;

  -- Cash out of a machine. Requires ATM as a STANDALONE WORD. This is the
  -- rule that produced the original bug: '%atm%' matched TREATMENT, and
  -- would match any merchant containing those three letters.
  if not is_card and t ~* '\yatm\y' then
    return 'cash';
  end if;

  -- A bare WITHDRWL with no ATM token is a merchant sale processed through
  -- a cashless-ATM rail — Peake ReLeaf, Potomac Holistic, Rockville Pike.
  -- Those are purchases and must count as spending.
  return null;
end;
$$;

-- Old signatures must be dropped explicitly. CREATE OR REPLACE with a new
-- parameter list creates an ADDITIONAL overload rather than replacing the
-- existing one, which makes every call ambiguous and silently returns
-- nothing — that already happened once during this work.
drop function if exists classify_exclusion_reason(text, text);
drop function if exists classify_exclusion_reason(text, text, text);

create or replace function classify_transaction_exclusion()
returns trigger as $$
declare reason text;
begin
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
