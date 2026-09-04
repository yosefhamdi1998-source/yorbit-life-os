#!/usr/bin/env node
/**
 * Fails if src/lib/enums.js has drifted from the database's CHECK
 * constraints — the exact bug class that made Budget's "Investment"
 * option and Recurring's "Add" button silently dead.
 *
 *   npm run check:enums
 *
 * Reports three kinds of problem:
 *   1. DRIFT     — a list here doesn't match its constraint
 *   2. UNCOVERED — a constraint exists in the DB that nothing here mirrors
 *   3. SUBSET    — a UI subset contains a value the parent list doesn't
 *
 * Exits non-zero on any of them, so it can gate a build or CI run.
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const PROJECT_REF = 'pvjiialxboslqyiiybpe';
const SQL = `select conname, pg_get_constraintdef(oid) as def
from pg_constraint
where contype='c' and connamespace='public'::regnamespace
  and pg_get_constraintdef(oid) like '%= ANY %'
order by conname;`;

function loadDbConstraints() {
  const tmp = path.join(require('os').tmpdir(), `enumcheck-${Date.now()}.sql`);
  fs.writeFileSync(tmp, SQL, 'utf8');
  try {
    execSync(`npx supabase link --project-ref ${PROJECT_REF}`, { stdio: 'ignore' });
    const raw = execSync(
      `npx supabase db query --linked -f "${tmp}" --output-format json`,
      { encoding: 'utf8', maxBuffer: 1024 * 1024 * 32, stdio: ['ignore', 'pipe', 'ignore'] }
    );
    const parsed = JSON.parse(raw);
    const out = {};
    for (const row of parsed.rows || []) {
      // ARRAY['a'::text, 'b'::text] -> ['a','b']
      const values = [...row.def.matchAll(/'([^']*)'::text/g)].map(m => m[1]);
      out[row.conname] = values;
    }
    return out;
  } finally {
    fs.rmSync(tmp, { force: true });
  }
}

// enums.js is an ES module; read and evaluate its exported arrays without
// pulling in a bundler.
function loadLocalEnums() {
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'lib', 'enums.js'), 'utf8');
  const lists = {};
  for (const m of src.matchAll(/export const ([A-Z_]+) = \[([^\]]*)\]/g)) {
    lists[m[1]] = [...m[2].matchAll(/'([^']*)'/g)].map(x => x[1]);
  }
  const mapBody = src.match(/export const ENUM_CONSTRAINT_MAP = \{([\s\S]*?)\n\};/);
  const map = {};
  if (mapBody) {
    for (const m of mapBody[1].matchAll(/^\s*(\w+):\s*([A-Z_]+),/gm)) {
      map[m[1]] = lists[m[2]];
    }
  }
  return { lists, map };
}

const same = (a, b) =>
  a.length === b.length && [...a].sort().join('|') === [...b].sort().join('|');

const db = loadDbConstraints();
const { lists, map } = loadLocalEnums();

const problems = [];
const passes = [];

for (const [conname, localValues] of Object.entries(map)) {
  const dbValues = db[conname];
  if (!dbValues) {
    problems.push(`MISSING   ${conname}: mapped in enums.js but no such constraint in the database`);
  } else if (!same(dbValues, localValues)) {
    const onlyDb = dbValues.filter(v => !localValues.includes(v));
    const onlyLocal = localValues.filter(v => !dbValues.includes(v));
    problems.push(
      `DRIFT     ${conname}\n` +
      (onlyLocal.length ? `            app offers, DB rejects: ${onlyLocal.join(', ')}\n` : '') +
      (onlyDb.length ? `            DB allows, app omits:   ${onlyDb.join(', ')}` : '')
    );
  } else {
    passes.push(`PASS      ${conname} (${dbValues.length} values)`);
  }
}

for (const conname of Object.keys(db)) {
  if (!(conname in map)) {
    problems.push(`UNCOVERED ${conname}: constraint exists in the DB but nothing in enums.js mirrors it`);
  }
}

// UI subsets must be drawn from their parent list
const subsetPairs = [
  ['INCOME_CATEGORIES', 'TRANSACTION_CATEGORIES'],
  ['EXPENSE_CATEGORIES', 'TRANSACTION_CATEGORIES'],
];
for (const [childName, parentName] of subsetPairs) {
  const child = lists[childName] || [];
  const parent = lists[parentName] || [];
  const stray = child.filter(v => !parent.includes(v));
  if (stray.length) problems.push(`SUBSET    ${childName} has values not in ${parentName}: ${stray.join(', ')}`);
  else passes.push(`PASS      ${childName} ⊆ ${parentName}`);
}

console.log(passes.join('\n'));
if (problems.length) {
  console.error('\n' + '='.repeat(60));
  console.error('ENUM DRIFT DETECTED — the app can offer values the database rejects.');
  console.error('This is invisible at runtime: the save just fails and the button looks dead.');
  console.error('='.repeat(60));
  console.error(problems.join('\n'));
  process.exit(1);
}
console.log(`\nAll ${passes.length} enum checks passed — app lists match database constraints.`);
