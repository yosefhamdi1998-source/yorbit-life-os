// beginBankSync's atomic claim: simultaneous requests, an abandoned/stuck
// 'syncing' row, and retry behaviour - unit-tested directly against the
// real, compiled _shared/bankSync.ts, not a hand-written restatement of it.
//
// WHAT THIS PROVES AND WHAT IT DOES NOT
//
// It proves the CLAIM PREDICATE is correct: given that only one caller's
// UPDATE can be evaluated against a row's current value at a time - which is
// a Postgres guarantee for a single UPDATE statement, not something this
// file re-tests - the predicate admits exactly one winner when two callers
// race, refuses a plain retry against a genuinely fresh 'syncing' row, and
// recovers a row abandoned by a worker that crashed before clearing it.
//
// It does NOT exercise real Postgres, real HTTP concurrency, or a real
// crashed Edge Function. "Simultaneous" here means two calls issued in the
// same tick via Promise.allSettled against one shared in-memory row, with a
// fake admin whose match-then-mutate step is synchronous (no internal
// await) - which is what makes it behave like one atomic UPDATE rather than
// a read-then-write race. See test-bank-sync.mjs for the full HTTP-handler
// path (auth, Plaid, transaction writes) that this file deliberately does
// not repeat, and test-sync-dispatcher.mjs for the batch caller.
//
// Run: npm run test:bank-sync-concurrency

import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { transformSync } from 'esbuild';

const compile = (path) => transformSync(
  fs.readFileSync(path, 'utf8').replace(/^import .*;\r?\n/gm, '').replace(/^export /gm, ''),
  { loader: 'ts' },
).code;

const sandbox = {};
vm.runInNewContext(compile('supabase/functions/_shared/bankSync.ts'), sandbox);
const { beginBankSync, completeBankSync, failBankSync } = sandbox;
// SyncInProgressError is a class declaration; those do not attach to a vm
// sandbox's global object the way function/var declarations do (verified
// directly - only the three functions above showed up). Its own
// constructor sets `.name`, which is what production code's `instanceof`
// check and this fixture's `.name` check both key off in practice.
const isSyncInProgress = (err) => err?.name === 'SyncInProgressError';

const FRESH = new Date().toISOString();
const ABANDONED = new Date(Date.now() - 20 * 60 * 1000).toISOString(); // 20 min ago
const JUST_INSIDE_WINDOW = new Date(Date.now() - 14 * 60 * 1000).toISOString(); // 14 min ago

// One synthetic row, playing the part of connected_accounts. Real fields
// only; nothing here is a real bank connection or a real user.
function makeAdmin(row, logs = []) {
  return {
    from(table) {
      // failBankSync also writes an observability row to bank_sync_logs -
      // not the row under test, so it only needs to be accepted, not
      // modelled with the same filter machinery as connected_accounts.
      if (table === 'bank_sync_logs') {
        return { insert: async (entry) => { logs.push(entry); return { error: null }; } };
      }
      assert.equal(table, 'connected_accounts', 'unexpected table for this fixture');
      let op = 'read', patch, filters = [];
      const matchesTerm = (term) => {
        const [col, opName, ...rest] = term.split('.');
        const val = rest.join('.');
        if (opName === 'neq') return row[col] !== val;
        if (opName === 'lt') return new Date(row[col]).getTime() < new Date(val).getTime();
        throw new Error(`Unsupported synthetic or() operator: ${opName}`);
      };
      const matches = () => filters.every(([tag, a, b]) => {
        if (tag === 'eq') return row[a] === b;
        if (tag === 'neq') return row[a] !== b;
        if (tag === 'or') return a.split(',').some(matchesTerm);
        throw new Error(`Unsupported synthetic filter tag: ${tag}`);
      });
      const q = {
        select() { return q; },
        eq(k, v) { filters.push(['eq', k, v]); return q; },
        neq(k, v) { filters.push(['neq', k, v]); return q; },
        or(filterString) { filters.push(['or', filterString]); return q; },
        update(value) { op = 'update'; patch = value; return q; },
        // The ONE step this fixture models as truly atomic: check the
        // filters against the row's CURRENT value and, if they match, apply
        // the patch - all synchronous, no await in between. That is what
        // makes calling beginBankSync twice via Promise.allSettled behave
        // like a real single-row UPDATE rather than a read-then-write race
        // this fake could otherwise introduce by accident.
        async maybeSingle() {
          if (op === 'read') return { data: { ...row }, error: null };
          if (!matches()) return { data: null, error: null };
          Object.assign(row, patch, { updated_date: new Date().toISOString() });
          return { data: { id: row.id }, error: null };
        },
      };
      return q;
    },
  };
}

let checks = 0;
const ok = (label) => { checks++; console.log(`  PASS  ${label}`); };

console.log('Two simultaneous claims on the same row\n');

{
  const row = { id: 'fixture-account', user_id: 'fixture-owner', sync_status: 'connected', updated_date: FRESH };
  const admin = makeAdmin(row);
  // Both snapshots taken before either caller starts - the realistic case:
  // two callers who both read 'connected' moments ago (a manual click and
  // the scheduled sync; two browser tabs; two overlapping cron runs), THEN
  // both attempt to begin.
  const snapshotA = { ...row };
  const snapshotB = { ...row };
  const [a, b] = await Promise.allSettled([
    beginBankSync(admin, snapshotA),
    beginBankSync(admin, snapshotB),
  ]);
  const winner = a.status === 'fulfilled' ? a : b;
  const loser = a.status === 'fulfilled' ? b : a;
  assert.equal(winner.status, 'fulfilled', 'exactly one caller must win the claim');
  assert.equal(loser.status, 'rejected', 'the other must be refused, not silently proceed alongside it');
  assert.ok(isSyncInProgress(loser.reason), 'refused specifically as "already syncing", not a generic failure');
  assert.equal(row.sync_status, 'syncing', 'the row reflects exactly one claim, not two');
  ok('simultaneous claims: exactly one wins, the other is refused as a conflict');
}

console.log('\nA caller whose own snapshot already says \'syncing\' cannot self-claim\n');

{
  // This is the exact shape of the real defect, not just a renamed version
  // of the race above. sync-all-accounts used to pre-mark a row 'syncing'
  // itself, unconditionally, before ever calling the function that runs
  // beginBankSync - so by the time beginBankSync re-read the row, 'syncing'
  // was ALL it could ever see, and the old CAS (`eq('sync_status',
  // account.sync_status)`) degenerates into 'syncing' -> 'syncing', which
  // trivially satisfies an equality check. Two such callers - the
  // dispatcher's own pre-mark racing a direct user click, or two dispatcher
  // runs overlapping - would BOTH observe 'syncing' as their baseline and
  // BOTH be let through, each starting a real Plaid sync concurrently.
  //
  // Modelled directly: a caller whose account snapshot says 'syncing'
  // (freshly true - nothing stale about it) tries to claim. The fix must
  // refuse this regardless of what the caller's own snapshot claims, because
  // a snapshot cannot prove no OTHER caller made the identical observation
  // a moment earlier.
  const row = { id: 'fixture-account', user_id: 'fixture-owner', sync_status: 'syncing', updated_date: FRESH };
  const admin = makeAdmin(row);
  await assert.rejects(
    beginBankSync(admin, { id: row.id, user_id: row.user_id, sync_status: 'syncing' }),
    (err) => isSyncInProgress(err),
    "a caller's own stale-baseline snapshot of 'syncing' must not be enough to claim it",
  );
  ok("a snapshot already reading 'syncing' cannot use that as license to claim");
}

console.log('\nA plain retry against a row someone else already has\n');

{
  const row = { id: 'fixture-account', user_id: 'fixture-owner', sync_status: 'syncing', updated_date: FRESH };
  const admin = makeAdmin(row);
  await assert.rejects(
    beginBankSync(admin, { ...row }),
    (err) => isSyncInProgress(err),
    'a fresh syncing row refuses a second claim',
  );
  assert.equal(row.sync_status, 'syncing', 'refused claim must not touch the row');
  ok('a fresh in-progress sync cannot be claimed again');
}

console.log('\nAn abandoned sync recovers; a merely slow one does not\n');

{
  // Just inside the 15-minute window: still refused. A slow-but-alive sync
  // must not be reclaimed out from under itself.
  const row = { id: 'fixture-account', user_id: 'fixture-owner', sync_status: 'syncing', updated_date: JUST_INSIDE_WINDOW };
  const admin = makeAdmin(row);
  await assert.rejects(beginBankSync(admin, { ...row }), (err) => isSyncInProgress(err));
  ok('a sync 14 minutes in is still treated as active, not abandoned');
}

{
  // Past the window: the only way to reach this state is the worker that
  // set it dying before it could call completeBankSync or failBankSync -
  // nothing else ever writes this column while it reads 'syncing'. This is
  // the actual "abandoned/stuck syncing" recovery: no admin action, no
  // direct database edit, just the next ordinary attempt succeeding.
  const row = { id: 'fixture-account', user_id: 'fixture-owner', sync_status: 'syncing', updated_date: ABANDONED };
  const admin = makeAdmin(row);
  const sync = await beginBankSync(admin, { ...row });
  assert.equal(row.sync_status, 'syncing', 'reclaimed, not left alone');
  ok('a sync abandoned 20 minutes ago is reclaimed by the next attempt');

  // And the reclaimed sync completes normally - recovery is not a dead end.
  await completeBankSync(sync, { last_synced_at: new Date().toISOString() });
  assert.equal(row.sync_status, 'connected');
  assert.equal(row.error_message, null);
  ok('the reclaimed sync completes normally afterwards');
}

console.log('\nA disconnect is authoritative even against a stale caller snapshot\n');

{
  // The caller's `account` argument is read moments before the call - here
  // it is deliberately stale (says 'connected') while the LIVE row has
  // already moved to 'disconnected'. The early fast-path check (which only
  // looks at the caller's snapshot) would miss this; the atomic UPDATE's
  // own `neq('sync_status','disconnected')` must not.
  const row = { id: 'fixture-account', user_id: 'fixture-owner', sync_status: 'disconnected', updated_date: FRESH };
  const admin = makeAdmin(row);
  await assert.rejects(
    beginBankSync(admin, { id: row.id, user_id: row.user_id, sync_status: 'connected' }),
    /disconnected/i,
  );
  assert.equal(row.sync_status, 'disconnected', 'must not resurrect a disconnected account into syncing');
  ok('a disconnect that happened after the caller read the row is still honoured');
}

console.log('\nRetry after a genuine failure, and existing state is preserved throughout\n');

{
  // The full lifecycle a real retry goes through: claim, fail (as a real
  // sync does when Plaid or a write fails), then a LATER attempt succeeds -
  // proving 'error' is retryable, not another dead end, and that nothing
  // about a failed-then-retried sync corrupts the account's own identity
  // fields along the way.
  const row = {
    id: 'fixture-account', user_id: 'fixture-owner', sync_status: 'connected',
    updated_date: FRESH, last_synced_at: '2026-01-01T00:00:00.000Z', institution_name: 'Fixture Bank',
  };
  const admin = makeAdmin(row);

  const firstAttempt = await beginBankSync(admin, { ...row });
  assert.equal(row.sync_status, 'syncing');
  await failBankSync(firstAttempt, new Error('Synthetic provider failure'));
  assert.equal(row.sync_status, 'error');
  assert.equal(row.last_synced_at, '2026-01-01T00:00:00.000Z', 'a failed sync must not invent a fresh last-synced time');
  assert.equal(row.institution_name, 'Fixture Bank', 'unrelated account fields are untouched by the failure path');

  const retry = await beginBankSync(admin, { ...row });
  assert.equal(row.sync_status, 'syncing', 'an errored account is retryable');
  // completeBankSync always stamps its own now() for last_synced_at - the
  // whole point being that freshness can only ever mean a write it actually
  // confirmed, never a value a caller merely asked to record.
  await completeBankSync(retry, {});
  assert.equal(row.sync_status, 'connected');
  assert.notEqual(row.last_synced_at, '2026-01-01T00:00:00.000Z', 'a real completion must move last_synced_at off the old value');
  assert.ok(Date.now() - new Date(row.last_synced_at).getTime() < 5000, 'the new last_synced_at is genuinely fresh');
  assert.equal(row.institution_name, 'Fixture Bank', 'still untouched after a successful retry');
  ok('claim -> fail -> retry -> succeed preserves every field the sync itself does not own');
}

console.log(`\nAll ${checks} checks passed.`);
