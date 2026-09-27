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

  // The whole fix script, including its cron.schedule/format statement.
  // cron.schedule and net.http_post are stubs here that record what they get.
  await client.query(`delete from cron.job;
    create or replace function cron.schedule(job_name text, schedule text, command text) returns bigint language sql as
      $f$ update cron.job set schedule = $2, command = $3 where jobname = $1 returning jobid::bigint $f$;
    create schema if not exists net;
    create table net.sent (url text, headers jsonb);
    create function net.http_post(url text, headers jsonb, body jsonb) returns bigint language sql as
      $f$ insert into net.sent values ($1, $2); select 1::bigint $f$;`);
  const jobsBefore = [
    ['sync-all-accounts-4h', '0 */4 * * *', cmd(SERVICE.slice(0, 40)).replace('x.supabase.co', 'pvjiialxboslqyiiybpe.supabase.co')],
    ['generate-subscription-reminders-daily', '5 9 * * *', cmd('sb_secret_' + 'R'.repeat(30)).replace('sync-all-accounts', 'generate-subscription-reminders')],
    ['weekly-custom-record-analysis', '0 10 * * 1', cmd('sb_secret_' + 'W'.repeat(30)).replace('sync-all-accounts', 'weekly-custom-record-analysis')],
  ];
  for (const [n, sch, c] of jobsBefore) await client.query(`insert into cron.job(jobname, schedule, active, command) values ($1, $2, true, $3)`, [n, sch, c]);
  await client.query('delete from vault.decrypted_secrets');
  await client.query(`insert into vault.decrypted_secrets values ('cron_service_role_jwt', $1)`, [`${SERVICE}\n`]);
  await client.query(fix);
  const after = Object.fromEntries((await client.query('select jobname, schedule, command from cron.job')).rows.map(r => [r.jobname, r]));
  assert.equal(after['sync-all-accounts-4h'].schedule, '0 */4 * * *');
  assert.equal(after['generate-subscription-reminders-daily'].schedule, '5 9 * * *');
  assert.equal(after['weekly-custom-record-analysis'].command, jobsBefore[2][2], 'the AI job is left exactly as it was');
  for (const [name, fn] of [['sync-all-accounts-4h', 'sync-all-accounts'], ['generate-subscription-reminders-daily', 'generate-subscription-reminders']]) {
    await client.query('delete from net.sent');
    await client.query(after[name].command);
    const [{ url, headers }] = (await client.query('select url, headers from net.sent')).rows;
    assert.equal(url, `https://pvjiialxboslqyiiybpe.supabase.co/functions/v1/${fn}`);
    assert.equal(headers.Authorization, `Bearer ${SERVICE}`, 'the job sends exactly the trimmed Vault key');
    assert.ok(!after[name].command.includes(SERVICE.slice(20, 40)), 'the key itself is not stored in the job');
  }
  const reclassified = Object.fromEntries((await client.query(classify)).rows.map(r => [r.jobname, r.bearer_format]));
  assert.match(reclassified['sync-all-accounts-4h'], /Vault/); assert.match(reclassified['generate-subscription-reminders-daily'], /Vault/);
  assert.match(reclassified['weekly-custom-record-analysis'], /NEW secret key/);
  console.log('  PASS  the full fix re-points bank sync and reminders to Vault with schedules kept, leaves the AI job untouched, and each job then sends exactly the trimmed key');
  console.log('\nAll cron-auth SQL checks passed against real PostgreSQL.');
} finally {
  await client.end().catch(() => {});
  await server.stop().catch(() => {});
  fs.rmSync(dataDir, { recursive: true, force: true });
}
