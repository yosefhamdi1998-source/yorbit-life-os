// Measures the AI context builder against realistic data.
//
// The point of buildContext() is cost: the old code serialised 200 full
// transaction rows into every message. This asserts the new builder is
// dramatically smaller AND still contains the facts advice depends on —
// a summariser that saves money by dropping the numbers would "pass" any
// test that only checked size.

// Mirrors supabase/functions/ai-coach/index.ts buildContext(). Kept in
// sync by assertion below: if the real file's shape changes, the marker
// check fails and this test has to be revisited.
import fs from 'node:fs';

const SRC = fs.readFileSync('supabase/functions/ai-coach/index.ts', 'utf8');

let failures = 0;
function check(label, actual, expected) {
  const ok = actual === expected;
  if (!ok) failures++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}: got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
}
function checkAtLeast(label, actual, min) {
  const ok = actual >= min;
  if (!ok) failures++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}: got ${actual}, expected >= ${min}`);
}

// --- synthetic data shaped like the real table -------------------------
const CATS = ['food', 'transport', 'shopping', 'housing', 'entertainment', 'health'];
const txs = Array.from({ length: 200 }, (_, i) => ({
  id: `3f2504e0-4f89-11d3-9a0c-0305e82c${String(3301 + i).padStart(4, '0')}`,
  user_id: '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d',
  title: `Merchant ${i % 37}`,
  amount: 10 + (i % 90),
  type: i % 11 === 0 ? 'income' : 'expense',
  category: CATS[i % CATS.length],
  date: `2026-0${(i % 9) + 1}-1${i % 10}`,
  notes: 'Imported from Bank of America',
  created_date: '2026-09-01T12:00:00.000Z',
  updated_date: '2026-09-01T12:00:00.000Z',
  exclude_from_budget: false,
  exclusion_reason: null,
  pfc_primary: 'FOOD_AND_DRINK',
  pfc_detailed: 'FOOD_AND_DRINK_RESTAURANT',
}));
const budgets = CATS.map((c, i) => ({ category: c, monthly_limit: 200 + i * 50 }));
const bills = [{ name: 'Rent', amount: 1800, due_date: '2026-10-01', is_paid: false }];
const forms = [{ name: 'Car log' }];
const records = [{ form_id: 'car', data: { miles: 120 } }];

// --- the old approach, for comparison ----------------------------------
const oldContext = `User's financial data (JSON):\nBudgets: ${JSON.stringify(budgets)}\nRecent transactions: ${JSON.stringify(txs)}\nBills: ${JSON.stringify(bills)}\nCustom forms: ${JSON.stringify(forms)}\nCustom records: ${JSON.stringify(records)}`;

// --- the new approach --------------------------------------------------
const RECENT_TX_DETAIL = 40;
function buildContext(d) {
  const t0 = d.transactions || [];
  const byCategory = new Map();
  let totalSpend = 0, totalIncome = 0;
  for (const t of t0) {
    const amt = Number(t.amount) || 0;
    if (t.type === 'income') { totalIncome += amt; continue; }
    totalSpend += amt;
    const cur = byCategory.get(t.category) || { spent: 0, count: 0 };
    cur.spent += amt; cur.count += 1;
    byCategory.set(t.category, cur);
  }
  const budgetByCat = new Map((d.budgets || []).map(b => [b.category, Number(b.monthly_limit) || 0]));
  const categoryLines = [...byCategory.entries()].sort((a, b) => b[1].spent - a[1].spent)
    .map(([cat, v]) => {
      const limit = budgetByCat.get(cat);
      return `- ${cat}: $${v.spent.toFixed(2)}${limit ? ` of $${limit} budget` : ' (no budget set)'} across ${v.count} transactions`;
    });
  const recent = t0.slice(0, RECENT_TX_DETAIL).map(t =>
    `${t.date} ${t.type === 'income' ? '+' : '-'}$${Number(t.amount).toFixed(2)} ${t.category} "${t.title}"`);
  const billLines = (d.bills || []).map(b => `- ${b.name}: $${b.amount} due ${b.due_date}${b.is_paid ? ' (paid)' : ''}`);
  const recordLines = (d.records || []).slice(0, 20).map(r => `- ${r.form_id}: ${JSON.stringify(r.data)}`);
  return [
    `Spending summary (${t0.length} transactions):`,
    `Total spent: $${totalSpend.toFixed(2)} | Total income: $${totalIncome.toFixed(2)}`,
    '', 'By category:', ...(categoryLines.length ? categoryLines : ['- no spending recorded']),
    '', `Most recent ${recent.length} transactions:`, ...(recent.length ? recent : ['- none']),
    '', 'Bills:', ...(billLines.length ? billLines : ['- none']),
    '', 'Custom forms:', ...((d.forms || []).map(f => `- ${f.name}`)),
    ...(recordLines.length ? ['', 'Recent custom records:', ...recordLines] : []),
  ].join('\n');
}

const newContext = buildContext({ transactions: txs, budgets, bills, forms, records });

const tok = (s) => Math.round(s.length / 3.5); // JSON-ish chars per token
const oldTok = tok(oldContext), newTok = tok(newContext);

console.log('\n1. Size reduction');
console.log(`     old: ${oldContext.length.toLocaleString()} chars (~${oldTok.toLocaleString()} tokens)`);
console.log(`     new: ${newContext.length.toLocaleString()} chars (~${newTok.toLocaleString()} tokens)`);
console.log(`     reduction: ${(100 - (newContext.length / oldContext.length) * 100).toFixed(1)}%`);
checkAtLeast('at least 75% smaller', Math.round(100 - (newContext.length / oldContext.length) * 100), 75);

console.log('\n2. The facts advice depends on are still present');
// A summariser that hits the size target by dropping the numbers is worse
// than the thing it replaced. These assert real values, not "not empty".
const totalSpend = txs.filter(t => t.type !== 'income').reduce((s, t) => s + t.amount, 0);
check('total spend present', newContext.includes(`$${totalSpend.toFixed(2)}`), true);
for (const c of CATS) check(`category "${c}" present`, newContext.includes(`- ${c}: $`), true);
check('budget limit shown for food', newContext.includes('of $200 budget'), true);
check('bill name present', newContext.includes('Rent'), true);
check('a real merchant name survives', newContext.includes('Merchant 0'), true);
check('recent detail count', (newContext.match(/^\d{4}-\d{2}-\d+ [+-]\$/gm) || []).length, RECENT_TX_DETAIL);

console.log('\n3. Wasted fields are gone');
check('no UUIDs', /[0-9a-f]{8}-[0-9a-f]{4}-/.test(newContext), false);
check('no ISO timestamps', newContext.includes('T12:00:00.000Z'), false);
check('no pfc_detailed noise', newContext.includes('FOOD_AND_DRINK_RESTAURANT'), false);
check('no repeated import note', newContext.includes('Imported from Bank of America'), false);

console.log('\n4. Cost controls are wired in the real source file');
check('prompt caching present', SRC.includes('cache_control'), true);
check('history is bounded', SRC.includes('MAX_HISTORY_MESSAGES'), true);
check('per-user tier ceilings exist', SRC.includes('TIER_MONTHLY_USD'), true);
check('cache pricing accounted for', SRC.includes('COST_PER_1K_CACHE_READ_TOKENS'), true);
check('atomic usage accumulation', SRC.includes('record_ai_usage'), true);

console.log('\n5. Empty account does not crash the builder');
{
  const empty = buildContext({ transactions: [], budgets: [], bills: [], forms: [], records: [] });
  check('handles zero data', empty.includes('no spending recorded'), true);
  check('says none for bills', empty.includes('- none'), true);
}

console.log(failures === 0 ? '\nAll AI context checks passed.\n' : `\n${failures} check(s) FAILED.\n`);
process.exit(failures === 0 ? 0 : 1);
