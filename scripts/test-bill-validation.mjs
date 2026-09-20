import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateBillForm } from '../src/lib/billValidation.js';
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
  await save({form:{...valid,name:' Synthetic bill '},validateBillForm,savingRef:lock,setSaving:v=>states.push(v),editingBill,
    base44:{entities:{Bill:{create:async p=>calls.push(p),update:async (id,p)=>calls.push(p)}}},
    setBills:()=>{},toast:()=>{},closeForm:()=>{},loadBills:()=>{}});
  assert.equal(calls[0].amount,12.5); assert.equal(calls[0].name,'Synthetic bill');
  assert.equal(lock.current,false); assert.deepEqual(states,[true,false]);
}
console.log('PASS: bill create/edit reject invalid amounts, names and calendar dates before saving; valid writes normalize values and release locks');
