import assert from 'node:assert/strict';
import { build } from 'esbuild';

// Execute the actual detector, including its date-fns calendar arithmetic.
const { outputFiles } = await build({
  entryPoints: ['src/lib/detectRecurring.js'], bundle: true, write: false,
  platform: 'node', format: 'esm', alias: { '@': './src' },
});
const { detectRecurring } = await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`);
const originalTZ = process.env.TZ;
try {
  for (const zone of ['UTC', 'America/New_York', 'Europe/Berlin', 'Asia/Tokyo', 'Pacific/Auckland']) {
    process.env.TZ = zone;
    for (const [dates, expected] of [
      [['2025-11-30', '2025-12-31', '2026-01-31'], '2026-02-28'],
      [['2023-11-30', '2023-12-31', '2024-01-31'], '2024-02-29'],
      [['2026-01-15', '2026-02-15', '2026-03-15'], '2026-04-15'],
      [['2026-10-15', '2026-11-15', '2026-12-15'], '2027-01-15'],
    ]) {
      const rows = dates.map(date => ({date, type: 'expense', title: 'Example Streaming', amount: 12, category: 'entertainment'}));
      const results = detectRecurring(rows);
      assert.equal(results.length, 1);
      assert.equal(results[0].nextDate, expected, `${zone}: next bill after ${dates.at(-1)}`);
      assert.equal(results[0].category, 'subscription');
    }
  }
} finally {
  if (originalTZ === undefined) delete process.env.TZ;
  else process.env.TZ = originalTZ;
}
console.log('PASS: recurring bill calendar dates across five time zones, month ends, leap years and year rollover');
