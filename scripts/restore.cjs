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
const root = backup.rows ? backup.rows[0].full_backup : backup; // handles both the raw db query CLI wrapper and a plain object

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
    results.push({ table, restored: 0 });
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
const mismatches = results.filter(r => r.expected != null && r.restored !== r.expected);
if (mismatches.length) {
  console.error('MISMATCHES (restored count != backup count):', JSON.stringify(mismatches, null, 2));
  process.exit(1);
}
console.log('Every table matches the backup row-for-row.');

if (targetSchema !== 'public') {
  console.log('\nNote: auth_users was NOT restored (deliberately — see restore.sh).');
  console.log(`Verification schema "${targetSchema}" left in place for inspection.`);
  console.log(`Drop it when done:  drop schema ${targetSchema} cascade;`);
}
