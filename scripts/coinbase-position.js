// Compute crypto positions from Coinbase transaction-history exports.
//
// The export carries exactly what memo-parsing could never recover:
//   ID                   stable transaction id (dedup key)
//   Asset                real column, not parsed from prose
//   Quantity Transacted  SIGNED - negative for Sell/Send/Withdrawal
//   Price at Transaction USD price at the time
//
// Because quantity is signed, a per-asset sum IS the position, provided the
// export covers all activity. That is the assumption this script tests
// rather than assumes: any negative balance proves the ledger is
// incomplete, and a negative holding must never be shown as a number.
//
// Usage: node scripts/coinbase-position.js <file.csv> [more.csv ...]

import fs from 'node:fs';

// Minimal RFC4180 parser. The Notes column contains commas and parenthesised
// addresses, so splitting on ',' loses columns silently - which is how the
// original import kept only the prose and dropped the quantities.
function parseCsvLine(line) {
  const out = [];
  let cur = '', inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; } else inQuotes = false;
      } else cur += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

const money = (s) => {
  if (s == null) return 0;
  const cleaned = String(s).replace(/[$,\s"]/g, '');
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : 0;
};

const files = process.argv.slice(2);
if (!files.length) {
  console.error('Usage: node scripts/coinbase-position.js <file.csv> [...]');
  process.exit(1);
}

const positions = new Map();   // asset -> { qty, buys, sells, rows, types }
const seenIds = new Set();
let totalRows = 0, dupRows = 0, skipped = 0;
const typeCounts = new Map();
let minDate = null, maxDate = null;

for (const file of files) {
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  // The header sits below a short preamble (blank line, "Transactions",
  // "User,<name>,<account id>"), so it is located rather than assumed.
  const headerIdx = lines.findIndex(l => l.startsWith('ID,Timestamp,Transaction Type'));
  if (headerIdx === -1) { console.error(`  ! no transaction header in ${file}`); continue; }

  const header = parseCsvLine(lines[headerIdx]);
  const col = (name) => header.indexOf(name);
  const cID = col('ID'), cTs = col('Timestamp'), cType = col('Transaction Type');
  const cAsset = col('Asset'), cQty = col('Quantity Transacted');
  const cPrice = col('Price at Transaction'), cTotal = col('Total (inclusive of fees and/or spread)');

  let fileRows = 0;
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const raw = lines[i];
    if (!raw.trim()) continue;
    const f = parseCsvLine(raw);
    if (f.length < 5 || !f[cID]) { skipped++; continue; }

    // Same transaction can appear in overlapping exports from one account.
    // Two DIFFERENT accounts have different ids, so this never merges them.
    if (seenIds.has(f[cID])) { dupRows++; continue; }
    seenIds.add(f[cID]);

    const asset = (f[cAsset] || '').trim();
    const qty = money(f[cQty]);
    const type = (f[cType] || '').trim();
    const ts = (f[cTs] || '').slice(0, 10);
    if (ts) {
      if (!minDate || ts < minDate) minDate = ts;
      if (!maxDate || ts > maxDate) maxDate = ts;
    }

    typeCounts.set(type, (typeCounts.get(type) || 0) + 1);
    if (!asset) { skipped++; continue; }

    if (!positions.has(asset)) {
      positions.set(asset, { qty: 0, usdIn: 0, usdOut: 0, rows: 0, lastPrice: 0 });
    }
    const p = positions.get(asset);
    p.qty += qty;
    p.rows++;
    const price = money(f[cPrice]);
    if (price > 0) p.lastPrice = price;
    const total = money(f[cTotal]);
    if (total > 0) p.usdIn += total; else p.usdOut += Math.abs(total);

    fileRows++; totalRows++;
  }
  console.log(`  ${file.split(/[\\/]/).pop().slice(0, 46)}  ${fileRows} rows`);
}

console.log(`\nParsed ${totalRows} unique transactions across ${files.length} file(s)`);
console.log(`Duplicate ids skipped: ${dupRows}   Unusable rows: ${skipped}`);
console.log(`Date range: ${minDate} to ${maxDate}`);

console.log('\nTRANSACTION TYPES');
[...typeCounts.entries()].sort((a, b) => b[1] - a[1])
  .forEach(([t, n]) => console.log(`  ${String(n).padStart(5)}  ${t}`));

const rows = [...positions.entries()]
  .map(([asset, p]) => ({ asset, ...p }))
  .sort((a, b) => Math.abs(b.qty * b.lastPrice) - Math.abs(a.qty * a.lastPrice));

console.log('\nPOSITION BY ASSET  (sum of signed Quantity Transacted)');
console.log('ASSET'.padEnd(8) + 'QUANTITY'.padStart(22) + 'LAST PRICE'.padStart(14) + 'EST VALUE'.padStart(15) + '  ROWS');
let estTotal = 0, negatives = [];
for (const r of rows) {
  // Dust: rounding noise below any meaningful threshold is not a position.
  if (Math.abs(r.qty) < 1e-8) continue;
  const val = r.qty * r.lastPrice;
  // Only crypto contributes to a portfolio estimate. Adding the USD cash
  // leg produced a headline of -$9,022 for a portfolio that is actually
  // empty - the fiat balance is a bank movement, not a holding.
  if (r.asset !== 'USD') estTotal += val;
  // USD is the FIAT leg - cash moving between Coinbase and a bank. A
  // negative USD balance means money was withdrawn, which is normal and is
  // not a broken crypto ledger. Flagging it as one was wrong.
  if (r.qty < -1e-8 && r.asset !== 'USD') negatives.push(r.asset);
  console.log(
    r.asset.padEnd(8) +
    r.qty.toFixed(8).padStart(22) +
    ('$' + r.lastPrice.toFixed(4)).padStart(14) +
    ('$' + val.toFixed(2)).padStart(15) +
    '  ' + r.rows,
  );
}

console.log('\n' + '-'.repeat(62));
if (negatives.length) {
  console.log(`INCOMPLETE LEDGER: negative balance in ${negatives.join(', ')}.`);
  console.log('A negative holding is impossible, so the export is missing');
  console.log('activity. Do NOT present these quantities as holdings.');
} else {
  console.log(`All balances non-negative. Estimated value: $${estTotal.toFixed(2)}`);
  console.log('Price is "Price at Transaction" from the most recent row for');
  console.log('each asset, NOT a live market price - it is as stale as that');
  console.log('transaction. Treat as an estimate, not a portfolio value.');
}
