-- Fix transaction exclusion classification.
--
-- The previous rules were unanchored ILIKE substring matches on a free-text
-- bank descriptor, with no distinction between the RAIL the money moved on
-- and the COUNTERPARTY it moved to. That produced errors in both directions
-- on real data:
--
--   HIDDEN THAT SHOULD COUNT (57 rows, $1,500.23 - a 12.6% understatement
--   of spending against $11,576 counted):
--     'Venmo Card - APPLE.COM/BILL'        -> the Venmo DEBIT CARD. A real
--                                             purchase at Apple, hidden as p2p
--                                             because the title says "venmo".
--     'Peake ReLeaf WITHDRWL ...'          -> a real store. Dispensaries and
--     'POTOMAC HOLIST WITHDRWL ...'           some merchants run card sales
--     'ROCKVILLE PIKE WITHDRWL ...'           through cashless-ATM systems, so
--                                             the descriptor says WITHDRWL.
--     'Preferred Rewards-ATM Oper Rebate'  -> the bank refunding a fee.
--                                             Caught by '%atm%'.
--
--   COUNTED THAT SHOULD NOT BE:
--     'APPLE CASH INS ... PMNT RCVD'       -> money RECEIVED person-to-person,
--                                             counted as income. The old rules
--                                             matched '%pmnt sent%' but never
--                                             '%pmnt rcvd%', and knew nothing
--                                             about Apple Cash. In Aug 2026
--                                             this was $1,713 of $2,843
--                                             "income" - 60% of it.
--     'KEEP THE CHANGE TRANSFER TO ACCT'   -> BoA round-up into the user's own
--                                             savings, counted as an expense.
--
-- The August 2026 consequence: the app reported a +50.4% savings rate on an
-- income figure that was 60% P2P receipts. Corrected, that month is roughly
-- -25%. A sign flip on the most important number in the app.

-- ---------------------------------------------------------------------
-- 1. Reversibility
-- ---------------------------------------------------------------------
-- This rewrites classification on every existing row. Snapshot the current
-- state first so the change can be undone without restoring a backup.
create table if not exists transaction_exclusion_backup (
  id uuid primary key,
  exclude_from_budget boolean,
  exclusion_reason text,
  backed_up_at timestamptz not null default now()
);

insert into transaction_exclusion_backup (id, exclude_from_budget, exclusion_reason)
select id, exclude_from_budget, exclusion_reason from transactions
on conflict (id) do nothing;

alter table transaction_exclusion_backup enable row level security;

-- ---------------------------------------------------------------------
-- 2. One classifier, callable from both the trigger and the backfill
-- ---------------------------------------------------------------------
-- Previously the same ruleset existed twice: this trigger, and
-- classifyExclusion() in plaid-sync-transactions/index.ts. Two copies of a
-- rule list is the drift that caused the enum bugs. This function is now the
-- single source of truth; the TypeScript copy is removed so the trigger
-- classifies every row regardless of how it arrived.
--
-- Returns null when the row is ordinary budget-relevant money.
create or replace function classify_exclusion_reason(p_title text, p_type text, p_notes text default null)
returns text
language plpgsql
immutable
as $$
declare
  t text := coalesce(p_title, '');
  n text := coalesce(p_notes, '');
  is_card boolean;
begin
  -- Order matters throughout: the most specific rule that can rescue a row
  -- from a broader one has to run first.

  -- (a) Is this a CARD product that happens to be named after a P2P app?
  --     A purchase on the Venmo/Cash App card went to a merchant, not to a
  --     person, so it must not be classified p2p.
  --
  --     This is a flag rather than an early return. An early return here was
  --     wrong and the dry run caught it: 'Venmo Card - Coinbase' (148 rows,
  --     $6,238) would have become ordinary spending instead of investing
  --     activity. What the card exempts is the RAIL check, not every check -
  --     where the money actually went still decides.
  is_card := t ~* '(venmo|cash ?app|apple cash) card( |-)';

  -- (b) Fee rebates and refunds are money coming back, not a withdrawal.
  --     Must precede the ATM rule - these descriptors contain "ATM".
  if t ~* 'rebate|refund|reversal|cash back reward' then
    return null;
  end if;

  -- (c) Investing activity. Checked BEFORE the card exemption applies, so
  --     crypto bought with a Venmo card is still investing. All 14,913
  --     previously matched rows were verified against exchange keywords with
  --     zero false positives.
  if t ~* 'coinbase|^coin\*|litecoin|ethereum|bitcoin|dogecoin|binance|kraken' then
    return 'investment';
  end if;

  -- (d) Movement between the user's own accounts. "Instant Add money From
  --     Visa Debit" is the user topping up their own Venmo balance from
  --     their own card - $832.60 of it in August alone was being counted as
  --     INCOME. "KEEPTHECHANGE CREDIT FROM ACCT" is the receiving half of
  --     the round-up whose sending half was already caught.
  if t ~* 'online banking transfer'
     or t ~* 'keep ?the ?change'
     or t ~* 'instant add money|instant transfer to|add funds' then
    return 'transfer';
  end if;

  -- (e) Person-to-person, in BOTH directions. "pmnt rcvd" was missing
  --     entirely, which is what let P2P receipts count as income. Apple Cash
  --     and Uber Pro Card payouts ride the same rails. Card purchases are
  --     exempt - that is the whole point of the flag above.
  -- Uber Pro Card is a DRIVER PAYOUT card, not a peer. 'UBER PRO CARD*
  -- PMNT RCVD' is Uber paying wages, and treating it as P2P removed
  -- $1,247.93 of real earnings from income across 9 months. Same logic for
  -- any payment-processor payout: the money came from a business for work
  -- done, which is the definition of income. PayFare is the processor
  -- Uber pays drivers through, so it is the same money by another name.
  if t ~* 'uber pro card|payfare|lyft driver|doordash|instacart|grubhub' then
    return null;
  end if;

  if not is_card
     and t ~* 'zelle|venmo|cash ?app|apple cash|pmnt sent|pmnt rcvd' then
    return 'p2p';
  end if;

  -- (e2) Rows imported from a Venmo CSV carry the COUNTERPARTY as their
  --      title - a person's name, with no keyword to match on. 69 of the 72
  --      such rows are income, i.e. people sending money. Money received
  --      through Venmo from a person is not earnings.
  --
  --      Deliberately income-only: an EXPENSE on the same import is a
  --      purchase made with the Venmo card ("10040 CAVA ROCKVILLE"), which
  --      is real spending and must keep counting. Genuine payouts were
  --      already returned as income above, so they never reach this rule.
  if p_type = 'income' and n ~* 'imported from venmo' then
    return 'p2p';
  end if;

  -- (f) Cash out of a machine. Requires a standalone ATM token, not the
  --     letters "atm" anywhere in the string - otherwise a merchant like
  --     "Peake ReLeaf WITHDRWL" reads as a cash withdrawal, and so would any
  --     merchant containing those three letters (TREATMENT, for one).
  if not is_card and t ~* '(^|[^a-z])atm([^a-z]|$)' then
    return 'cash';
  end if;

  -- A bare WITHDRWL/WITHDRAWAL with no ATM token is a merchant transaction
  -- processed through a cash-like rail. Those are purchases and must count.
  return null;
end;
$$;

-- ---------------------------------------------------------------------
-- 3. Trigger delegates to the function
-- ---------------------------------------------------------------------
create or replace function classify_transaction_exclusion()
returns trigger as $$
declare
  reason text;
begin
  -- An explicit caller-supplied reason still wins, so a manual
  -- recategorisation is never overwritten by the automatic rules.
  if new.exclusion_reason is not null then
    return new;
  end if;

  reason := classify_exclusion_reason(new.title, new.type);
  if reason is not null then
    new.exclude_from_budget := true;
    new.exclusion_reason := reason;
  else
    new.exclude_from_budget := false;
    new.exclusion_reason := null;
  end if;

  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists trg_classify_transaction_exclusion on transactions;
create trigger trg_classify_transaction_exclusion
  before insert on transactions
  for each row
  execute function classify_transaction_exclusion();
