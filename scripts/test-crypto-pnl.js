// Independent FIFO check against the raw Coinbase exports.
//
// Two jobs:
//
//  1. Compute realized P&L per year straight from the CSVs, so the figures
//     crypto_pnl_by_year() returns can be checked against something that
//     never touched the database.
//
//  2. Measure what intra-day ordering is worth. The transactions table stores
//     `date` only - the time of day is discarded at import - so the SQL walks
//     lots in `order by crypto_asset, date, id`, and `id` is a random uuid.
//     For an account that trades 10-20 times a day, the lots consumed by a
//     given sale are therefore chosen arbitrarily among that day's buys. This
//     script runs the same FIFO twice - once in true timestamp order, once in
//     a shuffled within-day order - and prints the difference. That number is
//     the error bar on every realized-P&L figure the app displays.
//
// Usage: node scripts/test-crypto-pnl.js <dir-with-csvs> [--seed N]

import fs from 'node:fs';
import path from 'node:path';

const DIR = process.argv[2];
if (!DIR) {
  console.error('Usage: node scripts/test-crypto-pnl.js <dir-with-csvs>');
  process.exit(1);
}

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
  const n = Number(String(s).replace(/[$,"\s]/g, ''));
  return Number.isFinite(n) ? n : 0;
};

function readExport(file) {
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  const hi = lines.findIndex(l => l.startsWith('ID,Timestamp,Transaction Type'));
  if (hi === -1) return [];
  const h = parseCsvLine(lines[hi]);
  const ix = (n) => h.indexOf(n);
  const C = {
    id: ix('ID'), ts: ix('Timestamp'), type: ix('Transaction Type'),
    asset: ix('Asset'), qty: ix('Quantity Transacted'),
    price: ix('Price at Transaction'),
    total: ix('Total (inclusive of fees and/or spread)'),
  };
  const rows = [];
  for (let i = hi + 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const f = parseCsvLine(lines[i]);
    if (!f[C.id]) continue;
    const qty = money(f[C.qty]);
    const price = money(f[C.price]);
    const total = money(f[C.total]);
    rows.push({
      id: f[C.id].trim(),
      ts: (f[C.ts] || '').trim(),
      date: (f[C.ts] || '').slice(0, 10),
      asset: (f[C.asset] || '').trim(),
      qty,
      // Mirrors the importer exactly: amount is a magnitude, sign lives in qty.
      amount: Math.abs(total) || Math.abs(qty * price),
    });
  }
  return rows;
}

const files = fs.readdirSync(DIR).filter(f => f.toLowerCase().endsWith('.csv'));
if (!files.length) { console.error(`No CSVs in ${DIR}`); process.exit(1); }

// Dedup by the export's own id - the same rule the importer uses. Never
// title+date+amount: this account trades the same amount many times a day.
const byId = new Map();
for (const f of files) {
  for (const r of readExport(path.join(DIR, f))) {
    if (!byId.has(r.id)) byId.set(r.id, r);
  }
}
const all = [...byId.values()].filter(r => r.asset && r.asset !== 'USD' && r.qty !== 0);

const dates = all.map(r => r.date).filter(Boolean).sort();
console.log(`${all.length} crypto rows from ${files.length} file(s)`);
console.log(`Range: ${dates[0]} to ${dates[dates.length - 1]}`);
console.log('');

// FIFO walk. `order` decides how same-day rows are sequenced.
function fifo(rows, comparator) {
  const byAsset = new Map();
  for (const r of rows) {
    if (!byAsset.has(r.asset)) byAsset.set(r.asset, []);
    byAsset.get(r.asset).push(r);
  }
  const years = new Map();
  const bump = (y, k, v) => {
    if (!years.has(y)) years.set(y, { pnl: 0, uncosted: 0, proceeds: 0, cost: 0, n: 0 });
    years.get(y)[k] += v;
  };

  for (const [, rows_] of byAsset) {
    const seq = [...rows_].sort(comparator);
    const lots = [];   // { qty, unit }
    for (const r of seq) {
      if (r.qty > 0) {
        lots.push({ qty: r.qty, unit: r.amount / r.qty });
      } else {
        const y = r.date.slice(0, 4);
        let need = -r.qty, cost = 0;
        for (const lot of lots) {
          if (need <= 0) break;
          if (lot.qty <= 0) continue;
          const take = Math.min(lot.qty, need);
          cost += take * lot.unit;
          lot.qty -= take;
          need -= take;
        }
        if (need > 0) bump(y, 'uncosted', r.amount * (need / -r.qty));
        bump(y, 'pnl', r.amount - cost);
        bump(y, 'proceeds', r.amount);
        bump(y, 'cost', cost);
        bump(y, 'n', 1);
      }
    }
  }
  return years;
}

const byTime = (a, b) => (a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : a.id < b.id ? -1 : 1);

// What the database actually does today: date only, then a random uuid.
// Modelled with a deterministic hash of the export id so the run is
// repeatable while bearing no relation to trade order - exactly the
// property a random uuid has.
function hash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
const byDateThenArbitrary = (a, b) =>
  (a.date < b.date ? -1 : a.date > b.date ? 1 : hash(a.id) - hash(b.id));

const truth = fifo(all, byTime);
const asStored = fifo(all, byDateThenArbitrary);

const money2 = (n) => (n < 0 ? '-' : '') + '$' + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

console.log('Realized P&L by year, FIFO in true timestamp order');
console.log('(uncosted proceeds listed separately, never folded into profit)');
console.log('');
console.log('  year   disposals        proceeds       cost basis      realized P&L      uncosted');
let tp = 0, tu = 0, tn = 0;
for (const y of [...truth.keys()].sort()) {
  const v = truth.get(y);
  tp += v.pnl; tu += v.uncosted; tn += v.n;
  console.log(
    `  ${y}   ${String(v.n).padStart(9)}   ${money2(v.proceeds).padStart(14)}   ${money2(v.cost).padStart(14)}   ${money2(v.pnl).padStart(15)}   ${money2(v.uncosted).padStart(12)}`
  );
}
console.log(`  ${'TOTAL'.padEnd(6)} ${String(tn).padStart(9)}   ${''.padStart(14)}   ${''.padStart(14)}   ${money2(tp).padStart(15)}   ${money2(tu).padStart(12)}`);

console.log('');
console.log('What intra-day ordering is worth');
console.log('(same data, same FIFO, only the within-day sequence differs)');
console.log('');
let worst = 0, totalTruth = 0, totalStored = 0;
for (const y of [...truth.keys()].sort()) {
  const a = truth.get(y).pnl;
  const b = asStored.get(y)?.pnl ?? 0;
  totalTruth += a; totalStored += b;
  const d = b - a;
  if (Math.abs(d) > Math.abs(worst)) worst = d;
  console.log(`  ${y}   true ${money2(a).padStart(14)}    date-only ${money2(b).padStart(14)}    drift ${money2(d).padStart(13)}`);
}
console.log('');
console.log(`  Total realized, true order:      ${money2(totalTruth)}`);
console.log(`  Total realized, date-only order: ${money2(totalStored)}`);
console.log(`  Difference:                      ${money2(totalStored - totalTruth)}`);
console.log(`  Largest single-year drift:       ${money2(worst)}`);
console.log('');
if (Math.abs(totalStored - totalTruth) < 0.005) {
  console.log('Intra-day ordering does not move the total. Storing date only is safe here.');
} else {
  console.log('Intra-day ordering moves the number. The time of day must be stored and');
  console.log('used as the FIFO sort key, or realized P&L is arbitrary to this degree.');
}
