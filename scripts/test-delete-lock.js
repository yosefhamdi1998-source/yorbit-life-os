// Proves the delete re-entry lock actually collapses a double-tap.
//
// This imports the REAL src/lib/reentryLock.js rather than re-implementing
// it. The earlier Venmo test re-stated the mapping logic inside the test
// file, so it kept passing while the shipped code was inverted — a test
// that can't fail when the source is wrong is worse than no test, because
// it buys false confidence. Every assertion below is an exact expected
// value, never "not empty" or "didn't throw".

import { createReentryLock } from '../src/lib/reentryLock.js';

let failures = 0;
function check(label, actual, expected) {
  const ok = actual === expected;
  if (!ok) failures++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}: got ${actual}, expected ${expected}`);
}

// A delete that takes a moment, like a real network round trip.
function makeDeleter() {
  const state = { calls: 0 };
  const fn = async () => {
    state.calls++;
    await new Promise(r => setTimeout(r, 30));
    return 'deleted';
  };
  return { state, fn };
}

console.log('\n1. CONTROL - unguarded handler, three rapid taps on the same row');
{
  const { state, fn } = makeDeleter();
  await Promise.all([fn(), fn(), fn()]);
  // This is the bug being fixed: without a lock every tap reaches the network.
  check('delete calls', state.calls, 3);
}

console.log('\n2. GUARDED - three rapid taps on the same row');
{
  const lock = createReentryLock();
  const { state, fn } = makeDeleter();
  await Promise.all([
    lock.run('row-1', fn),
    lock.run('row-1', fn),
    lock.run('row-1', fn),
  ]);
  check('delete calls', state.calls, 1);
  check('lock released afterwards', lock.size, 0);
}

console.log('\n3. GUARDED - two DIFFERENT rows must both delete');
{
  const lock = createReentryLock();
  const a = makeDeleter();
  const b = makeDeleter();
  await Promise.all([
    lock.run('row-a', a.fn),
    lock.run('row-b', b.fn),
  ]);
  // A single global boolean lock would wrongly swallow the second row.
  check('row-a calls', a.state.calls, 1);
  check('row-b calls', b.state.calls, 1);
}

console.log('\n4. Return value reaches the first caller; duplicates get undefined');
{
  const lock = createReentryLock();
  const { fn } = makeDeleter();
  const [first, second] = await Promise.all([
    lock.run('row-1', fn),
    lock.run('row-1', fn),
  ]);
  check('first caller result', first, 'deleted');
  check('duplicate caller result', second, undefined);
}

console.log('\n5. A FAILED delete must release the lock, not wedge the row');
{
  const lock = createReentryLock();
  let attempts = 0;
  const boom = async () => { attempts++; throw new Error('network down'); };

  let threw = false;
  try { await lock.run('row-1', boom); } catch { threw = true; }
  check('error propagated to caller', threw, true);
  check('lock released after throw', lock.isBusy('row-1'), false);

  // The user must be able to retry after a failure.
  try { await lock.run('row-1', boom); } catch { /* expected */ }
  check('retry was allowed through', attempts, 2);
}

console.log('\n6. Sequential taps (after completion) are NOT blocked');
{
  const lock = createReentryLock();
  const { state, fn } = makeDeleter();
  await lock.run('row-1', fn);
  await lock.run('row-1', fn);
  check('delete calls', state.calls, 2);
}

console.log(failures === 0
  ? '\nAll delete-lock checks passed.\n'
  : `\n${failures} check(s) FAILED.\n`);
process.exit(failures === 0 ? 0 : 1);
