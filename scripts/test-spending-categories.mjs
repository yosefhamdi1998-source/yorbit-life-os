import assert from 'node:assert/strict';
import { spendingCategories, transactionCategory } from '../src/lib/spendingCategories.js';

const records = [
  { type: 'expense', category: 'housing', amount: 1200 },
  { type: 'expense', category: 'freelance', amount: 75.25 },
  { type: 'expense', category: 'new-category', amount: 18.50 },
  { type: 'expense', category: 'new-category', amount: 6.25 },
  { type: 'expense', category: null, amount: 20 },
  { type: 'expense', category: '', amount: 5 },
  { type: 'income', category: 'salary', amount: 3000 },
  { type: 'transfer', category: 'other', amount: 1000 },
];
const result = spendingCategories(records);
assert.deepEqual(result, [
  { name: 'housing', spent: 1200 },
  { name: 'freelance', spent: 75.25 },
  { name: 'other', spent: 25 },
  { name: 'new-category', spent: 24.75 },
]);
assert.equal(result.reduce((sum, row) => sum + row.spent, 0),
  records.filter(row => row.type === 'expense').reduce((sum, row) => sum + row.amount, 0));
assert.deepEqual(spendingCategories([]), []);
console.log('PASS: all expense categories reconcile, with income/transfers excluded and missing categories retained');

for (const row of result) {
  const opened=records.filter(t=>t.type==='expense' && transactionCategory(t)===row.name);
  assert.equal(opened.reduce((sum,t)=>sum+t.amount,0),row.spent);
}
console.log('PASS: category drill-down totals match chart buckets, including missing categories');
