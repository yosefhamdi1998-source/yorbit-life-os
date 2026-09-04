// Checks the error-id and CORS work in _shared/cors.ts.
//
// These are read out loud over the phone and pasted into support emails,
// so the alphabet matters: an id containing O/0 or I/1 gets transcribed
// wrong and becomes unsearchable, which defeats the entire point.
//
// Deno-specific syntax means the module can't be imported into node, so
// this asserts against the source text plus a faithful reimplementation of
// the id generator. The alphabet itself is read FROM the source, so
// changing it there changes what is tested here.

import fs from 'node:fs';

const SRC = fs.readFileSync('supabase/functions/_shared/cors.ts', 'utf8');

let failures = 0;
function check(label, actual, expected) {
  const ok = actual === expected;
  if (!ok) failures++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}: got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
}

console.log('\n1. Error id alphabet is transcription-safe');
const alphaMatch = SRC.match(/const ID_ALPHABET = '([^']+)'/);
check('alphabet is defined', Boolean(alphaMatch), true);
const ALPHA = alphaMatch ? alphaMatch[1] : '';
// Characters people reliably confuse when reading an id off a screen.
for (const c of ['0', 'O', '1', 'I', 'L']) {
  check(`excludes "${c}"`, ALPHA.includes(c), false);
}
// No vowels means an id can never accidentally spell a word.
for (const v of ['A', 'E', 'I', 'O', 'U']) {
  check(`excludes vowel "${v}"`, ALPHA.includes(v), false);
}
check('alphabet is uppercase only', ALPHA === ALPHA.toUpperCase(), true);

console.log('\n2. Generated ids have the right shape');
{
  // Same construction as newErrorId(): 8 bytes mapped through the alphabet.
  const gen = () => {
    const bytes = new Uint8Array(8);
    globalThis.crypto.getRandomValues(bytes);
    return 'YORB-' + Array.from(bytes, b => ALPHA[b % ALPHA.length]).join('');
  };
  const ids = Array.from({ length: 500 }, gen);
  check('all match YORB-XXXXXXXX', ids.every(i => /^YORB-[A-Z0-9]{8}$/.test(i)), true);
  check('all use only the alphabet', ids.every(i => [...i.slice(5)].every(c => ALPHA.includes(c))), true);
  // 30^8 is ~6.5e11; 500 draws colliding would indicate a broken generator.
  check('no collisions in 500', new Set(ids).size, 500);
}

console.log('\n3. errorResponse never leaks internals to the caller');
// The response body is built from `message` and `errorId` only; `detail`
// must go to console.error, never into the JSON.
{
  const fnBody = SRC.slice(SRC.indexOf('export function errorResponse'));
  check('logs detail to console', /console\.error\([^)]*detail/s.test(fnBody), true);
  check('response body has error + error_id only',
    /\{ error: message, error_id: `YORB-\$\{errorId\}` \}/.test(fnBody), true);
  check('detail is not in the response body',
    /jsonResponse\(\s*\{[^}]*detail/s.test(fnBody), false);
}

console.log('\n4. CORS is locked to known origins');
{
  check('no wildcard origin value', /'Access-Control-Allow-Origin': '\*'/.test(SRC), false);
  check('vercel origin allowed', SRC.includes('https://yorbit-life-os.vercel.app'), true);
  check('github pages origin allowed', SRC.includes('https://yosefhamdi1998-source.github.io'), true);
  check('Vary: Origin set', SRC.includes("'Vary': 'Origin'"), true);
  // Without Vary, a shared cache can hand one origin's ACAO header to another.
  const allowedList = SRC.match(/const ALLOWED_ORIGINS = \[([^\]]+)\]/s);
  check('allow-list is defined', Boolean(allowedList), true);
  check('unknown origins are not echoed',
    /allowed \? origin : ALLOWED_ORIGINS\[0\]/.test(SRC), true);
}

console.log('\n5. Every function returns ids on failure');
{
  const dirs = fs.readdirSync('supabase/functions').filter(d => d !== '_shared');
  const missing = dirs.filter(d => {
    const p = `supabase/functions/${d}/index.ts`;
    if (!fs.existsSync(p)) return false;
    return !fs.readFileSync(p, 'utf8').includes('errorResponse(');
  });
  check('functions without errorResponse', missing.join(',') || 'none', 'none');

  // A raw error.message reaching the browser exposes database and provider
  // internals and gives the user nothing actionable.
  const leaking = dirs.filter(d => {
    const p = `supabase/functions/${d}/index.ts`;
    if (!fs.existsSync(p)) return false;
    const s = fs.readFileSync(p, 'utf8');
    return /jsonResponse\(\{ error: (error|err)\.message \}/.test(s);
  });
  check('functions leaking raw error.message', leaking.join(',') || 'none', 'none');
}

console.log('\n6. The client surfaces the id to the user');
{
  const client = fs.readFileSync('src/api/base44Client.js', 'utf8');
  check('reads error_id from the body', client.includes('ctx?.error_id'), true);
  check('appends a Reference to the message', client.includes('(Reference: ${errorId})'), true);
}

console.log(failures === 0 ? '\nAll error-id and CORS checks passed.\n' : `\n${failures} check(s) FAILED.\n`);
process.exit(failures === 0 ? 0 : 1);
