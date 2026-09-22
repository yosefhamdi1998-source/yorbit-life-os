import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateBillForm } from '../src/lib/billValidation.js';
import { classifyWriteError } from '../src/lib/writeOutcome.js';
const valid = { name: 'Synthetic bill', amount: '12.50', due_date: '2026-09-25' };
const invalid = [
  ...['', ' ', '0', '-1', '12oops', 'Infinity', '1e309', '10000001'].map(amount => ({...valid, amount})),
  {...valid, name: '  '},
  ...['', '2026-02-30', '2026-13-01', '2026-09-25junk'].map(due_date => ({...valid, due_date})),
];
for (const form of invalid) assert.ok(validateBillForm(form));
for (const amount of ['0.01', '12.50', '10000000']) assert.equal(validateBillForm({...valid, amount}), null);
assert.equal(validateBillForm({...valid, due_date:'2024-02-29'}), null);
const source = readFileSync(new URL('../src/pages/Bills.jsx', import.meta.url), 'utf8');
const body = source.match(/const saveBill = async \(\) => \{([\s\S]*?)\n  \};/)[1];
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const save = new AsyncFunction('scope', `with(scope){${body}}`);
for (const form of invalid) {
  const messages = [];
  await save({form, validateBillForm, toast: m => messages.push(m), savingRef: {get current(){throw new Error('Invalid input reached save path');}}});
  assert.equal(messages[0].title, 'Check bill details');
}
for (const editingBill of [null, {id:'synthetic-bill'}]) {
  const calls = [], lock = {current:false}, states = [];
  await save({form:{...valid,name:' Synthetic bill '},validateBillForm,classifyWriteError,bills:[],savingRef:lock,setSaving:v=>states.push(v),editingBill,
    base44:{entities:{Bill:{create:async p=>calls.push(p),update:async (id,p)=>calls.push(p)}}},
    setBills:()=>{},toast:()=>{},closeForm:()=>{},loadBills:()=>{}});
  assert.equal(calls[0].amount,12.5); assert.equal(calls[0].name,'Synthetic bill');
  assert.equal(lock.current,false); assert.deepEqual(states,[true,false]);
}
// A failed edit must fall back to the last CONFIRMED bills without needing the
// network. Recovery used to be loadBills() alone, so when the write and the
// reload both failed the unsaved figure stayed on screen: a persisted 150
// edited to 175 kept reading 175, totals included. loadBills is modelled as a
// no-op because that is exactly what a failed reload does from saveBill's point
// of view — it handles its own error internally and never calls setBills, so it
// cannot rescue the display.
for (const [label, thrown, expectedTitle] of [
  ['lost connection', new Error('Failed to fetch'), "Couldn't confirm the save"],
  ['server rejection', new Error('new row violates check constraint "bills_amount_check"'), "Bill wasn't saved"],
]) {
  const confirmed = [{ id: 'synthetic-bill', name: 'Synthetic bill', amount: 150 }];
  const setCalls = [], messages = [];
  let closed = false;
  await save({
    form: { ...valid, amount: '175' }, validateBillForm, classifyWriteError,
    bills: confirmed, savingRef: { current: false }, setSaving: () => {},
    editingBill: { id: 'synthetic-bill' },
    base44: { entities: { Bill: { update: async () => { throw thrown; }, create: async () => {} } } },
    setBills: v => setCalls.push(v), toast: m => messages.push(m),
    closeForm: () => { closed = true; }, loadBills: () => {},
  });
  assert.equal(setCalls.at(-1), confirmed, `${label}: display must return to the confirmed bills`);
  assert.equal(messages.at(-1).title, expectedTitle, `${label}: wording must match what is actually known`);
  assert.equal(closed, false, `${label}: the entered form stays open for correction`);
}

console.log('PASS: bill create/edit reject invalid amounts, names and calendar dates before saving; valid writes normalize values and release locks');
console.log('PASS: a failed edit restores the last confirmed bills without the network, keeps the form, and only claims "not saved" when the server actually refused');
