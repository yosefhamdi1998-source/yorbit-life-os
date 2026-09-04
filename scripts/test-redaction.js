// Proves the redactor removes every credential shape it claims to.
//
// Imports the real scripts/lib/secretPatterns.js, so this fails if a
// pattern is weakened, removed, or ordered wrongly. Assertions are exact:
// the redacted output must contain the right marker AND must not contain
// any fragment of the original secret.

import { redact, scan, SECRET_PATTERNS } from './lib/secretPatterns.js';

let failures = 0;
function check(label, actual, expected) {
  const ok = actual === expected;
  if (!ok) failures++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}: got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
}

// Fake credentials with the right SHAPE. None of these are real.
const CASES = [
  ['SUPABASE_ACCESS_TOKEN', 'sbp_' + 'a1b2c3d4e5'.repeat(4) + 'f0'],
  ['SUPABASE_SECRET_KEY', 'sb_secret_' + 'Xy9_'.repeat(6)],
  ['ANTHROPIC_API_KEY', 'sk-ant-api03-' + 'AbCdEf12'.repeat(4)],
  ['STRIPE_LIVE_KEY', 'sk_live_' + 'abcDEF123456'.repeat(2)],
  ['GITHUB_TOKEN', 'ghp_' + 'aB3'.repeat(12)],
  ['PLAID_ACCESS_TOKEN', 'access-production-' + 'a1b2c3d4-'.repeat(3) + 'ffff'],
  ['PLAID_LINK_TOKEN', 'link-sandbox-' + 'b2c3d4e5-'.repeat(3) + 'eeee'],
  ['AWS_KEY_ID', 'AKIA' + 'ABCDEFGH12345678'],
  ['JWT', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U'],
];

console.log('\n1. Every pattern is actually redacted');
for (const [label, secret] of CASES) {
  const input = `here is the value ${secret} in a sentence`;
  const { text } = redact(input);
  check(`${label} marker present`, text.includes(`[REDACTED_${label}]`), true);
  // The secret's distinctive tail must be gone. Catches a regex that
  // matches only a prefix and leaves the rest of the key on disk.
  check(`${label} tail removed`, text.includes(secret.slice(-12)), false);
}

console.log('\n2. Public-by-design values are NOT redacted');
{
  // Redacting these would be a false positive that makes logs useless.
  const publishable = 'sb_publishable_e3EzYabcdefgh12345';
  const url = 'https://pvjiialxboslqyiiybpe.supabase.co';
  const { text } = redact(`${publishable} and ${url}`);
  check('publishable key kept', text.includes(publishable), true);
  check('project url kept', text.includes(url), true);
}

console.log('\n3. Ordering: sk-ant must not be swallowed by the generic sk- rule');
{
  const anth = 'sk-ant-api03-' + 'ZzYyXx11'.repeat(4);
  const { text } = redact(anth);
  check('labelled ANTHROPIC_API_KEY', text.includes('[REDACTED_ANTHROPIC_API_KEY]'), true);
  check('not mislabelled as API_KEY', text.includes('[REDACTED_API_KEY]'), false);
}

console.log('\n4. Multiple secrets on one line are all removed');
{
  const a = 'sbp_' + 'f'.repeat(44);
  const b = 'ghp_' + 'A1b'.repeat(12);
  const { text, counts } = redact(`${a} then ${b}`);
  check('supabase counted', counts.get('SUPABASE_ACCESS_TOKEN'), 1);
  check('github counted', counts.get('GITHUB_TOKEN'), 1);
  check('no raw secret left', /sbp_f{20}|ghp_A1bA1b/.test(text), false);
}

console.log('\n5. Redacted output survives a second scan (idempotent)');
{
  const secret = 'access-production-' + '0f1e2d3c-'.repeat(3) + 'aaaa';
  const once = redact(secret).text;
  const twice = redact(once).text;
  check('stable under re-redaction', once, twice);
  check('scan of redacted output finds nothing', scan(once).size, 0);
}

console.log('\n6. Pattern list is non-empty and every entry is well formed');
{
  check('has patterns', SECRET_PATTERNS.length > 0, true);
  const bad = SECRET_PATTERNS.filter(p => !p.re || !p.label || !p.re.global);
  // A non-global regex would replace only the first occurrence per line,
  // silently leaving later secrets on the same line intact.
  check('all patterns global with labels', bad.length, 0);
}

console.log(failures === 0
  ? '\nAll redaction checks passed.\n'
  : `\n${failures} check(s) FAILED.\n`);
process.exit(failures === 0 ? 0 : 1);
