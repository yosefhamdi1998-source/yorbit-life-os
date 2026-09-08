import assert from 'node:assert/strict';
import { parseCSV, statementRowKey } from '../src/lib/csv.js';

const parsed = parseCSV('\uFEFFDate,Description,Amount\r\n2026-09-01,"Cafe, \"\"Lunch\"\"",-12.75\r\n2026-09-02,"Invoice\nsecond line",900\r\n');
assert.equal(parsed.rows.length, 2);
assert.equal(parsed.rows[0].Description, 'Cafe, "Lunch"');
assert.equal(parsed.rows[1].Description, 'Invoice\nsecond line');
const venmo = parseCSV('Account Statement\n\n,ID,Datetime,Amount (total)\n,123,2026-09-01,-20');
assert.deepEqual(venmo.headers, ['ID', 'Datetime', 'Amount (total)']);
assert.equal(venmo.rows[0].ID, '123');
assert.equal(venmo.rows[0]['Amount (total)'], '-20');
assert.throws(() => parseCSV('Date,Description,Amount\n2026-09-01,"unfinished,10'), /unfinished/);
assert.throws(() => parseCSV('Date,Amount,Amount\n2026-09-01,10,20'), /duplicate/);
const row = { date: '2026-09-01', title: 'Payment', amount: 20, type: 'income' };
assert.notEqual(statementRowKey(row), statementRowKey({ ...row, type: 'expense' }));
assert.equal(statementRowKey(row), statementRowKey({ ...row, amount: '20.00' }));
console.log('CSV quoted fields, Venmo alignment, malformed input, and income/expense identity checks passed.');
