// Runs the actual SQL in scripts/cron-auth-diagnose.sql (bearer-format
// classification) and scripts/cron-auth-fix.sql (Vault pre-check) against a
// local, throwaway PostgreSQL 17. pg_cron, pg_net and Vault are not
// available there, so cron.job and vault.decrypted_secrets are minimal
// tables with the same column names. Every "key" below is synthetic and
// unsigned - never a real credential.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import EmbeddedPostgres from 'embedded-postgres';
import pgPkg from 'pg';

const b64url = obj => Buffer.from(JSON.stringify(obj)).toString('base64url');
const jwt = claims => `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url(claims)}.synthetic-signature`;
const SERVICE = jwt({ role: 'service_role', iss: 'supabase' });
const ANON = jwt({ role: 'anon', iss: 'supabase' });

const diagnose = fs.readFileSync('scripts/cron-auth-diagnose.sql', 'utf8');
const classify = diagnose.match(/select\s+j\.jobname,[\s\S]*?order by j\.jobname;/)[0];
const fix = fs.readFileSync('scripts/cron-auth-fix.sql', 'utf8');
const precheck = fix.match(/do \$\$[\s\S]*?end \$\$;/)[0];

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yorbit-cron-auth-'));
const port = 55000 + Math.floor(Math.random() * 4000);
const server = new EmbeddedPostgres({ databaseDir: dataDir, user: 'postgres', password: 'local-test-only', port, persistent: false, onLog: () => {}, onError: () => {} });
const client = new pgPkg.Client({ host: 'localhost', port, user: 'postgres', password: 'local-test-only', database: 'postgres' });

try {
  await server.initialise(); await server.start(); await client.connect();
  await client.query(`create schema cron; create table cron.job (jobid serial, jobname text, schedule text, active boolean, command text);
                      create schema vault; create table vault.decrypted_secrets (name text, decrypted_secret text);`);

  const cmd = bearer => `select net.http_post(url := 'https://x.supabase.co/functions/v1/sync-all-accounts', headers := jsonb_build_object('Authorization', 'Bearer ${bearer}', 'Content-Type', 'application/json'), body := '{}'::jsonb);`;
  const jobs = {
    'a-new-secret': cmd('sb_secret_' + 'Q'.repeat(30)),
    'b-legacy-jwt': cmd(SERVICE),
    'c-placeholder': cmd('<SERVICE_ROLE_KEY>'),
    'd-truncated': cmd(SERVICE.slice(0, 40)),
    'e-vault': `select net.http_post(url := 'https://x.supabase.co/functions/v1/sync-all-accounts', headers := jsonb_build_object('Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_service_role_jwt')), body := '{}'::jsonb);`,
    'f-publishable': cmd('sb_publishable_' + 'Z'.repeat(20)),
  };
  for (const [name, command] of Object.entries(jobs)) await client.query(`insert into cron.job(jobname, schedule, active, command) values ($1, '0 */4 * * *', true, $2)`, [name, command]);
  const rows = Object.fromEntries((await client.query(classify)).rows.map(r => [r.jobname, r]));
  assert.match(rows['a-new-secret'].bearer_format, /NEW secret key: not a JWT/);
  assert.match(rows['b-legacy-jwt'].bearer_format, /JWT-shaped/);
  assert.match(rows['c-placeholder'].bearer_format, /placeholder/);
  assert.match(rows['d-truncated'].bearer_format, /malformed or truncated/);
  assert.match(rows['e-vault'].bearer_format, /Vault/);
  assert.match(rows['f-publishable'].bearer_format, /publishable/);
  assert.equal(rows['b-legacy-jwt'].target_function, 'sync-all-accounts');
  assert.ok(Object.values(rows).every(r => !JSON.stringify(r).includes('synthetic-signature') && !JSON.stringify(r).includes('QQQQ')), 'the diagnosis never echoes a credential');
  console.log('  PASS  diagnosis classifies secret-key, JWT, placeholder, truncated, Vault and publishable bearers without printing any of them');

  const attempt = async secret => {
    await client.query('delete from vault.decrypted_secrets');
    if (secret !== undefined) await client.query(`insert into vault.decrypted_secrets values ('cron_service_role_jwt', $1)`, [secret]);
    try { await client.query(precheck); return 'accepted'; } catch (e) { return e.message; }
  };
  assert.equal(await attempt(SERVICE), 'accepted');
  assert.equal(await attempt(`  ${SERVICE}\n`), 'accepted', 'surrounding whitespace from a paste is tolerated');
  assert.match(await attempt(undefined), /does not exist/);
  assert.match(await attempt('sb_secret_' + 'Q'.repeat(30)), /new-format API key/);
  assert.match(await attempt(SERVICE.slice(0, 40)), /not a well-formed JWT/);
  assert.match(await attempt(ANON), /not the service_role key/);
  for (const secret of ['sb_secret_' + 'Q'.repeat(30), SERVICE.slice(0, 40), ANON]) {
    const message = await attempt(secret);
    assert.ok(!message.includes(secret) && !message.includes('synthetic-signature'), 'a refusal never includes the secret');
  }
  console.log('  PASS  fix pre-check accepts only a complete service_role JWT; refuses missing, sb_secret_, truncated and anon keys without echoing them');
  console.log('\nAll cron-auth SQL checks passed against real PostgreSQL.');
} finally {
  await client.end().catch(() => {});
  await server.stop().catch(() => {});
  fs.rmSync(dataDir, { recursive: true, force: true });
}
