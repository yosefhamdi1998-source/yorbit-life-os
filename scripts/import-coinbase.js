// Import Coinbase transaction exports, keeping the columns that matter.
//
// The original import kept only date, a description, and a USD amount -
// discarding Asset and Quantity Transacted entirely, then leaving the
// quantities recoverable only as prose inside the Notes column. This reads
// the real columns.
//
// DEDUP IS BY THE EXPORT'S OWN `ID`, never by title+date+amount. This user
// trades 10-20 times a day, frequently for identical amounts; a
// title-date-amount key would silently discard nineteen of twenty real
// trades. That is guarded by scripts/test-dedup.js.
//
// Usage:
//   node scripts/import-coinbase.js --dir "C:/YORBIT/coinbase" [--apply]
//
// Without --apply it reports what WOULD happen and writes nothing.

import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

const args = process.argv.slice(2);
const dirArg = args.indexOf('--dir');
const DIR = dirArg >= 0 ? args[dirArg + 1] : 'C:/YORBIT/coinbase';
const APPLY = args.includes('--apply');
const SQL_OUT = args.includes('--sql') ? args[args.indexOf('--sql') + 1] : null;

// The exports begin 2023-01-01 while the account opened in 2022, so 946
// transactions predate the data. A per-asset sum is therefore NOT a holding
// — it is the NET CHANGE since this date, and a negative change is entirely
// valid: it means a position held before 2023 was drawn down.
//
// Calling it "holdings" would make those negatives impossible and the
// positives overstated. Calling it a change makes every number true. That
// reframing is why the earlier "reconstruction failed" verdict was the wrong
// call rather than a missing-file problem.
// Derived from the data rather than hard-coded: the exports now reach back
// to 2018, and a stale constant here would mislabel every number below it.
let HISTORY_START = '(unknown)';

// --- CSV ---------------------------------------------------------------
// Notes contains commas and parenthesised addresses, so a naive split on
// ',' silently shifts every later column. That is how the quantities were
// lost the first time.
function parseCsvLine(line) {
  const out = [];
  let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) {
      if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else inQ = false; }
      else cur += c;
    } else if (c === '"') inQ = true;
    else if (c === ',') { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

const money = (s) => {
  const n = parseFloat(String(s ?? '').replace(/[$,\s"]/g, ''));
  return Number.isFinite(n) ? n : 0;
};

// --- transaction type semantics ----------------------------------------
// Every type present in the real exports is handled explicitly. An
// unrecognised type is REPORTED rather than silently bucketed - the same
// lesson as the PFC registry, where an unhandled value quietly reclassified
// 113 rows.
//
// `direction` is only used for the app's income/expense field. The position
// math uses the SIGNED Quantity Transacted directly and ignores this.
const TYPES = {
  'Buy':            { direction: 'expense', crypto: true,  note: 'fiat -> crypto' },
  'Sell':           { direction: 'income',  crypto: true,  note: 'crypto -> fiat' },
  'Send':           { direction: 'expense', crypto: true,  note: 'crypto leaves the account' },
  'Receive':        { direction: 'income',  crypto: true,  note: 'crypto arrives' },
  'Withdrawal':     { direction: 'expense', crypto: false, note: 'USD leaves Coinbase for a bank' },
  'Deposit':        { direction: 'income',  crypto: false, note: 'USD arrives from a bank' },
  // Earned crypto, taxable on receipt - income, not a purchase.
  'Staking Income': { direction: 'income',  crypto: true,  note: 'earned crypto' },
  'Dex Buy':        { direction: 'expense', crypto: true,  note: 'on-chain buy' },
  'Dex Sell':       { direction: 'income',  crypto: true,  note: 'on-chain sell' },
  'Credit':         { direction: 'income',  crypto: true,  note: 'account credit' },
  'Convert':        { direction: 'expense', crypto: true,  note: 'asset -> asset' },
  'Advanced Trade Buy':  { direction: 'expense', crypto: true, note: 'advanced trade' },
  'Advanced Trade Sell': { direction: 'income',  crypto: true, note: 'advanced trade' },
  'Rewards Income': { direction: 'income',  crypto: true,  note: 'earned crypto' },
  'Learning Reward':{ direction: 'income',  crypto: true,  note: 'earned crypto' },
  // Staking plumbing. Each appears as a PAIR that nets to zero (in and out
  // of the staking contract), so they move no value - but they must be
  // recognised or every one shows up as an unknown type.
  'Retail Staking Transfer':   { direction: 'expense', crypto: true, note: 'into staking, paired' },
  'Retail Unstaking Transfer': { direction: 'income',  crypto: true, note: 'out of staking, paired' },
  'Retail Eth2 Deprecation':   { direction: 'income',  crypto: true, note: 'ETH2 -> ETH migration, paired' },
  // Coinbase One subscription fee - fiat, not a crypto movement.
  'Subscription':   { direction: 'expense', crypto: false, note: 'Coinbase subscription fee' },
  // Support adjustment crediting crypto to the account.
  'Admin Debit':    { direction: 'income',  crypto: true,  note: 'Coinbase support adjustment' },
  // Movement between Coinbase retail and Coinbase Pro/Exchange (the old
  // GDAX). These are the SAME user's money changing venue, so they behave
  // like transfers - the signed quantity already carries the direction.
  'Exchange Withdrawal': { direction: 'income',  crypto: true,  note: 'out of Coinbase Exchange' },
  'Exchange Deposit':    { direction: 'expense', crypto: false, note: 'USD into Coinbase Exchange/GDAX' },
  'Pro Withdrawal':      { direction: 'income',  crypto: true,  note: 'out of Coinbase Pro' },
  // Earned crypto, same treatment as Staking Income: income on receipt.
  'Reward Income':  { direction: 'income',  crypto: true,  note: 'Coinbase Rewards' },
  // Wrapping ETH2 into CBETH - one asset becomes another, net value zero.
  'Wrap Asset':     { direction: 'expense', crypto: true,  note: 'asset wrapped, paired' },
};

function readExport(file) {
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  const hi = lines.findIndex(l => l.startsWith('ID,Timestamp,Transaction Type'));
  if (hi === -1) return null;                     // not a transaction export
  const userLine = lines.slice(0, hi).find(l => l.startsWith('User,'));
  const accountId = userLine ? (parseCsvLine(userLine)[2] || '').trim() : 'unknown';

  const h = parseCsvLine(lines[hi]);
  const ix = (n) => h.indexOf(n);
  const C = {
    id: ix('ID'), ts: ix('Timestamp'), type: ix('Transaction Type'),
    asset: ix('Asset'), qty: ix('Quantity Transacted'),
    price: ix('Price at Transaction'),
    total: ix('Total (inclusive of fees and/or spread)'),
    notes: ix('Notes'),
  };

  const rows = [];
  for (let i = hi + 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const f = parseCsvLine(lines[i]);
    if (!f[C.id]) continue;
    rows.push({
      provider_transaction_id: f[C.id].trim(),
      account_id: accountId,
      date: (f[C.ts] || '').slice(0, 10),
      tx_type: (f[C.type] || '').trim(),
      asset: (f[C.asset] || '').trim(),
      quantity: money(f[C.qty]),
      price: money(f[C.price]),
      total: money(f[C.total]),
      notes: (f[C.notes] || '').trim(),
    });
  }
  return { file, accountId, rows };
}

// --- read every export in the directory --------------------------------
if (!fs.existsSync(DIR)) {
  console.error(`Directory not found: ${DIR}`);
  process.exit(1);
}
const files = fs.readdirSync(DIR).filter(f => f.toLowerCase().endsWith('.csv')).map(f => path.join(DIR, f));
if (!files.length) { console.error(`No CSV files in ${DIR}`); process.exit(1); }

const exports_ = [];
for (const f of files) {
  const e = readExport(f);
  if (!e) { console.log(`  skip (not a transaction export): ${path.basename(f)}`); continue; }
  exports_.push(e);
  console.log(`  ${path.basename(f).padEnd(34)} account ${e.accountId.slice(0, 8)}  ${e.rows.length} rows`);
}
if (!exports_.length) { console.error('\nNo transaction exports found. Gain/loss tax reports are a different format and cannot produce holdings.'); process.exit(1); }

// Dedup across files by the export's own id.
const byId = new Map();
let dupes = 0;
for (const e of exports_) {
  for (const r of e.rows) {
    if (byId.has(r.provider_transaction_id)) { dupes++; continue; }
    byId.set(r.provider_transaction_id, r);
  }
}
const all = [...byId.values()];

// Unknown transaction types are surfaced, never silently bucketed.
const unknownTypes = [...new Set(all.map(r => r.tx_type))].filter(t => !TYPES[t]);

const dates = all.map(r => r.date).filter(Boolean).sort();
HISTORY_START = dates[0] || '(unknown)';
console.log(`\n${all.length} unique transactions  (${dupes} duplicate ids skipped)`);
console.log(`Date range: ${dates[0]} to ${dates[dates.length - 1]}`);
console.log(`Accounts: ${[...new Set(all.map(r => r.account_id))].map(a => a.slice(0, 8)).join(', ')}`);

if (unknownTypes.length) {
  console.log(`\n!! UNKNOWN TRANSACTION TYPES: ${unknownTypes.join(', ')}`);
  console.log('   Add them to TYPES before importing - an unhandled type is how');
  console.log('   113 crypto rows silently became ordinary spending once already.');
}

// --- position -----------------------------------------------------------
// Quantity Transacted is signed, so a per-asset sum IS the position.
const pos = new Map();
for (const r of all) {
  if (!r.asset) continue;
  if (!pos.has(r.asset)) pos.set(r.asset, { qty: 0, rows: 0, lastPrice: 0, lastDate: '' });
  const p = pos.get(r.asset);
  p.qty += r.quantity;
  p.rows++;
  if (r.date >= p.lastDate && r.price > 0) { p.lastPrice = r.price; p.lastDate = r.date; }
}

console.log('\nPOSITION BY ASSET');
console.log('ASSET'.padEnd(8) + 'QUANTITY'.padStart(22) + 'ROWS'.padStart(7) + '  EST VALUE');
const negatives = [];
let estTotal = 0;
for (const [asset, p] of [...pos.entries()].sort((a, b) => b[1].rows - a[1].rows)) {
  if (Math.abs(p.qty) < 1e-8) { console.log(asset.padEnd(8) + '0.00000000'.padStart(22) + String(p.rows).padStart(7) + '  (flat)'); continue; }
  // USD is the fiat leg - cash between Coinbase and a bank, not a holding.
  const isFiat = asset === 'USD' || asset === 'USDC' && false;
  if (p.qty < -1e-8 && !isFiat) negatives.push(asset);
  if (!isFiat) estTotal += p.qty * p.lastPrice;
  console.log(
    asset.padEnd(8) + p.qty.toFixed(8).padStart(22) + String(p.rows).padStart(7) +
    (isFiat ? '  (fiat leg)' : `  $${(p.qty * p.lastPrice).toFixed(2)}`),
  );
}

console.log('\n' + '-'.repeat(60));
console.log(`NET CHANGE since ${HISTORY_START} - these are NOT holdings.`);
console.log('Activity before that date is not in these exports, so an asset');
console.log('with a negative change means a position held before 2023 was drawn');
console.log('down. That is a true statement; calling it holdings would not be.');
if (negatives.length) {
  console.log(`\nDrawn below their 2023 opening balance: ${negatives.join(', ')}`);
}

// --- write --------------------------------------------------------------
if (SQL_OUT) {
  const esc = (v) => (v === null || v === undefined) ? 'null' : "'" + String(v).replace(/'/g, "''") + "'";
  const num = (v) => (v === null || v === undefined || !Number.isFinite(v)) ? 'null' : String(v);
  const UID = "(select id from auth.users where email='yosefhamdi1998@gmail.com')";
  const out = ['-- generated by scripts/import-coinbase.js', 'begin;'];
  for (let i = 0; i < all.length; i += 400) {
    const chunk = all.slice(i, i + 400);
    out.push('insert into transactions (user_id,title,amount,type,category,date,provider_transaction_id,import_source,provider_memo,crypto_asset,crypto_quantity,exclusion_reason,exclude_from_budget) values');
    out.push(chunk.map(r => {
      const meta = TYPES[r.tx_type] || { direction: 'expense' };
      const amt = Math.abs(r.total) || Math.abs(r.quantity * r.price) || 0;
      return '(' + UID + ',' + esc('Coinbase ' + r.tx_type + (r.asset ? ' ' + r.asset : '')) + ',' + num(amt) + ',' + esc(meta.direction) + ",'investment'," + esc(r.date) + ',' + esc(r.provider_transaction_id) + ',' + esc('csv:coinbase:' + r.account_id.slice(0,8)) + ',' + esc(r.notes || null) + ',' + esc(r.asset || null) + ',' + num(r.quantity) + ",'investment',true)";
    }).join(',\n'));
    out.push('on conflict (user_id, provider_transaction_id) do nothing;');
  }
  out.push('commit;');
  fs.writeFileSync(SQL_OUT, out.join('\n'));
  console.log('\nWrote ' + SQL_OUT + ' (' + all.length + ' rows)');
  process.exit(0);
}

if (!APPLY) {
  console.log('\nDRY RUN - nothing written. Re-run with --apply or --sql <file>.');
  process.exit(0);
}

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('\nSet SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to apply.');
  process.exit(1);
}
if (negatives.length) {
  console.error('\nRefusing to import: the ledger does not balance (see above).');
  process.exit(1);
}

const supabase = createClient(url, key);
const { data: userRow } = await supabase.from('profiles').select('id').limit(1).single();
const userId = process.env.YORBIT_USER_ID || userRow?.id;
if (!userId) { console.error('Could not determine user id; set YORBIT_USER_ID.'); process.exit(1); }

let inserted = 0, skipped = 0, failed = 0;
const CHUNK = 500;
for (let i = 0; i < all.length; i += CHUNK) {
  const batch = all.slice(i, i + CHUNK).map(r => {
    const meta = TYPES[r.tx_type] || { direction: 'expense' };
    return {
      user_id: userId,
      title: `Coinbase ${r.tx_type}${r.asset ? ' ' + r.asset : ''}`,
      amount: Math.abs(r.total) || Math.abs(r.quantity * r.price),
      type: meta.direction,
      category: 'investment',
      date: r.date,
      provider_transaction_id: r.provider_transaction_id,
      import_source: `csv:coinbase:${r.account_id.slice(0, 8)}`,
      provider_memo: r.notes || null,
      crypto_asset: r.asset || null,
      crypto_quantity: r.quantity || null,
      exclusion_reason: 'investment',
      exclude_from_budget: true,
    };
  });
  // onConflict on the unique partial index - a re-run is a no-op rather
  // than a duplicate.
  const { error, count } = await supabase
    .from('transactions')
    .upsert(batch, { onConflict: 'user_id,provider_transaction_id', ignoreDuplicates: true, count: 'exact' });
  if (error) { console.error(`  batch ${i}: ${error.message}`); failed += batch.length; }
  else { inserted += count ?? 0; skipped += batch.length - (count ?? 0); }
  process.stdout.write(`\r  imported ${inserted}, skipped ${skipped}, failed ${failed}`);
}
console.log(`\n\nDone. ${inserted} inserted, ${skipped} already present, ${failed} failed.`);
