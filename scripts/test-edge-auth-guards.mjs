// Edge Function authentication guards. No network, no database, no secrets.
//
// Edge Functions run with the service-role key and BYPASS RLS entirely, so the
// database-tier RLS checks say nothing about them. Their own auth code is the
// only thing between a caller and every user's data.
//
// WHAT THIS GUARDS AGAINST
//
// Three guards used to decide "is this caller the system?" like this:
//
//     Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '__none__'
//
// That fell back to a literal, so it FAILED OPEN: with the variable missing or
// empty the test collapsed to authHeader.includes('__none__') and anyone
// sending `Authorization: Bearer __none__` was treated as the system. In
// requireSystemCaller that reaches sync-all-accounts (syncs EVERY user's bank
// accounts), weekly-custom-record-analysis (billable AI calls per user) and
// generate-subscription-reminders. In the two plaid-sync functions it was
// worse: the ownership comparison is written `!isServiceRoleCall && ...`, so a
// true flag skipped it and any connected_account_id would sync.
//
// That is FIXED. All three sites now call the shared _shared/serviceBearer.ts,
// which fails closed on a missing key, extracts the token with an exact
// `^Bearer <token>$` match instead of a substring search, and compares with
// timingSafeEqual. This file exists to keep it that way.
//
// It tests the REAL implementation, not a copy. serviceBearer.ts is transpiled
// with the project's own tsc and imported, so a behavioural regression in that
// file fails here — a hand-written replica would keep passing while the real
// guard rotted.
//
// Run: npm run test:edge-auth-guards

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fnDir = path.join(root, 'supabase', 'functions');
const GUARD_TS = path.join(fnDir, '_shared', 'serviceBearer.ts');

let failures = 0;
const check = (label, got, expected) => {
  const ok = JSON.stringify(got) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}: got ${JSON.stringify(got)}, expected ${JSON.stringify(expected)}`);
};

// ---------------------------------------------------------------------------
// Load the real guard. Deliberately loud on failure: a test that quietly skips
// the thing it is supposed to protect is worse than no test, because the suite
// still reports green.
// ---------------------------------------------------------------------------
const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yorbit-guard-'));
let isServiceBearer;
try {
  execFileSync('npx', ['tsc', GUARD_TS, '--outDir', outDir, '--module', 'esnext',
    '--target', 'es2022', '--moduleResolution', 'bundler'],
    { cwd: root, stdio: 'pipe', shell: process.platform === 'win32' });
  ({ isServiceBearer } = await import(pathToFileURL(path.join(outDir, 'serviceBearer.js')).href));
} catch (err) {
  console.error('Could not transpile/import the real guard at', path.relative(root, GUARD_TS));
  console.error(String(err.stderr || err.message || err).slice(0, 500));
  process.exit(1);
}
if (typeof isServiceBearer !== 'function') {
  console.error('serviceBearer.ts no longer exports isServiceBearer()');
  process.exit(1);
}

const KEY = 'sbp_service_role_key_abc123';

console.log('1. The real isServiceBearer(), fail-closed behaviour\n');

check('correct token accepted', isServiceBearer(`Bearer ${KEY}`, KEY), true);
check('wrong token rejected', isServiceBearer('Bearer attacker-token', KEY), false);
check('empty header rejected', isServiceBearer('', KEY), false);
check('null header rejected', isServiceBearer(null, KEY), false);

// The original bug, now impossible: a missing secret must DENY, not grant.
check('key undefined -> denied', isServiceBearer(`Bearer ${KEY}`, undefined), false);
check('key empty string -> denied', isServiceBearer(`Bearer ${KEY}`, ''), false);
check('key whitespace only -> denied', isServiceBearer('Bearer    ', '   '), false);
check('old sentinel no longer opens anything', isServiceBearer('Bearer __none__', undefined), false);

console.log('\n2. Exact token match, not a substring search\n');

// `.includes()` would accept all three of these. Exact extraction must not.
check('token with prefix padding rejected', isServiceBearer(`Bearer x${KEY}`, KEY), false);
check('token with suffix padding rejected', isServiceBearer(`Bearer ${KEY}x`, KEY), false);
check('key embedded in a longer header rejected', isServiceBearer(`Bearer a.${KEY}.b`, KEY), false);
check('missing Bearer scheme rejected', isServiceBearer(KEY, KEY), false);
check('scheme is case-insensitive', isServiceBearer(`bearer ${KEY}`, KEY), true);
check('second token rejected', isServiceBearer(`Bearer ${KEY} extra`, KEY), false);

console.log('\n3. No guard may reintroduce a literal fallback\n');

const sources = [];
(function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p);
    else if (entry.name.endsWith('.ts')) sources.push(p);
  }
})(fnDir);

const FAIL_OPEN = /Deno\.env\.get\(\s*['"]SUPABASE_SERVICE_ROLE_KEY['"]\s*\)\s*\|\|\s*['"]/;
const offenders = sources
  .filter((f) => FAIL_OPEN.test(fs.readFileSync(f, 'utf8')))
  .map((f) => path.relative(root, f).replace(/\\/g, '/'));

// Zero tolerance now that all three sites are fixed. Any reappearance fails.
check('fail-open sentinel guards', offenders.sort(), []);

// Every site that decides service-role status must route through the shared
// helper. A bespoke re-implementation is how the original three drifted apart.
const bespoke = sources
  .filter((f) => !f.endsWith('serviceBearer.ts'))
  .filter((f) => /authHeader\.includes\(|header\.includes\(/.test(fs.readFileSync(f, 'utf8')))
  .map((f) => path.relative(root, f).replace(/\\/g, '/'));
check('hand-rolled header comparisons', bespoke.sort(), []);

console.log('\n4. Ownership checks on client-supplied ids\n');

// The service-role client ignores RLS, so any endpoint accepting an id from
// the request body must compare it to the caller before acting.
const OWNERSHIP = [
  ['plaid-sync-transactions', /account\.user_id\s*!==\s*user\.id/],
  ['plaid-sync-holdings', /account\.user_id\s*!==\s*user\.id/],
  ['plaid-create-link-token', /account\.user_id\s*!==\s*user\.id/],
  ['plaid-disconnect-account', /\.eq\('id',\s*accountId\)\.eq\('user_id',\s*user\.id\)/],
  ['ai-coach', /\.eq\('id',\s*conversation_id\)\s*\.eq\('user_id',\s*userId\)/],
];
for (const [fn, re] of OWNERSHIP) {
  const src = fs.readFileSync(path.join(fnDir, fn, 'index.ts'), 'utf8');
  check(`${fn} verifies ownership of the supplied id`, re.test(src), true);
}

for (const fn of ['sync-all-accounts', 'weekly-custom-record-analysis', 'generate-subscription-reminders']) {
  const src = fs.readFileSync(path.join(fnDir, fn, 'index.ts'), 'utf8');
  check(`${fn} is behind requireSystemCaller`, /requireSystemCaller\(/.test(src), true);
}

fs.rmSync(outDir, { recursive: true, force: true });
console.log(failures ? `\n${failures} check(s) failed.` : '\nAll checks passed.');
process.exit(failures ? 1 : 0);
