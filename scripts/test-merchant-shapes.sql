-- REGRESSION GUARD: an exclusion rule must never fire on a merchant.
--
-- The original bug was structural, not a typo. '%atm%' matched TREATMENT.
-- '%venmo%' matched the Venmo debit card. Any unanchored substring rule
-- will eventually do this again, so this file exists to fail loudly the
-- next time one is added.
--
-- Two halves:
--   A. Merchants that must NEVER be excluded, including ones deliberately
--      built to contain the dangerous substrings.
--   B. A live sweep of the real table: anything classified cash/p2p that
--      looks like a store rather than a rail.
--
-- Run: npx supabase db query --linked -f scripts/test-merchant-shapes.sql

with merchants(title, why) as (values
  -- Contain "atm" inside a word. '%atm%' excluded all of these.
  ('DENTAL TREATMENT CENTER ROCKVILLE MD',        'treATMent'),
  ('APARTMENT RENT PAYMENT',                      'aparTMent... no standalone atm'),
  ('BATMAN COMICS LLC',                           'bATMan'),
  ('CHATHAM SQUARE MARKET',                       'chATHam'),
  ('POSTMATES DELIVERY',                          'posTMates'),

  -- Card products carrying a P2P brand. These are SPENDING.
  ('Venmo Card - APPLE.COM/BILL',                 'debit card at Apple'),
  ('Venmo Card - CHIPOTLE 1234',                  'debit card at a restaurant'),
  ('Cash App Card - SHELL OIL',                   'debit card at a gas station'),

  -- Merchants whose sales run through a cashless-ATM rail. Real purchases.
  ('Peake ReLeaf WITHDRWL Peake ReLeaf ROCKVILLE MD',       'dispensary'),
  ('POTOMAC HOLIST WITHDRWL POTOMAC HOLISTIC ROCKVILLE MD', 'wellness store'),
  ('ROCKVILLE PIKE WITHDRWL ROCKVILLE PIKE M ROCKVILLE MD', 'retailer'),

  -- Money coming back is not money going out.
  ('Preferred Rewards-ATM Oper Rebate Refund of $3', 'fee rebate'),

  -- Payment-processor payouts are wages.
  ('UBER PRO CARD* PMNT RCVD UBER PRO CARD*Yosef',  'Uber paying a driver'),
  ('Original Credit Transaction From (PayFare)',    'Uber processor'),

  -- Ordinary retail that must be untouched.
  ('STARBUCKS STORE 12345 ROCKVILLE MD',          'coffee'),
  ('ALDI 72043 GERMANTOWN MD',                    'groceries'),
  ('SHELL OIL 57444444444',                       'fuel'),
  ('TARGET T-2775 ROCKVILLE MD',                  'retail')
)
select 'A. merchant wrongly excluded' as check,
       coalesce(classify_exclusion_reason(title, 'expense'), 'ok') as verdict,
       why, left(title, 52) as descriptor
from merchants
where classify_exclusion_reason(title, 'expense') is not null

union all

-- B. Live sweep. A row classified 'cash' whose descriptor has no standalone
--    ATM token is a merchant sale misfiled as a withdrawal — the exact
--    original bug, detected against real data rather than fixtures.
select 'B. live: cash without ATM token',
       'cash',
       'no standalone ATM token in descriptor',
       left(title, 52)
from transactions
where exclusion_reason = 'cash' and title !~* '\yatm\y'

union all

-- A row classified 'p2p' that is plainly a card purchase.
select 'B. live: card purchase filed as p2p',
       'p2p',
       'descriptor contains a card product',
       left(title, 52)
from transactions
where exclusion_reason = 'p2p' and title ~* '\y(venmo|cash ?app|apple cash)\s*card\y'

union all

-- A row classified 'p2p' that is a payment-processor payout, i.e. wages.
select 'B. live: payout filed as p2p',
       'p2p',
       'payment processor payout is income',
       left(title, 52)
from transactions
where exclusion_reason = 'p2p'
  and title ~* '\y(uber pro card|payfare|lyft driver|doordash|instacart|grubhub)\y'

order by 1, 4;
