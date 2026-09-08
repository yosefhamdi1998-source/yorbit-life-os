#!/usr/bin/env node
// Restores every table's data from a decrypted backup JSON file into a
// target schema, using Postgres's own jsonb_populate_recordset — the
// target table's own column types are the source of truth for how each
// JSON row maps back, so this doesn't need to hand-maintain a parallel
// schema definition that could drift from the real one.
//
// Called by restore.sh — not meant to be run directly (it needs a decrypted
// JSON path and a target schema name).

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');

const [, , jsonPath, targetSchema] = process.argv;
if (!jsonPath || !targetSchema) {
  console.error('Usage: restore.cjs <decrypted-json-path> <target-schema>');
  process.exit(1);
}

const backup = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

// backup_query.sql is `select json_build_object(...) as full_backup` — ONE row,
// ONE column — and `supabase db query --output-format json` emits rows as a
// top-level ARRAY. So the file on disk is: [ { "full_backup": { ... } } ].
//
// The previous unwrap only handled `{rows:[{full_backup}]}` and a bare object.
// Against the array the CLI actually writes, `backup.rows` is undefined, so
// `root` stayed as the ARRAY — and `root['transactions']` on an array is
// undefined, so every table restored 0 rows while still reporting success.
// (verify-backup.sh already unwrapped this correctly; this file never caught up.)
function unwrap(b) {
  let r = Array.isArray(b) ? b[0] : b;
  if (r && r.rows) r = Array.isArray(r.rows) ? r.rows[0] : r.rows;
  if (r && r.full_backup) r = r.full_backup;
  return r;
}
const root = unwrap(backup);

// auth_users is intentionally excluded from automated restore — recreating
// real login credentials is a deliberate, careful step (see README note
// printed at the end), not something to do silently as part of a data
// restore that might run in --test mode by habit.
const TABLES = [
  'profiles', 'transactions', 'bills', 'budgets', 'goals', 'savings_goals',
  'net_worth_entries', 'habits', 'tasks', 'health_logs', 'journal_entries',
  'notes', 'notifications', 'custom_forms', 'custom_records',
  'ai_insight_caches', 'ai_usage_log', 'bank_sync_logs', 'subscriptions',
  'connected_accounts', 'investment_holdings', 'advisor_conversations',
  'advisor_messages', 'allowed_emails',
];

// If the unwrap above ever stops matching the file's real shape again, fail
// here — loudly, before writing anything — instead of "restoring" nothing.
const foundTables = TABLES.filter((t) => Array.isArray(root && root[t]));
if (foundTables.length === 0) {
  console.error(
    'ABORT: no known table found inside the backup file.\n' +
    `  top level unwrapped to: ${Array.isArray(root) ? 'array' : typeof root}\n` +
    `  keys seen: ${root && typeof root === 'object' ? Object.keys(root).slice(0, 8).join(', ') : '(none)'}\n` +
    'Continuing would write zero rows and report success. Fix unwrap() first.'
  );
  process.exit(1);
}

const CHUNK_SIZE = 1500;
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yorbit-restore-'));

function runSql(sql, label) {
  const file = path.join(tmpDir, `${label}.sql`);
  fs.writeFileSync(file, sql, 'utf8');
  execSync(`npx supabase db query --linked -f "${file}" --output-format json`, { stdio: ['ignore', 'pipe', 'inherit'], maxBuffer: 1024 * 1024 * 64 });
}

console.log(`Restoring into schema "${targetSchema}"...\n`);

if (targetSchema !== 'public') {
  runSql(`drop schema if exists ${targetSchema} cascade; create schema ${targetSchema};`, '00-create-schema');
  for (const table of TABLES) {
    runSql(`create table ${targetSchema}.${table} (like public.${table} including all);`, `01-create-${table}`);
  }
}

const results = [];
for (const table of TABLES) {
  const rows = root[table] || [];
  if (rows.length === 0) {
    // `expected` must be set even at 0, or the mismatch filter below skips
    // this row entirely — which is how a restore of nothing passed as "every
    // table matches".
    results.push({ table, restored: 0, expected: 0 });
    continue;
  }
  let restored = 0;
  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    const chunk = rows.slice(i, i + CHUNK_SIZE);
    // Dollar-quoted so nothing in the data (quotes, backslashes) can break
    // out of the string literal.
    const jsonLiteral = JSON.stringify(chunk).replace(/\$restore\$/g, '$ restore $');
    const sql = `insert into ${targetSchema}.${table} select * from jsonb_populate_recordset(null::${targetSchema}.${table}, $restore$${jsonLiteral}$restore$::jsonb);`;
    runSql(sql, `02-${table}-${i}`);
    restored += chunk.length;
    process.stdout.write(`  ${table}: ${restored}/${rows.length}\r`);
  }
  console.log(`  ${table}: ${restored}/${rows.length} restored`);
  results.push({ table, restored, expected: rows.length });
}

fs.rmSync(tmpDir, { recursive: true, force: true });

console.log('\nRestore complete.');
const mismatches = results.filter(r => r.restored !== r.expected);
if (mismatches.length) {
  console.error('MISMATCHES (restored count != backup count):', JSON.stringify(mismatches, null, 2));
  process.exit(1);
}

// A finance-app restore that writes zero rows is a failure no matter how
// consistently it matches an empty backup.
const totalRestored = results.reduce((n, r) => n + r.restored, 0);
if (totalRestored === 0) {
  console.error('FAILED: 0 rows restored across all tables. The backup parsed but held no data.');
  process.exit(1);
}

console.log(`Every table matches the backup row-for-row (${totalRestored.toLocaleString()} rows).`);

if (targetSchema !== 'public') {
  console.log('\nNote: auth_users was NOT restored (deliberately — see restore.sh).');
  console.log(`Verification schema "${targetSchema}" left in place for inspection.`);
  console.log(`Drop it when done:  drop schema ${targetSchema} cascade;`);
}
