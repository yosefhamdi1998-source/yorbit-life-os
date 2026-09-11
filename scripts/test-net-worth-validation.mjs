import assert from 'node:assert/strict';
import { validateNetWorthEntry as validate } from '../src/lib/netWorthValidation.js';
const entry = { name: 'Savings', value: '125.50', type: 'asset' };
for (const name of ['', '   ', '\t', null, undefined]) assert.ok(validate({...entry, name}));
for (const value of ['', ' ', '0', '-1', '12oops', 'Infinity', '1e309', 'NaN', undefined]) assert.ok(validate({...entry, value}), String(value));
for (const type of ['asset','liability']) assert.equal(validate({...entry,type}),null);
assert.equal(validate({...entry,name:' Savings ',value:' 125.50 '}),null);
assert.ok(validate({...entry,type:'unknown'}));
console.log('PASS: net worth rejects blank names and invalid/nonpositive amounts; accepts assets and liabilities');
