// Net worth composition tests.
//
// Imports the real src/lib/netWorth.js. Every case here is a way the
// headline number could be quietly wrong, which is the failure mode that
// matters most on this screen — a wrong net worth is worse than none.

import {
  summarizeCash, summarizeManual, composeNetWorth,
  isStale, freshnessLabel, daysSince,
} from '../src/lib/netWorth.js';

let failures = 0;
function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}: got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
}

const ago = d => new Date(Date.now() - d * 86400000).toISOString();

console.log('\n1. Cash sums only live, connected accounts');
{
  const s = summarizeCash([
    { account_name: 'Checking', account_type: 'depository', sync_status: 'connected', current_balance: 1200.50, balance_updated_at: ago(0) },
    { account_name: 'Savings',  account_type: 'depository', sync_status: 'connected', current_balance: 3000,    balance_updated_at: ago(2) },
    // Disconnected accounts must not contribute - the balance is whatever
    // it was when the connection broke, which could be months stale.
    { account_name: 'Old',      account_type: 'depository', sync_status: 'disconnected', current_balance: 99999, balance_updated_at: ago(400) },
  ]);
  check('cash', s.cash, 4200.5);
  check('live accounts', s.liveCount, 2);
  check('unknown', s.unknownCount, 0);
}

console.log('\n2. A null balance is UNKNOWN, never zero');
{
  // Counting an uncaptured balance as $0 understates cash and reads to the
  // user as money having disappeared.
  const s = summarizeCash([
    { account_name: 'Checking', account_type: 'depository', sync_status: 'connected', current_balance: 500, balance_updated_at: ago(1) },
    { account_name: 'Venmo',    account_type: 'depository', sync_status: 'connected', current_balance: null },
  ]);
  check('cash excludes unknown', s.cash, 500);
  check('unknown counted', s.unknownCount, 1);
  check('unknown named', s.unknownNames, ['Venmo']);
}

console.log('\n3. Credit balances are DEBT, not cash');
{
  // Plaid reports a credit card's current_balance as a positive number
  // meaning money owed. Adding it to cash inflates net worth by exactly
  // the size of the debt.
  const s = summarizeCash([
    { account_name: 'Checking', account_type: 'depository', sync_status: 'connected', current_balance: 2000, balance_updated_at: ago(0) },
    { account_name: 'Visa',     account_type: 'credit',     sync_status: 'connected', current_balance: 750,  balance_updated_at: ago(0) },
  ]);
  check('cash', s.cash, 2000);
  check('debt', s.debt, 750);
  check('net', s.net, 1250);
}

console.log('\n4. Label is honest about what the number is');
{
  const accounts = [
    { account_name: 'Checking', account_type: 'depository', sync_status: 'connected', current_balance: 1000, balance_updated_at: ago(0) },
    { account_name: 'Savings',  account_type: 'depository', sync_status: 'connected', current_balance: 500,  balance_updated_at: ago(0) },
  ];
  // Bank accounts alone are not a net worth, and must not claim to be.
  const bankOnly = composeNetWorth(accounts, []);
  check('bank only label', bankOnly.label, 'Cash on Hand');
  check('bank only sublabel', bankOnly.sublabel, 'from 2 connected accounts');
  check('bank only total', bankOnly.total, 1500);
  check('not complete', bankOnly.isCompleteNetWorth, false);

  const withManual = composeNetWorth(accounts, [
    { name: 'Car', type: 'asset', value: 8000, value_updated_at: ago(5) },
    { name: 'Loan', type: 'liability', value: 3000, value_updated_at: ago(5) },
  ]);
  check('with manual label', withManual.label, 'Net Worth');
  check('with manual total', withManual.total, 6500);
  check('is complete', withManual.isCompleteNetWorth, true);
}

console.log('\n5. Staleness is detected and named');
{
  check('91 days is stale', isStale(ago(91)), true);
  check('89 days is not', isStale(ago(89)), false);
  check('missing date is not stale', isStale(null), false);
  const m = summarizeManual([
    { name: 'Car',   type: 'asset', value: 8000, value_updated_at: ago(200) },
    { name: 'Cash',  type: 'asset', value: 100,  value_updated_at: ago(3) },
  ]);
  check('stale count', m.staleCount, 1);
  check('stale named', m.staleNames, ['Car']);
  check('assets still summed', m.assets, 8100);
}

console.log('\n6. Freshness reads like a person wrote it');
{
  check('today', freshnessLabel(ago(0)), 'today');
  check('yesterday', freshnessLabel(ago(1)), 'yesterday');
  check('9 days', freshnessLabel(ago(9)), '9 days ago');
  check('one month', freshnessLabel(ago(35)), 'a month ago');
  check('months', freshnessLabel(ago(200)), '6 months ago');
  check('never', freshnessLabel(null), 'never updated');
  check('daysSince null', daysSince(undefined), null);
}

console.log('\n7. Empty everything does not crash or lie');
{
  const e = composeNetWorth([], []);
  check('total', e.total, 0);
  check('label', e.label, 'Cash on Hand');
  check('sublabel', e.sublabel, 'from 0 connected accounts');
}

console.log(failures === 0 ? '\nAll net worth checks passed.\n' : `\n${failures} check(s) FAILED.\n`);
process.exit(failures === 0 ? 0 : 1);
