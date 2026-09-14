import assert from 'node:assert/strict';
import { format } from 'date-fns';
import { readReportSelection, reportSelectionSearch } from '../src/lib/reportSelection.js';
for (const period of ['monthly', 'biweekly', 'yearly']) {
  const search = reportSelectionSearch('?start=2026-08-01&end=2026-08-31&year=2024&type=expense', period, new Date(2026, 6, 13));
  const params = new URLSearchParams(search);
  assert.equal(params.has('start'), false);
  assert.equal(params.has('end'), false);
  assert.equal(params.has('year'), false);
  assert.equal(params.get('type'), 'expense');
  const restored = readReportSelection(search);
  assert.equal(restored.period, period);
  assert.equal(format(restored.cursor, 'yyyy-MM-dd'), '2026-07-13');
}
for (const search of ['?period=monthly&cursor=2026-02-30', '?period=yearly&year=2026oops', '?period=unknown&cursor=2026-01-01', '?period=yearly&year=Infinity']) assert.equal(readReportSelection(search), null);
assert.equal(format(readReportSelection('?period=yearly&year=2025').cursor, 'yyyy-MM-dd'), '2025-01-01');
console.log('PASS: report selection round-trips, clears superseded exact ranges, preserves unrelated filters, and rejects invalid dates');
