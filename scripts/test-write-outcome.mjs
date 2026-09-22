// classifyWriteError decides what the UI is allowed to CLAIM after a failed
// write, so getting it wrong produces a confident lie in either direction.
//
// WHAT THIS PROVES AND WHAT IT DOES NOT
//
// It proves the classifier's contract: server refusals are recognised as
// 'rejected', transport failures and anything unrecognised fall to 'unknown'.
// That is the whole of its job.
//
// It does NOT prove the Bills screen recovers correctly — that lives in
// saveBill's catch block and is verified in the browser against the fixture
// harness by forcing Bill.update and Bill.list to reject together. Do not cite
// this file as proof of that behaviour.
//
// Run: npm run test:write-outcome

import { classifyWriteError } from '../src/lib/writeOutcome.js';

let failures = 0;
const check = (label, got, expected) => {
  const ok = got === expected;
  if (!ok) failures++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}: got ${got}, expected ${expected}`);
};

console.log('A refused statement is provably not stored\n');

for (const [label, message] of [
  ['check constraint', 'new row violates check constraint "bills_amount_check"'],
  ['not-null', 'null value in column "name" violates not-null constraint'],
  ['duplicate key', 'duplicate key value violates unique constraint'],
  ['RLS policy', 'new row violates row-level security policy for table "bills"'],
  ['permission', 'permission denied for table bills'],
  ['invalid input', 'invalid input syntax for type numeric: "abc"'],
  ['PostgREST code', 'PGRST204: column does not exist'],
]) {
  check(label, classifyWriteError(new Error(message)), 'rejected');
}

console.log('\nA lost connection proves only that we did not hear back\n');

for (const [label, message] of [
  ['Chrome', 'Failed to fetch'],
  ['Firefox', 'NetworkError when attempting to fetch resource.'],
  ['Safari', 'Load failed'],
  ['undici', 'fetch failed'],
  ['timeout', 'The operation timed out'],
  ['abort', 'The user aborted a request.'],
  ['socket', 'socket hang up'],
]) {
  check(label, classifyWriteError(new Error(message)), 'unknown');
}

console.log('\nUnrecognised failures default to unknown, never to "not saved"\n');

// The dangerous default is the other one. Assuming an unfamiliar error proves
// nothing was written is how a UI tells someone their change was discarded
// when it was actually applied.
check('empty message', classifyWriteError(new Error('')), 'unknown');
check('null', classifyWriteError(null), 'unknown');
check('undefined', classifyWriteError(undefined), 'unknown');
check('bare string', classifyWriteError('something odd happened'), 'unknown');
check('non-error object', classifyWriteError({ status: 500 }), 'unknown');
check('unfamiliar server text', classifyWriteError(new Error('upstream unavailable')), 'unknown');

// A message carrying both signals must not be read as proof of rejection:
// "failed to fetch" after a policy check could be either, and 'unknown' is the
// claim we can defend.
check('network hint wins over rejection hint',
  classifyWriteError(new Error('Failed to fetch while evaluating policy')), 'unknown');

console.log(failures ? `\n${failures} check(s) failed.` : '\nAll checks passed.');
process.exit(failures ? 1 : 0);
