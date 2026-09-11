import assert from 'node:assert/strict';
import { validateGoalAmounts as validate } from '../src/lib/goalValidation.js';
const form={target_amount:'1000',current_amount:'0'};
for(const target_amount of ['', ' ', '0', '-1', '20oops', 'Infinity', '1e309', undefined]) assert.ok(validate({...form,target_amount}));
for(const current_amount of ['-1','20oops','NaN','Infinity','1e309',undefined]) assert.ok(validate({...form,current_amount}));
for(const current_amount of ['','0','100.50','1500']) assert.equal(validate({...form,current_amount}),null);
console.log('PASS: goal amounts reject non-finite/partial/negative values; zero savings and exceeded goals remain valid');
