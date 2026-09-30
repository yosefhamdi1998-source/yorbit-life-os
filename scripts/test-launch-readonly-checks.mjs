// Runs scripts/launch-readonly-checks.sql against a REAL local PostgreSQL 17
// (throwaway) with the real table definitions, so the file Codex runs on
// production has no syntax or column errors, returns only counts/names, and
// writes nothing. Supabase-managed schemas (auth, vault, migration history)
// are minimal stubs with the columns the checks read. All rows are synthetic.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import EmbeddedPostgres from 'embedded-postgres';
import pgPkg from 'pg';

const read = p => fs.readFileSync(p, 'utf8');
const checks = read('scripts/launch-readonly-checks.sql');
const code = checks.split(/\r?\n/).filter(line => !line.trim().startsWith('--')).join('\n');
assert.doesNotMatch(code, /\b(insert|update|delete|create|alter|drop|grant|revoke|truncate|copy|call|do)\b/i, 'read-only: no write or DDL statement');
assert.doesNotMatch(code, /\b(email|access_token|decrypted_secret|secret)\s*(,|$|\bfrom\b)/im, 'never selects an address, token or secret value');

const schema = read('supabase/schema.sql');
const table = name => schema.match(new RegExp(`create table if not exists public\\.${name} \\([\\s\\S]*?\\n\\);`))[0];
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yorbit-launch-checks-'));
const port = 55000 + Math.floor(Math.random() * 4000);
const server = new EmbeddedPostgres({ databaseDir: dataDir, user: 'postgres', password: 'local-test-only', port, persistent: false, onLog: () => {}, onError: () => {} });
let pool;
try {
  await server.initialise(); await server.start();
  pool = new pgPkg.Pool({ host: 'localhost', port, user: 'postgres', password: 'local-test-only', database: 'postgres' });
  await pool.query(`create schema auth; create table auth.users (id uuid primary key, email text, email_confirmed_at timestamptz, created_at timestamptz not null default now());
    create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
    create schema vault; create table vault.secrets (id uuid primary key default gen_random_uuid(), name text, secret text);
    create schema supabase_migrations; create table supabase_migrations.schema_migrations (version text primary key, name text, statements text[]);`);
  await pool.query(table('connected_accounts'));
  await pool.query(table('subscriptions'));
  await pool.query(read('supabase/migrations/20260927213604_app_store_subscriptions.sql'));
  await pool.query(read('supabase/migrations/20260907150000_plaid_credentials_vault.sql').match(/create table if not exists plaid_credentials \([\s\S]*?\n\);/)[0]);

  const u = n => `00000000-0000-4000-8000-00000000000${n}`;
  await pool.query(`insert into auth.users (id, email, email_confirmed_at, created_at) values
    ($1, 'a@example.test', now() - interval '40 days', now() - interval '40 days'),
    ($2, 'b@example.test', null, now() - interval '3 days'),
    ($3, 'c@example.test', null, now() - interval '2 days')`, [u(1), u(2), u(3)]);
  const acct = await pool.query(`insert into public.connected_accounts (user_id, provider, institution_name, account_name, provider_item_id, sync_status, last_synced_at) values
    ($1, 'plaid', 'Fixture Bank', 'Old checking', 'item-old', 'disconnected', '2026-09-01'),
    ($1, 'plaid', 'Fixture Bank', 'Checking', 'item-live', 'connected', '2026-09-14') returning id`, [u(1)]);
  await pool.query(`insert into public.plaid_credentials (user_id, connected_account_id, access_token, item_id) values ($1, $2, 'synthetic-token', 'item-old')`, [u(1), acct.rows[0].id]);
  await pool.query(`insert into public.subscriptions (user_id, provider, plan, status) values ($1, 'stripe', 'pro_monthly', 'trialing'), ($2, 'app_store', 'pro_yearly', 'active')`, [u(1), u(2)]);
  await pool.query(`insert into supabase_migrations.schema_migrations (version, name) values ('20260927212600','atomic_bank_disconnect_claim'),('20260927213555','unique_stripe_subscription_rows'),('20260927213604','app_store_subscriptions')`);

  const before = (await pool.query(`select (select count(*) from auth.users) + (select count(*) from public.connected_accounts) + (select count(*) from public.subscriptions) as n`)).rows[0].n;
  const results = await pool.query(checks);
  const rows = results.map(r => r.rows);
  assert.equal(rows.length, 6, 'six checks');
  assert.equal(Number(rows[0][0].users), 3); assert.equal(Number(rows[0][0].unconfirmed), 2); assert.equal(Number(rows[0][0].unconfirmed_last_30_days), 2); assert.equal(Number(rows[0][0].confirmed_last_30_days), 0);
  assert.equal(Number(rows[1][0].disconnected_accounts_with_credential), 1); assert.equal(Number(rows[1][0].bank_items), 1);
  assert.deepEqual(rows[2].map(r => `${r.sync_status}:${r.accounts}`), ['connected:1', 'disconnected:1']);
  assert.deepEqual(rows[3].map(r => `${r.provider}:${r.status}:${r.plan}:${r.rows}`), ['app_store:active:pro_yearly:1', 'stripe:trialing:pro_monthly:1']);
  assert.equal(rows[4][0].cron_service_role_jwt_present, false);
  assert.equal(rows[5].length, 3);
  for (const r of rows.flat()) for (const v of Object.values(r)) assert.ok(!/@|synthetic-token/.test(String(v)), 'no address or token in any result');
  const after = (await pool.query(`select (select count(*) from auth.users) + (select count(*) from public.connected_accounts) + (select count(*) from public.subscriptions) as n`)).rows[0].n;
  assert.equal(after, before, 'nothing written');
  console.log('PASS launch read-only checks: all six run against the real table definitions, return counts/names only, and write nothing');
} finally {
  await pool?.end().catch(() => {});
  await server.stop().catch(() => {});
  fs.rmSync(dataDir, { recursive: true, force: true });
}
