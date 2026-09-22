// Statement-import dedup: what it must keep doing, and the cap that made it
// silently wrong on a large ledger.
//
// Run: npm run test:import-dedup

import assert from 'node:assert/strict';
import { planImport, snapshotTruncationReason } from '../src/lib/importDedup.js';

const row = (date, title, amount, type = 'expense') => ({ date, title, amount, type });
let checks = 0;
const ok = (label) => { checks++; console.log(`  PASS  ${label}`); };

console.log('The contract that must not regress\n');

// Re-importing the same file adds nothing: the database already holds as many
// of every key as the file has.
{
  const file = [row('2026-01-05', 'Rent', 1200), row('2026-01-06', 'Coffee', 4.5)];
  const { toImport, skipped } = planImport(file, file);
  assert.equal(toImport.length, 0);
  assert.equal(skipped, 2);
  ok('re-importing an identical file imports nothing');
}

// The case existence-based dedup destroyed: twenty identical same-day trades
// are twenty real transactions, not one.
{
  const twenty = Array.from({ length: 20 }, () => row('2026-02-02', 'Coinbase trade', 50));
  const { toImport } = planImport([], twenty);
  assert.equal(toImport.length, 20, 'all twenty identical rows must import the first time');
  ok('twenty identical same-day rows all import into an empty ledger');
}

// ...and re-importing that same file still adds nothing.
{
  const twenty = Array.from({ length: 20 }, () => row('2026-02-02', 'Coinbase trade', 50));
  const { toImport } = planImport(twenty, twenty);
  assert.equal(toImport.length, 0);
  ok('re-importing those twenty adds none');
}

// Overlapping files are reconciled because `collected` accumulates across every
// file in one session: the shared rows count once, the surplus imports.
{
  // Tagged exactly as CSVImport tags them, because the file a row came from is
  // what separates "twenty trades in one statement" from "one charge listed in
  // two overlapping statements".
  const from = (file, rows) => rows.map((r) => ({ ...r, __sourceFile: file }));
  const existing = [row('2026-03-01', 'Salary', 3000, 'income')];
  const fileA = from('jan-feb.csv', [row('2026-03-01', 'Salary', 3000, 'income'), row('2026-03-02', 'Gym', 45)]);
  const fileB = from('feb-mar.csv', [row('2026-03-02', 'Gym', 45), row('2026-03-03', 'Fuel', 60)]);
  const { toImport } = planImport(existing, [...fileA, ...fileB]);
  assert.deepEqual(toImport.map((r) => r.title), ['Gym', 'Fuel'],
    'the salary already exists and the shared Gym row must import exactly once');
  ok('two overlapping files import each shared row exactly once');
}

// A genuine second occurrence is not a duplicate. Two coffees on one day at the
// same price is ordinary, and the file is the authority on how many there were.
{
  const existing = [row('2026-04-01', 'Coffee', 4.5)];
  const file = [row('2026-04-01', 'Coffee', 4.5), row('2026-04-01', 'Coffee', 4.5)];
  const { toImport } = planImport(existing, file);
  assert.equal(toImport.length, 1, 'the surplus occurrence imports; the matched one does not');
  ok('a real repeat beyond what is stored still imports');
}

// The two rules must not cancel each other out. Collapsing overlap across
// files is only safe while genuine repeats INSIDE one file still all import.
{
  const tag = (file) => Array.from({ length: 20 },
    () => ({ ...row('2026-02-02', 'Coinbase trade', 50), __sourceFile: file }));
  const { toImport } = planImport([], [...tag('a.csv'), ...tag('b.csv')]);
  assert.equal(toImport.length, 20,
    'two statements each listing the same twenty trades are twenty trades, not forty');
  ok('overlap collapses across files without flattening repeats within one');
}

console.log('\nThe defect: a truncated snapshot duplicates silently\n');

// Reproduces the old behaviour. The read was `listAll('-date', 50000)` —
// newest first, hard capped — so on a ledger past that size the OLDEST rows
// were missing from the snapshot handed to dedup.
{
  const CAP = 50;                                   // stands in for 50,000
  const oldRow = row('2020-01-01', 'Old rent', 1200);
  const ledger = [
    ...Array.from({ length: CAP }, (_, i) => row(`2026-01-${String((i % 28) + 1).padStart(2, '0')}`, `Recent ${i}`, i + 1)),
    oldRow,                                          // oldest, falls off the end
  ];

  const truncated = ledger.slice(0, CAP);            // what the capped read returned
  const viaTruncated = planImport(truncated, [oldRow]);
  assert.equal(viaTruncated.toImport.length, 1,
    'DEFECT: an already-stored old row is re-imported when the snapshot was capped');
  ok('a capped snapshot re-imports an old row that already exists — the duplicate');

  const complete = ledger;                           // what the unbounded read returns
  const viaComplete = planImport(complete, [oldRow]);
  assert.equal(viaComplete.toImport.length, 0,
    'with the complete ledger the row is correctly recognised as already stored');
  ok('the complete snapshot recognises it and imports nothing');
}

// Nothing in the capped path raised an error — a short read is indistinguishable
// from a small ledger. The fetch is unbounded now, so this guard exists to make
// a reintroduced cap loud instead of silent.
{
  assert.equal(snapshotTruncationReason(new Array(50).fill(0), 50) !== null, true);
  assert.equal(snapshotTruncationReason(new Array(49).fill(0), 50), null);
  assert.equal(snapshotTruncationReason(new Array(99999).fill(0), undefined), null,
    'an unbounded read can never be judged truncated');
  ok('truncation is detectable if a limit is ever reintroduced');
}

console.log(`\nAll ${checks} checks passed.`);
