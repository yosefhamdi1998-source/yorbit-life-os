import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateBudgetAmount } from '../src/lib/budgetValidation.js';
for (const value of ['', ' ', '0', '-5', '5oops', 'Infinity', '1e309', '10000001', undefined]) assert.ok(validateBudgetAmount(value));
for (const value of ['0.01', '500', '10000000']) assert.equal(validateBudgetAmount(value), null);
const source = readFileSync(new URL('../src/pages/Budget.jsx', import.meta.url), 'utf8');
const handler = source.slice(source.indexOf('  const save = async () => {') + '  const save = async () => {'.length, source.indexOf('  const deleteBudget'));
const body = handler.slice(0, handler.lastIndexOf('};'));
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
for (const monthly_limit of ['Infinity', '5oops', '10000001', '-1']) {
  const messages = [];
  let reachedSave = false;
  const save = new AsyncFunction('form', 'validateBudgetAmount', 'toast', 'savingRef', body);
  await save({ monthly_limit }, validateBudgetAmount, value => messages.push(value), { get current() { reachedSave = true; return true; } });
  assert.equal(reachedSave, false, 'Invalid amounts must stop before entering the saving/database path');
  assert.equal(messages[0].title, 'Check budget amount');
}
console.log('PASS: budget amount bounds and actual page handler reject invalid input before database writes');
