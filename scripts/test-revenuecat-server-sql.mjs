// Server-side App Store entitlements against a REAL PostgreSQL 17 (local,
// throwaway): profiles and subscriptions from schema.sql plus the real
// migrations, the real revenuecat-webhook and revenuecat-sync handlers and
// the real _shared/revenuecat.ts. RevenueCat's REST API is a fake whose
// "current customer info" the test controls. Every id, key and purchase is
// synthetic; no network, no RevenueCat or Apple account.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { transform } from 'esbuild';
import EmbeddedPostgres from 'embedded-postgres';
import pgPkg from 'pg';

const read = p => fs.readFileSync(p, 'utf8');
const schema = read('supabase/schema.sql');
const ddl = name => schema.match(new RegExp(`create table if not exists public\\.${name} \\([\\s\\S]*?\\n\\);`))[0];
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yorbit-revenuecat-sql-'));
const port = 55000 + Math.floor(Math.random() * 4000);
const server = new EmbeddedPostgres({ databaseDir: dataDir, user: 'postgres', password: 'local-test-only', port, persistent: false, onLog: () => {}, onError: () => {} });
let pool; let passed = 0;
const ok = label => { passed++; console.log(`  PASS  ${label}`); };

const WEBHOOK_AUTH = 'Bearer synthetic-webhook-auth';
const SECRET = 'sk_synthetic_revenuecat_key';

// The same Pro rule ai-coach applies to subscription rows (asserted below).
const entitled = rows => rows.some(s => ['active', 'trialing'].includes(s.status) && s.plan && s.plan !== 'free');
const rowsFor = async user => (await pool.query('select provider, plan, status, cancel_at_period_end, store_product_id, store_environment, stripe_customer_id, stripe_subscription_id from subscriptions where user_id=$1 order by provider', [user])).rows;
const appStoreRows = async user => (await rowsFor(user)).filter(r => r.provider === 'app_store');

async function asService(sql, params) {
  const c = await pool.connect();
  try { await c.query('begin'); await c.query('set local role service_role'); const r = await c.query(sql, params); await c.query('commit'); return r; }
  catch (e) { await c.query('rollback').catch(() => {}); throw e; }
  finally { c.release(); }
}
// The subset of supabase-js these handlers use, executed as real SQL.
const COLS = { subscriptions: new Set(['id', 'user_id', 'provider', 'plan', 'status', 'current_period_end', 'cancel_at_period_end', 'store_product_id', 'store_environment']), profiles: new Set(['id']) };
function builder(table, op, payload) {
  assert.ok(COLS[table], table);
  const col = c => { assert.ok(COLS[table].has(c), `${table}.${c}`); return c; };
  const where = []; const params = []; let columns = '*';
  const api = {
    select(cols) { columns = cols.split(',').map(s => col(s.trim())).join(', '); return api; },
    eq(c, v) { params.push(v); where.push(`${col(c)} = $${params.length}`); return api; },
    in(c, vs) { params.push(Array.from(vs)); where.push(`${col(c)}::text = any($${params.length}::text[])`); return api; },
    then(resolve, reject) {
      let sql;
      if (op === 'select') sql = `select ${columns} from public.${table}${where.length ? ' where ' + where.join(' and ') : ''}`;
      if (op === 'update') {
        const keys = Object.keys(payload).map(col); const base = params.length;
        sql = `update public.${table} set ${keys.map((k, i) => `${k} = $${base + i + 1}`).join(', ')} where ${where.join(' and ')}`;
        params.push(...keys.map(k => payload[k]));
      }
      if (op === 'insert') {
        const keys = Object.keys(payload).map(col);
        sql = `insert into public.${table} (${keys.join(', ')}) values (${keys.map((_, i) => `$${i + 1}`).join(', ')})`;
        params.push(...keys.map(k => payload[k]));
      }
      return asService(sql, params).then(r => ({ data: r.rows, error: null }), e => ({ data: null, error: { code: e.code, message: e.message } })).then(resolve, reject);
    },
  };
  return api;
}
const admin = { from: t => ({ select: c => builder(t, 'select').select(c), update: p => builder(t, 'update', p), insert: p => builder(t, 'insert', p) }) };

// Fake RevenueCat REST API: current customer info per app user id.
const rc = { customers: new Map(), down: false, lookups: [] };
const iso = ms => new Date(ms).toISOString();
const DAY = 864e5;
function customer({ product = 'app.yorbit.pro.yearly', expires = Date.now() + 30 * DAY, grace = null, trial = false, unsubscribed = false, refunded = false, sandbox = true, none = false, badDate = false } = {}) {
  if (none) return { entitlements: {}, subscriptions: {} };
  return {
    entitlements: { pro: { expires_date: badDate ? 'not-a-date' : iso(expires), grace_period_expires_date: grace && iso(grace), product_identifier: product, purchase_date: iso(Date.now() - 40 * DAY) } },
    subscriptions: { [product]: { expires_date: iso(expires), period_type: trial ? 'trial' : 'normal', unsubscribe_detected_at: unsubscribed ? iso(Date.now() - DAY) : null, billing_issues_detected_at: grace ? iso(Date.now() - DAY) : null, is_sandbox: sandbox, refunded_at: refunded ? iso(Date.now() - DAY) : null, store: 'app_store' } },
  };
}
async function fakeFetch(url, opts) {
  const m = /^https:\/\/api\.revenuecat\.com\/v1\/subscribers\/([^/?]+)$/.exec(url);
  assert.ok(m, url); assert.equal(opts.headers.Authorization, `Bearer ${SECRET}`);
  const id = decodeURIComponent(m[1]); rc.lookups.push(id);
  if (rc.down) return { ok: false, status: 500, json: async () => ({}) };
  return { ok: true, status: 200, json: async () => ({ request_date: iso(Date.now()), subscriber: rc.customers.get(id) || customer({ none: true }) }) };
}

async function load(fn, { configured = true, userId = null } = {}) {
  const shared = (await transform(read('supabase/functions/_shared/revenuecat.ts').replace(/^import .*;\r?\n/gm, '').replace(/^export /gm, ''), { loader: 'ts' })).code;
  const js = (await transform(read(`supabase/functions/${fn}/index.ts`).replace(/^import .*;\r?\n/gm, ''), { loader: 'ts' })).code;
  let handler;
  const sandbox = {
    Deno: { serve: f => { handler = f; }, env: { get: k => (configured ? { REVENUECAT_WEBHOOK_AUTH: WEBHOOK_AUTH, REVENUECAT_SECRET_API_KEY: SECRET }[k] : undefined) } },
    timingSafeEqual: crypto.timingSafeEqual, TextEncoder, fetch: fakeFetch, URL,
    serviceClient: () => admin, getUser: async () => (userId ? { id: userId } : null),
    handleOptions: () => null, enforceRateLimit: async () => null, identityFromRequest: () => 'fixture', RULES: { sync: {} },
    jsonResponse: (body, status = 200) => ({ status, body }), errorResponse: (message, status) => ({ status, body: { error: message } }),
    console: { log() {}, error() {}, warn() {} },
  };
  vm.runInNewContext(shared, sandbox);
  vm.runInNewContext(js, sandbox);
  return handler;
}
let webhook;
const deliver = (event, auth = WEBHOOK_AUTH) => webhook({ method: 'POST', headers: { get: k => (k === 'Authorization' ? auth : null) }, json: async () => ({ api_version: '1.0', event }) });

let seq = 0;
async function newUser() {
  const id = `00000000-0000-4000-a000-${String(++seq).padStart(12, '0')}`;
  await pool.query('insert into auth.users(id) values ($1)', [id]);
  await pool.query('insert into public.profiles(id, email) values ($1, $2)', [id, `synthetic${seq}@example.test`]);
  return id;
}

try {
  await server.initialise(); await server.start();
  pool = new pgPkg.Pool({ host: 'localhost', port, user: 'postgres', password: 'local-test-only', database: 'postgres', max: 8 });
  await pool.query(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
    create schema auth; create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth, public to anon, authenticated, service_role;`);
  await pool.query(ddl('profiles'));
  await pool.query(ddl('subscriptions'));
  await pool.query(`alter table public.subscriptions enable row level security;
    create policy "subscriptions_select_own" on public.subscriptions for select using (auth.uid() = user_id);`);
  await pool.query('grant all on public.subscriptions, public.profiles to authenticated, service_role');
  await pool.query(read('supabase/migrations/20260908234547_restrict_subscription_writes.sql'));
  await pool.query(read('supabase/migrations/20260927213555_unique_stripe_subscription_rows.sql'));
  await pool.query(read('supabase/migrations/20260927213604_app_store_subscriptions.sql'));
  webhook = await load('revenuecat-webhook');
  console.log('Real PostgreSQL: profiles + subscriptions from schema.sql and real migrations; real handlers; fake RevenueCat API.\n');

  assert.match(read('supabase/functions/ai-coach/index.ts'), /\['active', 'trialing'\]\.includes\(s\.status\) && s\.plan && s\.plan !== 'free'/);

  // ---------------------------------------------------------------- webhook
  {
    const u = await newUser();
    rc.customers.set(u, customer({ trial: true }));
    assert.equal((await deliver({ type: 'INITIAL_PURCHASE', app_user_id: u }, 'Bearer wrong')).status, 401);
    assert.equal((await deliver({ type: 'INITIAL_PURCHASE', app_user_id: u }, null)).status, 401);
    const unconfigured = await load('revenuecat-webhook', { configured: false });
    assert.equal((await unconfigured({ method: 'POST', headers: { get: () => WEBHOOK_AUTH }, json: async () => ({}) })).status, 501);
    assert.equal(rc.lookups.length, 0); assert.equal((await rowsFor(u)).length, 0);
    ok('a missing or wrong Authorization header is refused before any lookup or write; unconfigured returns 501');

    assert.equal((await deliver({ type: 'INITIAL_PURCHASE', app_user_id: u })).status, 200);
    const [row] = await appStoreRows(u);
    assert.deepEqual({ plan: row.plan, status: row.status, product: row.store_product_id, env: row.store_environment, stripe: row.stripe_subscription_id },
      { plan: 'pro_yearly', status: 'trialing', product: 'app.yorbit.pro.yearly', env: 'sandbox', stripe: null });
    assert.ok(entitled(await rowsFor(u)));
    ok('a trial purchase is recorded from RevenueCat\'s current state and grants Pro server-side');

    rc.customers.set(u, customer({ unsubscribed: true }));
    await deliver({ type: 'CANCELLATION', app_user_id: u });
    let [r] = await appStoreRows(u);
    assert.equal(r.status, 'active'); assert.equal(r.cancel_at_period_end, true); assert.ok(entitled([r]));
    ok('cancelling auto-renew keeps access until the period ends');

    rc.customers.set(u, customer({ expires: Date.now() - DAY, grace: Date.now() + 3 * DAY }));
    await deliver({ type: 'BILLING_ISSUE', app_user_id: u });
    assert.ok(entitled(await appStoreRows(u)));
    rc.customers.set(u, customer({ expires: Date.now() - 5 * DAY, grace: Date.now() - DAY }));
    await deliver({ type: 'EXPIRATION', app_user_id: u });
    [r] = await appStoreRows(u);
    assert.equal(r.status, 'canceled'); assert.equal(r.plan, 'free'); assert.ok(!entitled([r]));
    ok('a billing issue keeps access through Apple\'s grace period, then expiry removes it');

    assert.equal((await deliver({ type: 'INITIAL_PURCHASE', app_user_id: u })).status, 200);
    assert.equal((await deliver({ type: 'RENEWAL', app_user_id: u })).status, 200);
    assert.ok(!entitled(await appStoreRows(u)));
    assert.equal((await appStoreRows(u)).length, 1);
    ok('replayed or out-of-order purchase/renewal events after expiry do not restore access');
  }
  {
    const u = await newUser();
    rc.customers.set(u, customer({}));
    await deliver({ type: 'INITIAL_PURCHASE', app_user_id: u });
    rc.customers.set(u, customer({ refunded: true }));
    await deliver({ type: 'CANCELLATION', app_user_id: u, cancel_reason: 'CUSTOMER_SUPPORT' });
    assert.ok(!entitled(await appStoreRows(u)));
    ok('a refund removes access');
  }
  {
    const from = await newUser(); const to = await newUser();
    rc.customers.set(from, customer({})); await deliver({ type: 'INITIAL_PURCHASE', app_user_id: from });
    rc.customers.set(from, customer({ none: true })); rc.customers.set(to, customer({ product: 'app.yorbit.pro.monthly' }));
    await deliver({ type: 'TRANSFER', app_user_id: to, transferred_from: [from], transferred_to: [to] });
    assert.ok(!entitled(await appStoreRows(from)));
    assert.equal((await appStoreRows(to))[0].plan, 'pro_monthly'); assert.ok(entitled(await appStoreRows(to)));
    ok('a transfer (restore on another account) moves access: the old account loses it, the new one gains it');
  }
  {
    const u = await newUser();
    rc.customers.set(u, customer({}));
    await deliver({ type: 'INITIAL_PURCHASE', app_user_id: '$RCAnonymousID:synthetic', original_app_user_id: '$RCAnonymousID:synthetic', aliases: ['$RCAnonymousID:synthetic', u.toUpperCase()] });
    assert.ok(entitled(await appStoreRows(u)));
    rc.lookups.length = 0;
    const stranger = '00000000-0000-4000-a000-999999999999';
    const res = await deliver({ type: 'INITIAL_PURCHASE', app_user_id: stranger });
    assert.equal(res.status, 200); assert.equal(res.body.synced, 0); assert.equal(rc.lookups.length, 0);
    assert.equal((await deliver({ type: 'TEST', app_user_id: u })).status, 200);
    ok('anonymous ids resolve through aliases; an unknown user is acknowledged without a lookup or write; TEST is a no-op');
  }
  {
    const u = await newUser();
    rc.customers.set(u, customer({}));
    rc.down = true;
    assert.equal((await deliver({ type: 'INITIAL_PURCHASE', app_user_id: u })).status, 500);
    rc.down = false;
    rc.customers.set(u, customer({ badDate: true }));
    assert.equal((await deliver({ type: 'INITIAL_PURCHASE', app_user_id: u })).status, 500);
    assert.equal((await rowsFor(u)).length, 0);
    ok('a RevenueCat outage or an unreadable date fails the delivery (RevenueCat retries) and writes nothing');
  }
  {
    let one = 0;
    for (let i = 0; i < 8; i++) {
      const u = await newUser();
      rc.customers.set(u, customer({}));
      const results = await Promise.all([1, 2, 3].map(() => deliver({ type: 'INITIAL_PURCHASE', app_user_id: u })));
      if (results.every(r => r.status === 200) && (await appStoreRows(u)).length === 1 && entitled(await appStoreRows(u))) one++;
    }
    assert.equal(one, 8);
    ok('8/8 triple concurrent deliveries: all succeed and converge on exactly one App Store row');
  }
  {
    const u = await newUser();
    await asService(`insert into public.subscriptions (user_id, stripe_customer_id, stripe_subscription_id, plan, status) values ($1, 'cus_synthetic', 'sub_synthetic', 'free', 'canceled')`, [u]);
    rc.customers.set(u, customer({}));
    await deliver({ type: 'INITIAL_PURCHASE', app_user_id: u });
    const rows = await rowsFor(u);
    assert.equal(rows.length, 2);
    assert.deepEqual(rows.map(r => `${r.provider}:${r.status}`), ['app_store:active', 'stripe:canceled']);
    assert.ok(entitled(rows));
    ok('an App Store row sits beside a Stripe row without touching it; either one grants Pro');
  }

  // -------------------------------------------------------- user-triggered sync
  {
    const a = await newUser(); const b = await newUser();
    rc.customers.set(a, customer({ product: 'app.yorbit.pro.monthly' })); rc.customers.set(b, customer({}));
    const anon = await load('revenuecat-sync', { userId: null });
    assert.equal((await anon({ method: 'POST', json: async () => ({}) })).status, 401);
    const sync = await load('revenuecat-sync', { userId: a });
    rc.lookups.length = 0;
    const res = await sync({ method: 'POST', json: async () => ({ user_id: b, app_user_id: b }) });
    assert.equal(res.status, 200); assert.deepEqual({ ...res.body }, { isPro: true, plan: 'pro_monthly' });
    assert.deepEqual(rc.lookups, [a], 'only the signed-in caller is looked up, whatever the body says');
    assert.ok(entitled(await appStoreRows(a))); assert.equal((await rowsFor(b)).length, 0);
    ok('sync requires sign-in and only ever syncs the caller\'s own account');

    const c = await newUser();
    const syncC = await load('revenuecat-sync', { userId: c });
    const none = await syncC({ method: 'POST', json: async () => ({}) });
    assert.deepEqual({ ...none.body }, { isPro: false, plan: 'free' }); assert.equal((await rowsFor(c)).length, 0);
    rc.down = true;
    assert.equal((await sync({ method: 'POST', json: async () => ({}) })).status, 503);
    rc.down = false;
    ok('someone who never bought gets no row; a RevenueCat outage returns a retryable 503');
  }
  console.log(`\nAll ${passed} checks passed against real PostgreSQL.`);
} finally {
  await pool?.end().catch(() => {});
  await server.stop().catch(() => {});
  fs.rmSync(dataDir, { recursive: true, force: true });
}
