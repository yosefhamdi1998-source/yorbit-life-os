// Edge Function authentication guards. No network, no database, no secrets.
//
// Edge Functions run with the service-role key and BYPASS RLS completely, so
// the database-tier isolation checks say nothing about them. Their own auth
// code is the only thing standing between a caller and every user's data.
//
// WHAT THIS FOUND
//
// Three guards decide "is this caller the system?" by comparing the
// Authorization header against the service-role key, with a literal fallback:
//
//     Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '__none__'
//
// The fallback makes the guard FAIL OPEN. If that variable is ever missing or
// empty, the comparison becomes `authHeader.includes('__none__')`, and any
// caller who sends `Authorization: Bearer __none__` is treated as the system.
// A missing secret should deny, not grant.
//
// Supabase injects that variable automatically, so this is unlikely in the
// managed environment today — it is a latent failure mode, not a live breach.
// It matters because of what the flag unlocks:
//
//   _shared/supabase.ts requireSystemCaller ... sync-all-accounts (syncs EVERY
//     user's bank accounts, billable Plaid calls), weekly-custom-record-
//     analysis (Anthropic calls per user, billable), generate-subscription-
//     reminders (writes notifications for every user)
//   plaid-sync-transactions ... SKIPS the connected_account ownership check
//   plaid-sync-holdings ...... SKIPS the connected_account ownership check
//
// The last two are the serious ones. With the flag true, the check
// `account.user_id !== user.id` is not evaluated at all, so a caller could
// pass any connected_account_id and sync that account's bank data.
//
// The fix is one word per site — fail closed instead:
//     const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
//     const isServiceRoleCall = !!key && authHeader.includes(key);
// NOT applied here. plaid-sync-* are Plaid files and Codex owns Plaid
// remediation, so this test documents the finding rather than changing it.
//
// Run: npm run test:edge-auth-guards

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fnDir = path.join(root, 'supabase', 'functions');

let failures = 0;
const check = (label, got, expected) => {
  const ok = JSON.stringify(got) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}: got ${JSON.stringify(got)}, expected ${JSON.stringify(expected)}`);
};

// ---------------------------------------------------------------------------
console.log('1. The guard as written today, shown failing open\n');

// Faithful reproduction of the three call sites.
const guardAsWritten = (authHeader, envKey) =>
  authHeader.includes(envKey || '__none__');

const REAL_KEY = 'service-role-key-abc123';

check('correct key is accepted', guardAsWritten(`Bearer ${REAL_KEY}`, REAL_KEY), true);
check('wrong key is rejected', guardAsWritten('Bearer attacker-token', REAL_KEY), false);
check('empty header is rejected', guardAsWritten('', REAL_KEY), false);

// The bug: with the env var absent, the sentinel becomes the password.
check('env unset + attacker sends the sentinel -> TREATED AS SYSTEM',
  guardAsWritten('Bearer __none__', undefined), true);
check('env empty string + sentinel -> TREATED AS SYSTEM',
  guardAsWritten('Bearer __none__', ''), true);

// ---------------------------------------------------------------------------
console.log('\n2. The fail-closed form, for comparison\n');

const guardFailClosed = (authHeader, envKey) => !!envKey && authHeader.includes(envKey);

check('correct key still accepted', guardFailClosed(`Bearer ${REAL_KEY}`, REAL_KEY), true);
check('env unset + sentinel -> denied', guardFailClosed('Bearer __none__', undefined), false);
check('env empty + sentinel -> denied', guardFailClosed('Bearer __none__', ''), false);
check('env unset + correct key -> denied', guardFailClosed(`Bearer ${REAL_KEY}`, undefined), false);

// ---------------------------------------------------------------------------
console.log('\n3. Source scan: no auth guard may fall back to a literal\n');

const sources = [];
const walk = (dir) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p);
    else if (entry.name.endsWith('.ts')) sources.push(p);
  }
};
walk(fnDir);

const FAIL_OPEN = /Deno\.env\.get\(\s*['"]SUPABASE_SERVICE_ROLE_KEY['"]\s*\)\s*\|\|\s*['"]/;
const offenders = sources
  .filter((f) => FAIL_OPEN.test(fs.readFileSync(f, 'utf8')))
  .map((f) => path.relative(root, f).replace(/\\/g, '/'));

// The three sites known to have this today. The assertion is deliberately
// "no NEW offender", not exact equality: whoever fixes these should not also
// have to edit this list to keep the build green, and a half-finished fix
// must not fail the shared suite. Adding a fresh fail-open guard does fail.
const KNOWN = [
  'supabase/functions/_shared/supabase.ts',
  'supabase/functions/plaid-sync-holdings/index.ts',
  'supabase/functions/plaid-sync-transactions/index.ts',
];

const unexpected = offenders.filter((f) => !KNOWN.includes(f));
check('no NEW fail-open auth guard', unexpected, []);
const fixed = KNOWN.filter((f) => !offenders.includes(f));
console.log(fixed.length
  ? `        (${fixed.length} of the ${KNOWN.length} known sites now fixed: ${fixed.join(', ')})`
  : `        (${KNOWN.length} known sites still present — see the header)`);

// ---------------------------------------------------------------------------
console.log('\n4. Ownership checks on client-supplied ids are present\n');

// Every endpoint that accepts an id from the request body must compare it to
// the caller before acting, because the service-role client ignores RLS.
const OWNERSHIP = [
  ['plaid-sync-transactions', /account\.user_id\s*!==\s*user\.id/],
  ['plaid-sync-holdings', /account\.user_id\s*!==\s*user\.id/],
  ['plaid-create-link-token', /account\.user_id\s*!==\s*user\.id/],
  ['ai-coach', /\.eq\('id',\s*conversation_id\)\s*\.eq\('user_id',\s*userId\)/],
];
for (const [fn, re] of OWNERSHIP) {
  const src = fs.readFileSync(path.join(fnDir, fn, 'index.ts'), 'utf8');
  check(`${fn} verifies ownership of the supplied id`, re.test(src), true);
}

// The three system-only endpoints must all be behind requireSystemCaller.
for (const fn of ['sync-all-accounts', 'weekly-custom-record-analysis', 'generate-subscription-reminders']) {
  const src = fs.readFileSync(path.join(fnDir, fn, 'index.ts'), 'utf8');
  check(`${fn} calls requireSystemCaller`, /requireSystemCaller\(/.test(src), true);
}

console.log(failures ? `\n${failures} check(s) failed.` : '\nAll checks passed.');
process.exit(failures ? 1 : 0);
