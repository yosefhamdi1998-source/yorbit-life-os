// supabase/config.toml must stay in step with the functions it governs.
//
// WHY
//
// `verify_jwt` is the platform gate in front of every Edge Function. It used to
// live only in the dashboard, set per-deploy from the CLI, so a reviewer had no
// way to see which endpoints were gated and a redeploy that forgot a flag
// changed production auth silently. config.toml fixes that — but only while it
// stays accurate. A config that has drifted is worse than none, because it
// looks authoritative.
//
// So this asserts the two ways it can rot:
//   - a function exists with no entry (deploys on the platform default, and the
//     repo implies nothing about it)
//   - an entry exists for a function that is gone (reads as a reviewed decision
//     about an endpoint that no longer exists)
//
// It also pins the one deliberate exception. stripe-webhook MUST stay false:
// Stripe sends no JWT and authenticates with the `stripe-signature` header, so
// switching the gate on would make Supabase reject every webhook before the
// signature check ran and billing events would vanish. Because that value looks
// like a mistake to anyone tidying the file, the test also requires the handler
// to actually verify a signature — the exception is only justified while the
// function defends itself some other way.
//
// Run: npm run test:function-jwt-config

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fnDir = path.join(root, 'supabase', 'functions');
const cfgPath = path.join(root, 'supabase', 'config.toml');

let failures = 0;
const check = (label, got, expected) => {
  const ok = JSON.stringify(got) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}: got ${JSON.stringify(got)}, expected ${JSON.stringify(expected)}`);
};

if (!fs.existsSync(cfgPath)) {
  console.error('supabase/config.toml is missing — verify_jwt would be invisible to review again.');
  process.exit(1);
}
const cfg = fs.readFileSync(cfgPath, 'utf8');

// Deliberately a small parser rather than a TOML dependency: the only shape
// this file needs is `[functions.<name>]` followed by `verify_jwt = <bool>`.
const declared = new Map();
// Split on section headers rather than using a lookahead for end-of-input: JS
// has no \Z, and writing one silently made the LAST section unparseable, which
// is exactly the stripe-webhook entry that most needs checking.
for (const section of cfg.split(/^\[/m).slice(1)) {
  const name = /^functions\.([A-Za-z0-9_-]+)\]/.exec(section);
  if (!name) continue;
  const v = /^\s*verify_jwt\s*=\s*(true|false)\s*$/m.exec(section);
  declared.set(name[1], v ? v[1] === 'true' : null);
}

const onDisk = fs.readdirSync(fnDir, { withFileTypes: true })
  .filter((e) => e.isDirectory() && !e.name.startsWith('_'))
  .map((e) => e.name)
  .sort();

console.log('config.toml must cover every Edge Function, and only real ones\n');

check('functions with no config entry', onDisk.filter((f) => !declared.has(f)), []);
check('config entries with no function', [...declared.keys()].filter((f) => !onDisk.includes(f)).sort(), []);
check('entries missing a verify_jwt value',
  [...declared.entries()].filter(([, v]) => v === null).map(([k]) => k), []);

console.log('\nThe gate must match what each handler actually enforces\n');

// A handler that demands a signed-in user should not be sitting behind an open
// gate — that combination means the platform lets anonymous requests through to
// code that will only 401 them, and it usually signals a forgotten flag.
for (const fn of onDisk) {
  const src = fs.readFileSync(path.join(fnDir, fn, 'index.ts'), 'utf8');
  const requiresUser = /await getUser\(req\)/.test(src) && /Unauthorized/.test(src);
  const signatureVerified = /stripe-signature/.test(src) && /constructEventAsync|constructEvent/.test(src);
  if (requiresUser && !signatureVerified) {
    check(`${fn} demands a user, so its gate is on`, declared.get(fn), true);
  }
}

// The exception, pinned from both directions.
check('stripe-webhook gate is off', declared.get('stripe-webhook'), false);
const webhook = fs.readFileSync(path.join(fnDir, 'stripe-webhook', 'index.ts'), 'utf8');
check('stripe-webhook verifies its signature instead',
  /stripe-signature/.test(webhook) && /constructEventAsync|constructEvent/.test(webhook), true);

// Any other open gate needs its own justification; fail until someone adds one.
const otherOpen = [...declared.entries()]
  .filter(([k, v]) => v === false && k !== 'stripe-webhook')
  .map(([k]) => k);
check('other functions with the gate off', otherOpen.sort(), []);

console.log(failures ? `\n${failures} check(s) failed.` : '\nAll checks passed.');
process.exit(failures ? 1 : 0);
