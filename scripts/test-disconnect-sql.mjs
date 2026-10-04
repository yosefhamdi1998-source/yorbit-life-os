// Bank disconnect against a REAL PostgreSQL 17 (embedded, local-only, torn
// down afterwards), running the real migration and the real Edge Function
// handler together. No network, no Plaid, no hosted database: Plaid is a
// recording fake; the database, locks, triggers and grants are real.
//
// The schema is assembled from the repository's own sources - the
// connected_accounts and bank_sync_logs DDL from schema.sql, then the real
// migrations in order - not a hand-written imitation. Supabase's auth schema
// and roles are stubbed minimally (auth.users, auth.uid(), anon /
// authenticated / service_role).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { transform } from 'esbuild';
import EmbeddedPostgres from 'embedded-postgres';
import pgPkg from 'pg';

const { Pool } = pgPkg;
const read = p => fs.readFileSync(p, 'utf8');
const schema = read('supabase/schema.sql');
const ddl = name => schema.match(new RegExp(`create table if not exists public\\.${name} \\([\\s\\S]*?\\n\\);`))[0];
const MIGRATION = 'supabase/migrations/20260927212600_atomic_bank_disconnect_claim.sql';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yorbit-disconnect-sql-'));
const port = 55000 + Math.floor(Math.random() * 4000);
const server = new EmbeddedPostgres({ databaseDir: dataDir, user: 'postgres', password: 'local-test-only', port, persistent: false, onLog: () => {}, onError: () => {} });

let pool;
let passed = 0;
const ok = label => { passed++; console.log(`  PASS  ${label}`); };

async function asRole(role, sub, fn, client) {
  const c = client || await pool.connect();
  try {
    await c.query('begin');
    await c.query(`set local role ${role}`);
    if (sub) await c.query(`select set_config('request.jwt.claim.sub', $1, true)`, [sub]);
    const r = await fn(c);
    await c.query('commit');
    return r;
  } catch (e) {
    await c.query('rollback').catch(() => {});
    throw e;
  } finally {
    if (!client) c.release();
  }
}
const asService = fn => asRole('service_role', null, fn);
const status = async id => (await pool.query('select sync_status from connected_accounts where id=$1', [id])).rows[0]?.sync_status;
const creds = async id => Number((await pool.query('select count(*) from plaid_credentials where connected_account_id=$1', [id])).rows[0].count);

let userSeq = 0;
async function seed({ accounts = 2, item = null, tokenPrefix = '' } = {}) {
  const user = `00000000-0000-4000-8000-${String(++userSeq).padStart(12, '0')}`;
  await pool.query('insert into auth.users(id) values ($1)', [user]);
  const itemId = item || `item-${userSeq}`;
  const rows = Array.from({ length: accounts }, (_, i) => ({ provider_account_id: `pa-${userSeq}-${i}`, institution_name: 'Fixture Bank', account_name: `Account ${i}`, account_type: 'checking' }));
  const saved = await asService(c => c.query(`select id from public.save_plaid_accounts_private($1, $2, $3, $4::jsonb)`, [user, itemId, `${tokenPrefix}synthetic-token-${userSeq}`, JSON.stringify(rows)]));
  return { user, item: itemId, token: `${tokenPrefix}synthetic-token-${userSeq}`, ids: saved.rows.map(r => r.id) };
}
const claim = (user, id, client) => asRole('service_role', null, c => c.query('select * from public.claim_bank_disconnect($1, $2)', [user, id]).then(r => r.rows[0]), client);
const finalize = (user, id) => asService(c => c.query('select public.finalize_bank_disconnect($1, $2) as ok', [user, id]));

try {
  await server.initialise();
  await server.start();
  pool = new Pool({ host: 'localhost', port, user: 'postgres', password: 'local-test-only', database: 'postgres', max: 12 });

  // ---------------------------------------------------------------- schema
  await pool.query(`
    create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
    create schema auth; create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth, public to anon, authenticated, service_role;
    grant execute on function auth.uid() to anon, authenticated, service_role;
  `);
  await pool.query(ddl('connected_accounts'));
  await pool.query(ddl('bank_sync_logs'));
  await pool.query(read('supabase/migrations/20260903100000_history_tracking.sql'));
  await pool.query(read('supabase/migrations/20260905000000_account_balances.sql').match(/alter table connected_accounts[\s\S]*?;/)[0]);
  for (const t of ['connected_accounts', 'bank_sync_logs']) {
    await pool.query(`alter table public.${t} enable row level security;
      create policy "${t}_select_own" on public.${t} for select using (auth.uid() = user_id);
      create policy "${t}_insert_own" on public.${t} for insert with check (auth.uid() = user_id);
      create policy "${t}_update_own" on public.${t} for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
      create policy "${t}_delete_own" on public.${t} for delete using (auth.uid() = user_id);`);
  }
  await pool.query(read('supabase/migrations/20260907120000_plaid_token_lockdown.sql'));
  await pool.query(read('supabase/migrations/20260907140000_reconnect_required_status.sql'));
  await pool.query(read('supabase/migrations/20260907150000_plaid_credentials_vault.sql'));
  await pool.query(read('supabase/migrations/20260914190526_atomic_plaid_account_credentials.sql'));
  await pool.query('grant all on all tables in schema public to service_role');
  await pool.query(read(MIGRATION));
  console.log(`Real PostgreSQL ${(await pool.query('show server_version')).rows[0].server_version}: schema from schema.sql + real migrations applied, including ${path.basename(MIGRATION)}`);

  // ------------------------------------------------- SQL: claim and finalize
  console.log('\nclaim / finalize, run as service_role');
  {
    const s = await seed({ accounts: 1 });
    const r = await claim(s.user, s.ids[0]);
    assert.deepEqual({ ...r }, { account_provider: 'plaid', item_id: s.item, account_status: 'disconnecting', sibling_active: false });
    assert.equal(await status(s.ids[0]), 'disconnecting');
    ok('claim runs without ambiguous-column errors, moves the account to a visible disconnecting state');

    const other = await seed({ accounts: 1 });
    await assert.rejects(() => claim(other.user, s.ids[0]), e => e.code === 'P0002');
    await assert.rejects(() => claim(s.user, '00000000-0000-4000-8000-ffffffffffff'), e => e.code === 'P0002');
    assert.equal(await status(other.ids[0]), 'connected');
    ok("another user's account and a nonexistent id get the same not-found error, and nothing changes");

    await assert.rejects(() => finalize(other.user, other.ids[0]), e => e.code === 'P0002');
    assert.equal(await creds(other.ids[0]), 1);
    assert.equal(await status(other.ids[0]), 'connected');
    ok('finalize refuses an account that was never claimed; its credential stays');

    await finalize(s.user, s.ids[0]);
    assert.equal(await status(s.ids[0]), 'disconnected'); assert.equal(await creds(s.ids[0]), 0);
    await finalize(s.user, s.ids[0]);
    ok('finalize deletes the credential and marks disconnected together, and is idempotent');
  }

  // ----------------------------------------------- SQL: sibling correctness
  console.log('\nshared Plaid Item: siblings');
  {
    const s = await seed({ accounts: 2 });
    const [a, b] = s.ids;
    assert.equal((await claim(s.user, a)).sibling_active, true);
    assert.equal((await claim(s.user, a)).sibling_active, true, 'retry of an unfinished disconnect');
    assert.equal(await status(b), 'connected'); assert.equal(await creds(b), 1);
    ok('a retry of an unfinished disconnect still reports the still-connected sibling (never a blind "no sibling")');

    // Real lock contention: hold A's claim open on one connection, start B's
    // on another, and observe B actually waiting on the advisory lock.
    const s2 = await seed({ accounts: 2 });
    const c1 = await pool.connect(); const c2 = await pool.connect();
    try {
      await c1.query('begin'); await c1.query('set local role service_role');
      const first = (await c1.query('select * from public.claim_bank_disconnect($1, $2)', [s2.user, s2.ids[0]])).rows[0];
      let settled = false;
      const second = claim(s2.user, s2.ids[1], c2).then(r => { settled = true; return r; });
      await new Promise(r => setTimeout(r, 400));
      const waiting = Number((await pool.query(`select count(*) from pg_locks where locktype='advisory' and not granted`)).rows[0].count);
      assert.equal(settled, false, 'the second claim must block while the first holds the lock');
      assert.ok(waiting >= 1, 'the waiter is on the advisory lock');
      await c1.query('commit');
      const secondRow = await second;
      assert.equal(first.sibling_active, true, 'first saw the other account still connected');
      assert.equal(secondRow.sibling_active, false, 'second saw the first already disconnecting');
      ok('a concurrent sibling claim genuinely blocks on the advisory lock, then sees the first claim\'s write');
    } finally { c1.release(); c2.release(); }

    let exactlyOne = 0;
    for (let i = 0; i < 25; i++) {
      const p = await seed({ accounts: 2 });
      const [r1, r2] = await Promise.all([claim(p.user, p.ids[0]), claim(p.user, p.ids[1])]);
      if ([r1, r2].filter(r => !r.sibling_active).length === 1) exactlyOne++;
    }
    assert.equal(exactlyOne, 25);
    ok('25/25 simultaneous sibling claims: exactly one is told to revoke the shared Item');

    const d = await seed({ accounts: 1 });
    const dup = await Promise.all([claim(d.user, d.ids[0]), claim(d.user, d.ids[0]), claim(d.user, d.ids[0])]);
    assert.ok(dup.every(r => r.account_status === 'disconnecting' && r.sibling_active === false));
    ok('duplicate simultaneous requests for one account all serialize to the same consistent answer');
  }

  // ------------------------------------------------ SQL: sync interaction
  console.log('\ninteraction with sync and reconnect');
  {
    // The WHERE clause PostgREST builds from beginBankSync's filter chain
    // (.eq id .eq user_id .neq disconnected .neq disconnecting .or(...)).
    const syncClaim = (user, id) => asService(c => c.query(
      `update connected_accounts set sync_status='syncing' where id=$1 and user_id=$2
         and sync_status <> 'disconnected' and sync_status <> 'disconnecting'
         and (sync_status <> 'syncing' or updated_date < now() - interval '15 minutes') returning id`, [id, user]));
    const s = await seed({ accounts: 1 });
    await claim(s.user, s.ids[0]);
    assert.equal((await syncClaim(s.user, s.ids[0])).rowCount, 0);
    ok('a sync cannot claim an account that is disconnecting');

    const s2 = await seed({ accounts: 1 });
    assert.equal((await syncClaim(s2.user, s2.ids[0])).rowCount, 1);
    await claim(s2.user, s2.ids[0]);
    const done = await asService(c => c.query(`update connected_accounts set sync_status='connected' where id=$1 and user_id=$2 and sync_status='syncing' returning id`, [s2.ids[0], s2.user]));
    const failed = await asService(c => c.query(`update connected_accounts set sync_status='error' where id=$1 and user_id=$2 and sync_status='syncing' returning id`, [s2.ids[0], s2.user]));
    assert.equal(done.rowCount + failed.rowCount, 0);
    assert.equal(await status(s2.ids[0]), 'disconnecting');
    ok('a sync already in flight when disconnect starts cannot complete or fail its way back out of disconnecting');

    // Row lock: a sync claim racing a held disconnect claim waits, then misses.
    const s3 = await seed({ accounts: 1 });
    const c1 = await pool.connect();
    try {
      await c1.query('begin'); await c1.query('set local role service_role');
      await c1.query('select * from public.claim_bank_disconnect($1, $2)', [s3.user, s3.ids[0]]);
      const racing = syncClaim(s3.user, s3.ids[0]);
      await new Promise(r => setTimeout(r, 300));
      await c1.query('commit');
      assert.equal((await racing).rowCount, 0);
      ok('a sync claim racing an uncommitted disconnect claim waits on the row lock, then matches nothing');
    } finally { c1.release(); }

    const asUser = (user, sql, params) => asRole('authenticated', user, c => c.query(sql, params));
    const s4 = await seed({ accounts: 2 });
    const [live, other] = s4.ids;
    await assert.rejects(() => asUser(s4.user, `update connected_accounts set sync_status='disconnected' where id=$1`, [live]), e => e.code === '42501');
    assert.equal(await status(live), 'connected'); assert.equal(await creds(live), 1);
    ok('a signed-in client can no longer skip the server by writing disconnected directly');

    await assert.rejects(() => asUser(s4.user, 'delete from connected_accounts where id=$1', [live]), e => e.code === '42501');
    assert.equal(await creds(live), 1);
    ok('a signed-in client can no longer delete a bank row (which would cascade the credential away unrevoked)');

    await asService(c => c.query(`update connected_accounts set sync_status='reconnect_required' where id=$1`, [live]));
    await asUser(s4.user, `update connected_accounts set sync_status='connected', error_message=null where id=$1`, [live]);
    assert.equal(await status(live), 'connected');
    ok('the reconnect flow (reconnect_required -> connected from the client) still works');

    await claim(s4.user, other);
    await assert.rejects(() => asUser(s4.user, `update connected_accounts set sync_status='connected' where id=$1`, [other]), e => e.code === '42501');
    assert.equal(await status(other), 'disconnecting');
    ok('a client cannot resurrect an account that is disconnecting (e.g. a stale reconnect completing)');

    const stranger = await seed({ accounts: 1 });
    const hit = await asUser(stranger.user, `update connected_accounts set account_name='x' where id=$1`, [live]);
    assert.equal(hit.rowCount, 0);
    ok("row-level security still keeps another user's bank rows out of reach");
  }

  // ------------------------------------------ real handler + real database
  console.log('\nreal plaid-disconnect-account handler against the real database');
  const handlerSrc = read('supabase/functions/plaid-disconnect-account/index.ts').replace(/^import .*;\r?\n/gm, '');
  const sharedSrc = ['supabase/functions/_shared/plaidEnvironment.ts', 'supabase/functions/_shared/bankDisconnect.ts']
    .map(f => read(f).replace(/^import .*;\r?\n/gm, '').replace(/^export /gm, '')).join('\n');
  const handlerJs = (await transform(sharedSrc + '\n' + handlerSrc, { loader: 'ts' })).code;
  const tokenJs = (await transform(read('supabase/functions/_shared/plaidToken.ts').replace(/^export async function/m, 'async function'), { loader: 'ts' })).code;

  function makeHandler({ userId, plaid = 'success', faults = {}, configured = true, sandboxSecret = true }) {
    const log = { removed: [], configs: [] };
    const secrets = { PLAID_SECRET: 'production-secret', PLAID_SANDBOX_SECRET: sandboxSecret ? 'sandbox-secret' : undefined };
    const admin = {
      async rpc(name, args) {
        assert.ok(['claim_bank_disconnect', 'finalize_bank_disconnect'].includes(name));
        if (faults[name] > 0) { faults[name]--; return { data: null, error: { code: '08006', message: 'synthetic connection loss' } }; }
        try {
          const r = await asService(c => c.query(`select * from public.${name}($1, $2)`, [args.p_user_id, args.p_account_id]));
          return { data: name === 'claim_bank_disconnect' ? r.rows : r.rows[0]?.[name], error: null };
        } catch (e) { return { data: null, error: { code: e.code, message: e.message } }; }
      },
      // Exactly the two reads _shared/plaidToken.ts performs.
      from(table) {
        assert.ok(table === 'plaid_credentials' || table === 'connected_accounts');
        return { select: cols => ({ eq: (col, val) => ({ maybeSingle: async () => {
          if (faults[`read:${table}`] > 0) { faults[`read:${table}`]--; return { data: null, error: { message: 'synthetic read outage' } }; }
          assert.ok((table === 'plaid_credentials' && cols === 'access_token' && col === 'connected_account_id') || (table === 'connected_accounts' && cols === 'access_token_ref' && col === 'id'));
          const r = await asService(c => c.query(`select ${cols} from public.${table} where ${col} = $1`, [val]));
          return { data: r.rows[0] || null, error: null };
        } }) }) };
      },
    };
    class PlaidApi {
      async itemRemove({ access_token }) {
        log.removed.push(access_token);
        if (plaid === 'error') { const e = new Error('provider down'); e.response = { data: { error_code: 'INTERNAL_SERVER_ERROR' } }; throw e; }
        if (plaid === 'not-found') { const e = new Error('gone'); e.response = { data: { error_code: 'ITEM_NOT_FOUND' } }; throw e; }
        return { data: {} };
      }
    }
    let handler;
    const sandbox = {
      Deno: { serve: fn => { handler = fn; }, env: { get: k => (!configured && k.startsWith('PLAID') ? undefined : k in secrets ? secrets[k] : 'fixture') } },
      getUser: async () => (userId ? { id: userId } : null), serviceClient: () => admin,
      Configuration: class { constructor(options) { log.configs.push(options); } },
      PlaidEnvironments: { production: 'https://production.plaid.com', sandbox: 'https://sandbox.plaid.com' }, PlaidApi,
      handleOptions: () => null, jsonResponse: (body, st = 200) => ({ status: st, body }),
      errorResponse: (message, st) => ({ status: st, body: { error: message } }),
      enforceRateLimit: async () => null, identityFromRequest: () => 'fixture', RULES: { sync: {} },
      console: { log() {}, error() {}, warn() {} },
    };
    vm.runInNewContext(tokenJs, sandbox);
    vm.runInNewContext(handlerJs, sandbox);
    const call = id => handler({ method: 'POST', json: async () => ({ connected_account_id: id }) });
    return { call, log };
  }

  {
    const s = await seed({ accounts: 1 });
    const anon = makeHandler({ userId: null });
    assert.equal((await anon.call(s.ids[0])).status, 401);
    const stranger = await seed({ accounts: 1 });
    const intruder = makeHandler({ userId: stranger.user });
    assert.equal((await intruder.call(s.ids[0])).status, 404);
    assert.equal(await status(s.ids[0]), 'connected'); assert.equal(await creds(s.ids[0]), 1);
    ok("unauthenticated is rejected; another user's account id reads as not found and is untouched");

    await asService(c => c.query(`insert into bank_sync_logs(user_id, provider, connected_account_id, started_at, status) values ($1,'plaid',$2, now(),'success')`, [s.user, s.ids[0]]));
    const h = makeHandler({ userId: s.user });
    const res = await h.call(s.ids[0]);
    assert.equal(res.status, 200); assert.deepEqual(h.log.removed, [s.token]);
    assert.equal(await status(s.ids[0]), 'disconnected'); assert.equal(await creds(s.ids[0]), 0);
    assert.equal(Number((await pool.query('select count(*) from bank_sync_logs where connected_account_id=$1', [s.ids[0]])).rows[0].count), 1);
    ok('single account: the Item is revoked once, the credential is deleted, the account row and its history remain');

    assert.equal((await h.call(s.ids[0])).status, 200); assert.equal(h.log.removed.length, 1);
    ok('calling again after completion succeeds without another revocation');
  }
  {
    let perfect = 0;
    for (let i = 0; i < 10; i++) {
      const s = await seed({ accounts: 2 });
      const h = makeHandler({ userId: s.user });
      const [r1, r2] = await Promise.all([h.call(s.ids[0]), h.call(s.ids[1])]);
      const good = r1.status === 200 && r2.status === 200 && h.log.removed.length === 1
        && (await status(s.ids[0])) === 'disconnected' && (await status(s.ids[1])) === 'disconnected'
        && (await creds(s.ids[0])) + (await creds(s.ids[1])) === 0;
      if (good) perfect++;
    }
    assert.equal(perfect, 10);
    ok('10/10 simultaneous disconnects of two siblings: the shared Item is revoked exactly once, nothing left behind');
  }
  {
    const s = await seed({ accounts: 2 });
    const [a, b] = s.ids;
    const h = makeHandler({ userId: s.user, faults: { finalize_bank_disconnect: 1 } });
    assert.equal((await h.call(a)).status, 503);
    assert.equal(await status(a), 'disconnecting'); assert.equal(await creds(a), 1);
    assert.equal((await h.call(a)).status, 200);
    assert.equal(h.log.removed.length, 0, 'the sibling still uses the Item - it must never be revoked, first attempt or retry');
    assert.equal(await status(a), 'disconnected'); assert.equal(await creds(a), 0);
    assert.equal(await status(b), 'connected'); assert.equal(await creds(b), 1);
    ok('sibling still connected + cleanup failure: stays visible as disconnecting, retry finishes, shared Item never revoked');
  }
  {
    const s = await seed({ accounts: 1 });
    const failing = makeHandler({ userId: s.user, plaid: 'error' });
    assert.equal((await failing.call(s.ids[0])).status, 503);
    assert.equal(await status(s.ids[0]), 'disconnecting'); assert.equal(await creds(s.ids[0]), 1);
    const retry = makeHandler({ userId: s.user, plaid: 'not-found' });
    assert.equal((await retry.call(s.ids[0])).status, 200);
    assert.equal(await status(s.ids[0]), 'disconnected'); assert.equal(await creds(s.ids[0]), 0);
    ok('provider failure keeps the credential and a visible disconnecting state; a retry that finds the Item already gone finishes');
  }
  {
    const s = await seed({ accounts: 1 });
    const h = makeHandler({ userId: s.user, faults: { 'read:plaid_credentials': 1 } });
    assert.equal((await h.call(s.ids[0])).status, 503);
    assert.equal(h.log.removed.length, 0);
    assert.equal(await status(s.ids[0]), 'disconnecting'); assert.equal(await creds(s.ids[0]), 1);
    ok('a failed credential read (real plaidToken.ts) is not treated as "nothing to revoke"');

    const unconfigured = makeHandler({ userId: s.user, configured: false });
    assert.equal((await unconfigured.call(s.ids[0])).status, 503);
    assert.equal(await creds(s.ids[0]), 1);
    ok('missing Plaid configuration fails safely, credential kept');
  }
  {
    const s = await seed({ accounts: 1 });
    const h = makeHandler({ userId: s.user });
    const results = await Promise.all([h.call(s.ids[0]), h.call(s.ids[0]), h.call(s.ids[0])]);
    assert.ok(results.every(r => r.status === 200));
    assert.ok(h.log.removed.length >= 1 && h.log.removed.length <= 3);
    assert.equal(await status(s.ids[0]), 'disconnected'); assert.equal(await creds(s.ids[0]), 0);
    ok('duplicate simultaneous requests all succeed and leave a clean final state (extra revocations are idempotent at Plaid)');
  }
  {
    // An account disconnected by the old client-only path: still holding a
    // live credential. A new disconnect request finishes the job.
    const s = await seed({ accounts: 1 });
    await asService(c => c.query(`update connected_accounts set sync_status='disconnected' where id=$1`, [s.ids[0]]));
    const h = makeHandler({ userId: s.user });
    assert.equal((await h.call(s.ids[0])).status, 200);
    assert.deepEqual(h.log.removed, [s.token]); assert.equal(await creds(s.ids[0]), 0);
    ok('a legacy disconnected account still holding a credential is revoked and cleaned when disconnect is requested');
  }

  {
    // Plaid Sandbox items (listed test accounts) are revoked in the sandbox
    // with the sandbox secret; a real item keeps production.
    const real = await seed({ accounts: 1, tokenPrefix: 'access-production-' });
    const hr = makeHandler({ userId: real.user });
    assert.equal((await hr.call(real.ids[0])).status, 200);
    assert.equal(hr.log.configs[0].basePath, 'https://production.plaid.com');
    assert.equal(hr.log.configs[0].baseOptions.headers['PLAID-SECRET'], 'production-secret');

    const test = await seed({ accounts: 1, tokenPrefix: 'access-sandbox-' });
    const missing = makeHandler({ userId: test.user, sandboxSecret: false });
    assert.equal((await missing.call(test.ids[0])).status, 503);
    assert.equal(missing.log.removed.length, 0, 'a sandbox item is never sent to production');
    assert.equal(await status(test.ids[0]), 'disconnecting'); assert.equal(await creds(test.ids[0]), 1);

    const hs = makeHandler({ userId: test.user });
    assert.equal((await hs.call(test.ids[0])).status, 200);
    assert.deepEqual(hs.log.removed, [test.token]);
    assert.equal(hs.log.configs[0].basePath, 'https://sandbox.plaid.com');
    assert.equal(hs.log.configs[0].baseOptions.headers['PLAID-SECRET'], 'sandbox-secret');
    assert.equal(await status(test.ids[0]), 'disconnected'); assert.equal(await creds(test.ids[0]), 0);
    ok('Plaid Sandbox items revoke in the sandbox with its own secret; without it they stay visible and retryable, never sent to production');
  }
  // ------------------------------------------------------------------------
  // retire-legacy-bank-credentials: operator cleanup of accounts disconnected
  // before plaid-disconnect-account existed. Real handler + the shared
  // completeBankDisconnect + real claim/finalize + real plaidToken.ts.
  console.log('\nretire-legacy-bank-credentials (operator cleanup), real database, fake Plaid');
  const cleanupSrc = read('supabase/functions/retire-legacy-bank-credentials/index.ts').replace(/^import .*;\r?\n/gm, '');
  const cleanupJs = (await transform(sharedSrc + '\n' + cleanupSrc, { loader: 'ts' })).code;
  const SAFE = /^[a-z_]+$/;
  // The PostgREST subset the cleanup and plaidToken.ts use, run as service_role.
  function restAdmin(faults = {}) {
    const from = table => {
      assert.ok(['connected_accounts', 'plaid_credentials'].includes(table), table);
      let cols = '*'; const where = []; const params = [];
      const run = async () => {
        if (faults[`read:${table}`] > 0) { faults[`read:${table}`]--; return { data: null, error: { message: 'synthetic read outage' } }; }
        assert.ok(cols.split(',').every(c => SAFE.test(c.trim())), cols);
        const r = await asService(c => c.query(`select ${cols} from public.${table}${where.length ? ' where ' + where.join(' and ') : ''}`, params));
        return { data: r.rows, error: null };
      };
      const q = {
        select(c) { cols = c; return q; },
        eq(c, v) { assert.match(c, SAFE); params.push(v); where.push(`${c} = $${params.length}`); return q; },
        in(c, arr) { assert.match(c, SAFE); params.push(arr.map(String)); where.push(`${c}::text = any($${params.length}::text[])`); return q; },
        not(c, op, v) {
          assert.match(c, SAFE);
          if (op === 'is' && v === null) where.push(`${c} is not null`);
          else if (op === 'in') { params.push(v.replace(/^\(|\)$/g, '').split(',')); where.push(`not (${c}::text = any($${params.length}::text[]))`); }
          else throw new Error(`unsupported not(${op})`);
          return q;
        },
        async maybeSingle() { const r = await run(); return { data: r.data?.[0] ?? null, error: r.error }; },
        then(resolve, reject) { return run().then(resolve, reject); },
      };
      return q;
    };
    return {
      from,
      async rpc(name, args) {
        assert.ok(['claim_bank_disconnect', 'finalize_bank_disconnect'].includes(name));
        if (faults[name] > 0) { faults[name]--; return { data: null, error: { code: '08006', message: 'synthetic connection loss' } }; }
        try {
          const r = await asService(c => c.query(`select * from public.${name}($1, $2)`, [args.p_user_id, args.p_account_id]));
          return { data: name === 'claim_bank_disconnect' ? r.rows : r.rows[0]?.[name], error: null };
        } catch (e) { return { data: null, error: { code: e.code, message: e.message } }; }
      },
    };
  }
  function makeCleanup({ system = true, plaid = {}, faults = {}, onRemove = null, sandboxSecret = true } = {}) {
    const log = { removed: [], configs: [], output: [] };
    const secrets = { PLAID_CLIENT_ID: 'client-fixture', PLAID_SECRET: 'production-secret', PLAID_SANDBOX_SECRET: sandboxSecret ? 'sandbox-secret' : undefined };
    class PlaidApi {
      async itemRemove({ access_token }) {
        log.removed.push(access_token);
        if (onRemove) await onRemove(access_token);
        const mode = plaid[access_token];
        if (mode === 'error') { const e = new Error('provider down'); e.response = { data: { error_code: 'INTERNAL_SERVER_ERROR', access_token } }; throw e; }
        if (mode === 'not-found') { const e = new Error('gone'); e.response = { data: { error_code: 'ITEM_NOT_FOUND' } }; throw e; }
        return { data: {} };
      }
    }
    let handler;
    const sandbox = {
      Deno: { serve: fn => { handler = fn; }, env: { get: k => secrets[k] } },
      serviceClient: () => restAdmin(faults),
      requireSystemCaller: async (_req, _admin, json) => (system ? null : json({ error: 'Unauthorized' }, 401)),
      Configuration: class { constructor(o) { log.configs.push(o); } },
      PlaidEnvironments: { production: 'https://production.plaid.com', sandbox: 'https://sandbox.plaid.com' }, PlaidApi,
      handleOptions: () => null,
      jsonResponse: (body, st = 200) => { log.output.push(JSON.stringify(body)); return { status: st, body }; },
      errorResponse: (message, st, opts) => { log.output.push(message, String(opts?.internal?.message ?? '')); return { status: st, body: { error: message } }; },
      console: { log: (...a) => log.output.push(a.join(' ')), error: (...a) => log.output.push(a.join(' ')), warn: (...a) => log.output.push(a.join(' ')) },
    };
    vm.runInNewContext(tokenJs, sandbox);
    vm.runInNewContext(cleanupJs, sandbox);
    const call = (body = {}, method = 'POST') => handler({ method, json: async () => body });
    return { call, log };
  }
  const markLegacy = id => pool.query(`update connected_accounts set sync_status = 'disconnected' where id = $1`, [id]);
  const removedCount = (log, token) => log.removed.filter(t => t === token).length;
  const leaks = (log, tokens) => {
    const text = log.output.join('\n');
    return tokens.filter(t => text.includes(t)).concat(/Fixture Bank|Account \d/.test(text) ? ['financial detail'] : []);
  };
  {
    // Clear earlier scenarios' rows so counts below are exact.
    await pool.query('delete from auth.users');
    const alone = await seed({ accounts: 1 }); await markLegacy(alone.ids[0]);
    const shared = await seed({ accounts: 2 }); await markLegacy(shared.ids[0]);
    const pair = await seed({ accounts: 2 }); await markLegacy(pair.ids[0]); await markLegacy(pair.ids[1]);
    const control = await seed({ accounts: 1 });
    const clean = await seed({ accounts: 1 }); await claim(clean.user, clean.ids[0]); await finalize(clean.user, clean.ids[0]);
    const stuck = await seed({ accounts: 1 }); await claim(stuck.user, stuck.ids[0]);
    const sandboxItem = await seed({ accounts: 1, tokenPrefix: 'access-sandbox-' }); await markLegacy(sandboxItem.ids[0]);
    const busy = await seed({ accounts: 2 }); await markLegacy(busy.ids[0]);
    await pool.query(`update connected_accounts set sync_status = 'syncing' where id = $1`, [busy.ids[1]]);
    const allTokens = [alone, shared, pair, control, clean, stuck, sandboxItem, busy].map(s => s.token);
    const snapshot = async () => (await pool.query(`select string_agg(id::text || sync_status || coalesce((select count(*) from plaid_credentials p where p.connected_account_id = c.id), 0)::text, ',' order by id) as s from connected_accounts c`)).rows[0].s;

    // Auth and method first: nothing is read or changed.
    const denied = makeCleanup({ system: false });
    assert.equal((await denied.call({ dry_run: false, confirm: 8 })).status, 401);
    assert.equal((await makeCleanup().call({}, 'GET')).status, 405);
    ok('cleanup: non-system callers get 401 and GET 405, before anything is read');

    // Dry run: lists exactly the accounts that still hold bank access or are unfinished.
    const before = await snapshot();
    const dry = makeCleanup();
    const d = await dry.call({});
    assert.equal(d.status, 200); assert.equal(d.body.dry_run, true);
    const listed = d.body.accounts.map(a => a.account_id).sort();
    const expected = [alone.ids[0], shared.ids[0], pair.ids[0], pair.ids[1], stuck.ids[0], sandboxItem.ids[0], busy.ids[0]].sort();
    assert.deepEqual(listed, expected, 'connected, syncing and already-clean accounts are not candidates');
    assert.equal(d.body.candidates, 7); assert.equal(d.body.unfinished_disconnecting, 1); assert.equal(d.body.disconnected_with_credential, 6);
    assert.deepEqual(d.body.accounts.filter(a => a.shared_item_in_use).map(a => a.account_id).sort(), [shared.ids[0], busy.ids[0]].sort());
    assert.equal(dry.log.removed.length, 0); assert.equal(await snapshot(), before, 'a dry run changes nothing');
    assert.deepEqual(leaks(dry.log, allTokens), []);
    ok('cleanup dry run: lists only disconnected accounts still holding a credential plus unfinished disconnects, flags shared Items still in use, no Plaid call, no change, no tokens or financial details');

    // Executing requires confirming the count just seen.
    for (const body of [{ dry_run: false }, { dry_run: false, confirm: 6 }, { dry_run: false, confirm: '7' }]) {
      const r = await makeCleanup().call(body);
      assert.equal(r.status, 409, JSON.stringify(body));
    }
    assert.equal(await snapshot(), before);
    ok('cleanup execute refuses without confirm equal to the current candidate count; nothing changes');

    // Full run with a provider failure, an Item already removed at Plaid, and a
    // sandbox Item. Every outcome is checked against the database.
    const remaining = 7;
    const run = makeCleanup({ plaid: { [alone.token]: 'error', [stuck.token]: 'not-found' } });
    const r = await run.call({ dry_run: false, confirm: remaining, limit: 100 });
    assert.equal(r.status, 502, 'a retryable failure is reported as partial');
    assert.equal(r.body.retry, 1);
    const outcome = id => r.body.results.find(x => x.account_id === id)?.outcome;
    // Provider failure: credential kept, still disconnected, retryable next run.
    assert.equal(outcome(alone.ids[0]), 'retry'); assert.equal(r.body.results.find(x => x.account_id === alone.ids[0]).reason, 'provider');
    assert.equal(await creds(alone.ids[0]), 1); assert.equal(await status(alone.ids[0]), 'disconnected');
    // Shared with a connected sibling: only this copy goes; Item not revoked; sibling untouched.
    assert.equal(removedCount(run.log, shared.token), 0, 'an Item a connected sibling uses is never revoked');
    assert.equal(await creds(shared.ids[0]), 0); assert.equal(await status(shared.ids[1]), 'connected'); assert.equal(await creds(shared.ids[1]), 1);
    // Sibling mid-sync counts as in use too.
    assert.equal(removedCount(run.log, busy.token), 0);
    assert.equal(await creds(busy.ids[0]), 0); assert.equal(await status(busy.ids[1]), 'syncing'); assert.equal(await creds(busy.ids[1]), 1);
    // Two disconnected siblings sharing an Item: removed once, both cleaned.
    assert.equal(removedCount(run.log, pair.token), 1, 'one removal call per Item in a run');
    for (const id of pair.ids) { assert.equal(await creds(id), 0); assert.equal(await status(id), 'disconnected'); }
    // Unfinished disconnect whose Item Plaid already removed: finished.
    assert.equal(await status(stuck.ids[0]), 'disconnected'); assert.equal(await creds(stuck.ids[0]), 0);
    // Sandbox Item: removed in the sandbox with its own secret.
    const sandboxConfigs = run.log.configs.filter(c => c.basePath === 'https://sandbox.plaid.com');
    assert.equal(sandboxConfigs.length, 1); assert.equal(sandboxConfigs[0].baseOptions.headers['PLAID-SECRET'], 'sandbox-secret');
    assert.equal(await creds(sandboxItem.ids[0]), 0);
    // Controls untouched; history kept.
    assert.equal(await status(control.ids[0]), 'connected'); assert.equal(await creds(control.ids[0]), 1);
    assert.equal(Number((await pool.query('select count(*) from connected_accounts')).rows[0].count), 11, 'rows are kept; only credentials go');
    assert.deepEqual(leaks(run.log, allTokens), [], 'no token, institution or account name in output or logs, including the provider error');
    ok('cleanup execute: revokes only Items no connected or syncing sibling uses (once per Item), finishes unfinished disconnects, routes sandbox Items to the sandbox, keeps failures retryable, never logs tokens or financial details');

    // Repeat: the failed one is retried; then nothing is left; repeating changes nothing.
    const again = (await makeCleanup().call({})).body;
    assert.equal(again.candidates, 1); assert.equal(again.accounts[0].account_id, alone.ids[0]);
    const fix = makeCleanup();
    assert.equal((await fix.call({ dry_run: false, confirm: 1 })).status, 200);
    assert.equal(await creds(alone.ids[0]), 0); assert.equal(removedCount(fix.log, alone.token), 1);
    const idle = makeCleanup();
    const last = await idle.call({ dry_run: false, confirm: 0 });
    assert.equal(last.status, 200); assert.equal(last.body.processed, 0); assert.equal(idle.log.removed.length, 0);
    ok('cleanup repeated: the failed account succeeds next run; afterwards there are no candidates and runs make no Plaid calls');
  }
  {
    // Concurrency with the user's own Disconnect on the same legacy account.
    let perfect = 0;
    for (let i = 0; i < 5; i++) {
      const s = await seed({ accounts: 1 }); await markLegacy(s.ids[0]);
      const op = makeCleanup(); const user = makeHandler({ userId: s.user });
      const count = (await makeCleanup().call({})).body.candidates;
      const [a, b] = await Promise.all([op.call({ dry_run: false, confirm: count, limit: 100 }), user.call(s.ids[0])]);
      if ([200].includes(a.status) && b.status === 200 && (await creds(s.ids[0])) === 0 && (await status(s.ids[0])) === 'disconnected') perfect++;
    }
    assert.equal(perfect, 5);
    ok('cleanup and the user Disconnect at the same time (5/5): both succeed and leave the account clean (extra removals are idempotent at Plaid)');

    // Account deletion finishing while the cleanup is mid-flight: reported as gone, no error.
    const s = await seed({ accounts: 1 }); await markLegacy(s.ids[0]);
    const count = (await makeCleanup().call({})).body.candidates;
    const racing = makeCleanup({ onRemove: async token => { if (token === s.token) await pool.query('delete from auth.users where id = $1', [s.user]); } });
    const res = await racing.call({ dry_run: false, confirm: count, limit: 100 });
    assert.equal(res.body.results.find(x => x.account_id === s.ids[0]).outcome, 'already_gone');
    assert.equal(Number((await pool.query('select count(*) from connected_accounts where id = $1', [s.ids[0]])).rows[0].count), 0);
    ok('cleanup racing an account deletion: the account is reported already gone, not an error');

    // A transient database failure mid-run keeps that account's credential for the next run.
    const t = await seed({ accounts: 1 }); await markLegacy(t.ids[0]);
    const n = (await makeCleanup().call({})).body.candidates;
    const flaky = makeCleanup({ faults: { finalize_bank_disconnect: 1 } });
    const fr = await flaky.call({ dry_run: false, confirm: n, limit: 100 });
    assert.equal(fr.status, 502); assert.equal(fr.body.results.find(x => x.account_id === t.ids[0]).reason, 'finalize');
    assert.equal(await creds(t.ids[0]), 1);
    assert.equal((await makeCleanup().call({ dry_run: false, confirm: 1 })).status, 200);
    assert.equal(await creds(t.ids[0]), 0);
    ok('cleanup with a database failure before finalize: credential kept, reported for retry, next run finishes it');

    // Limit: at most `limit` accounts per run; the rest wait for the next one.
    for (let i = 0; i < 3; i++) { const x = await seed({ accounts: 1 }); await markLegacy(x.ids[0]); }
    const l = await makeCleanup().call({ dry_run: false, confirm: 3, limit: 1 });
    assert.equal(l.status, 200); assert.equal(l.body.processed, 1); assert.equal(l.body.not_processed_this_run, 2);
    assert.equal((await makeCleanup().call({})).body.candidates, 2);
    assert.equal((await makeCleanup().call({ dry_run: false, confirm: 2 })).status, 200);
    assert.equal((await makeCleanup().call({})).body.candidates, 0);
    ok('cleanup limit processes at most the requested number per run; the next run picks up the rest');
  }
  console.log(`\nAll ${passed} checks passed against real PostgreSQL.`);
} finally {
  await pool?.end().catch(() => {});
  await server.stop().catch(() => {});
  fs.rmSync(dataDir, { recursive: true, force: true });
}
