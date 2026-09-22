// Statement-import dedup: what it must keep doing, and the cap that made it
// silently wrong on a large ledger.
//
// Run: npm run test:import-dedup

import assert from 'node:assert/strict';
import { planImport, snapshotTruncationReason, crossFileRepeats } from '../src/lib/importDedup.js';

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

// ACROSS FILES the planner does not guess, and this is the case that decides it.
//
// A Jan-Feb export and a Feb-Mar export of ONE account share February, and those
// rows are the same transactions twice. But two DIFFERENT accounts routinely
// produce identical rows - the same Netflix charge, same day, same amount, on a
// Chase card and an Amex card - and those are two real charges. Nothing in a CSV
// says which account it came from, so collapsing on a guess silently deletes
// real money from the ledger. An earlier version of this planner did exactly
// that; this test is why it was reverted.
{
  const from = (file, rows) => rows.map((r) => ({ ...r, __sourceFile: file }));
  const { toImport } = planImport([], [
    ...from('chase.csv', [row('2026-09-01', 'Netflix', 15.99)]),
    ...from('amex.csv', [row('2026-09-01', 'Netflix', 15.99)]),
  ]);
  assert.equal(toImport.length, 2,
    'two accounts charged the same amount on the same day is two transactions, not one');
  ok('identical rows from two different accounts both import');
}

// The ambiguity is surfaced rather than guessed, so the owner decides before
// anything is written.
{
  const from = (file, rows) => rows.map((r) => ({ ...r, __sourceFile: file }));
  const flagged = crossFileRepeats([
    ...from('a.csv', [row('2026-09-01', 'Netflix', 15.99), row('2026-09-02', 'Rent', 800)]),
    ...from('b.csv', [row('2026-09-01', 'Netflix', 15.99)]),
  ]);
  assert.equal(flagged.length, 1, 'only the row present in both files is flagged');
  assert.deepEqual(flagged[0].files.sort(), ['a.csv', 'b.csv']);
  ok('a row appearing in two files is flagged for review, not silently merged');
}

// A row in only one file is never flagged, however often it repeats there.
{
  const twenty = Array.from({ length: 20 },
    () => ({ ...row('2026-02-02', 'Coinbase trade', 50), __sourceFile: 'only.csv' }));
  assert.equal(crossFileRepeats(twenty).length, 0);
  assert.equal(planImport([], twenty).toImport.length, 20);
  ok('twenty repeats inside one file are neither flagged nor collapsed');
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

// Two statements each listing the same twenty trades: forty rows import and the
// key is flagged. That reads like over-importing, and for a re-export of one
// account it is — but the alternative is deleting twenty real trades when those
// files are two different accounts, and nothing here can tell which. The owner
// is shown the conflict and decides; the ledger does not decide for them.
{
  const tag = (file) => Array.from({ length: 20 },
    () => ({ ...row('2026-02-02', 'Coinbase trade', 50), __sourceFile: file }));
  const rows = [...tag('a.csv'), ...tag('b.csv')];
  assert.equal(planImport([], rows).toImport.length, 40,
    'every occurrence the files report is honoured rather than guessed away');
  assert.equal(crossFileRepeats(rows).length, 1,
    'and the conflict is raised for review before anything is written');
  ok('cross-file repeats are imported in full and flagged, never silently dropped');
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
