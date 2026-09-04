-- Exclusion classifier tests, run against the LIVE function.
--
-- Every case below is a real descriptor from the account, not an invented
-- one. The audit that produced them found errors in both directions:
-- $1,500 of real spending hidden, and $1,713 of P2P receipts counted as
-- income in a single month, which flipped that month's savings rate from
-- +50.4% to -42.1%.
--
-- Run:  npx supabase db query --linked -f scripts/test-exclusion-rules.sql

with cases(title, txtype, expected, why, note) as (values
  -- Investing. Must survive the card exemption: buying crypto with a Venmo
  -- card is still investing. An earlier version of the rules returned NULL
  -- here and would have moved 148 rows / $6,238 into ordinary spending.
  ('Venmo Card - Coinbase',                      'expense', 'investment', 'crypto bought on a card is still crypto', null),
  ('COIN*Coinbase Inc',                          'expense', 'investment', 'exchange', null),
  ('LITECOIN PURCHASE',                          'expense', 'investment', 'exchange', null),

  -- Card purchases that merely CARRY a P2P brand name. These went to a
  -- merchant, not a person, and were previously hidden.
  ('Venmo Card - APPLE.COM/BILL',                'expense', null,         'Venmo debit card purchase at Apple', null),
  ('Venmo Card - APPLE CASH SENT MONEY',         'expense', null,         'card purchase, not a transfer', null),

  -- Genuine person-to-person, BOTH directions. "pmnt rcvd" was missing
  -- entirely, which is what let receipts count as income.
  ('VENMO*Hamdi Yo PMNT RCVD VENMO*Hamdi Yosef', 'income',  'p2p',        'money received P2P is not income', null),
  ('APPLE CASH INS PMNT RCVD APPLE CASH INST X', 'income',  'p2p',        'Apple Cash rides the same rail', null),
  -- Payment-processor payouts are WAGES, not peers. Classifying these as
  -- p2p removed $1,247.93 of real Uber earnings from income over 9 months.
  ('UBER PRO CARD* PMNT RCVD UBER PRO CARD*Yos',      'income', null, 'Uber paying a driver is income', null),
  ('Original Credit Transaction From (••PayFare)',    'income', null, 'PayFare is the processor Uber pays through', null),

  -- The user topping up their own Venmo balance from their own card. $832.60
  -- of this was counted as INCOME in August alone.
  ('Instant Add money From Visa Debit (••5891)',      'income', 'transfer', 'own card into own Venmo balance', null),
  ('KEEPTHECHANGE CREDIT FROM ACCT8457 EFFECTIVE 08/17','income','transfer','receiving half of the round-up', null),
  ('Venmo',                                      'expense', 'p2p',        'bare Venmo send', null),
  ('Zelle payment to YOSEFH',                    'expense', 'p2p',        'Zelle', null),

  -- Venmo CSV rows carry the COUNTERPARTY as the title - a person's name,
  -- with nothing to keyword-match. The import note is the only signal.
  ('sandra hamdi "Thanks a bunch"', 'income',  'p2p', 'person sending money is not income', 'Imported from Venmo - Personal'),
  ('Ibrahim Haddad "pizza"',        'income',  'p2p', 'person sending money is not income', 'Imported from Venmo - Personal'),
  ('10040 CAVA ROCKVILLE',          'expense', null,  'Venmo CARD used at a restaurant is spending', 'Imported from Venmo - Personal'),

  -- Cash out of a machine requires a STANDALONE atm token.
  ('BKOFAMERICA ATM WITHDRWL RESEARCH BOULEVARD','expense', 'cash',       'real ATM withdrawal', null),
  ('BKOFAMERICA ATM DEPOSIT FLAGSHIP CENTER',    'income',  'cash',       'own cash deposited', null),

  -- Merchants whose card sales are processed through a cash-like rail.
  -- These are purchases and MUST count as spending.
  ('Peake ReLeaf WITHDRWL Peake ReLeaf ROCKVILLE MD',        'expense', null, 'real store', null),
  ('POTOMAC HOLIST WITHDRWL POTOMAC HOLISTIC ROCKVILLE MD',  'expense', null, 'real store', null),
  ('ROCKVILLE PIKE WITHDRWL ROCKVILLE PIKE M ROCKVILLE MD',  'expense', null, 'real store', null),

  -- Rebates and refunds are money coming back, not a withdrawal. These
  -- contain "ATM" and were caught by the old substring rule.
  ('Preferred Rewards-ATM Oper Rebate Refund of $3', 'income', null, 'fee rebate is income', null),
  ('BofA Rewards-ATM Oper Rebate Refund of $3.95',   'income', null, 'fee rebate is income', null),
  ('Venmo Cash Back Reward',                          'income', null, 'reward, not a transfer', null),

  -- Self-transfers between the user's own accounts.
  ('Online Banking transfer to CHK 6882',                'expense', 'transfer', 'own accounts', null),
  ('KEEP THE CHANGE TRANSFER TO ACCT 4910 FOR 08/17/26', 'expense', 'transfer', 'BoA round-up into own savings', null),

  -- Ordinary spending must be untouched. The last one is the substring trap:
  -- "TREATMENT" contains the letters a-t-m.
  ('STARBUCKS STORE 12345',                      'expense', null, 'ordinary purchase', null),
  ('Payroll Deposit - DarCars of Rockville',     'income',  null, 'real income', null),
  ('DENTAL TREATMENT CENTER',                    'expense', null, 'contains "atm" inside a word', null),
  ('APARTMENT RENT',                             'expense', null, 'no standalone atm token', null)
)
select
  case when classify_exclusion_reason(title, txtype, note) is not distinct from expected
       then 'PASS' else 'FAIL' end as result,
  coalesce(expected, '(counted)')                              as expected,
  coalesce(classify_exclusion_reason(title, txtype, note), '(counted)') as actual,
  why,
  left(title, 48) as descriptor
from cases
order by result, why;
