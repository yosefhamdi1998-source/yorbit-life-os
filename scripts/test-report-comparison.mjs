import assert from 'node:assert/strict';
import { parseISO, format } from 'date-fns';
import { previousComparisonCutoff } from '../src/lib/reportComparison.js';

const cutoff = (start, end, previousStart, previousEnd, today) => previousComparisonCutoff(
  parseISO(start), parseISO(end), { start: parseISO(previousStart), end: parseISO(previousEnd) }, parseISO(today));
assert.equal(format(cutoff('2026-03-01','2026-03-31','2026-02-01','2026-02-28','2026-03-30'), 'yyyy-MM-dd'), '2026-02-28');
assert.equal(format(cutoff('2024-03-01','2024-03-31','2024-02-01','2024-02-29','2024-03-30'), 'yyyy-MM-dd'), '2024-02-29');
assert.equal(format(cutoff('2026-09-01','2026-09-30','2026-08-01','2026-08-31','2026-09-09'), 'yyyy-MM-dd'), '2026-08-09');
assert.equal(format(cutoff('2026-08-01','2026-08-31','2026-07-01','2026-07-31','2026-09-09'), 'yyyy-MM-dd'), '2026-07-31');
assert.equal(format(cutoff('2026-03-01','2026-03-31','2026-02-01','2026-02-28','2026-03-09T00:15:00'), 'yyyy-MM-dd'), '2026-02-09');
const marchCutoff = cutoff('2026-03-01','2026-03-31','2026-02-01','2026-02-28','2026-03-30');
assert.ok(parseISO('2026-02-28') <= marchCutoff);
assert.ok(parseISO('2026-03-01') > marchCutoff, 'current-month records cannot leak into the previous month');
console.log('PASS: previous comparisons stay within month boundaries, including leap years and DST');
