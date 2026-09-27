// stripe-webhook against a REAL PostgreSQL 17 (local, throwaway): the
// subscriptions table from schema.sql plus the real migrations, and the real
// handler. Stripe is a fake whose "current state" per subscription the test
// controls; every id and event is synthetic. No network, no Stripe account.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { transform } from 'esbuild';
import EmbeddedPostgres from 'embedded-postgres';
import pgPkg from 'pg';

const read = p => fs.readFileSync(p, 'utf8');
const schema = read('supabase/schema.sql');
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yorbit-webhook-sql-'));
const port = 55000 + Math.floor(Math.random() * 4000);
const server = new EmbeddedPostgres({ databaseDir: dataDir, user: 'postgres', password: 'local-test-only', port, persistent: false, onLog: () => {}, onError: () => {} });
let pool; let passed = 0;
const ok = label => { passed++; console.log(`  PASS  ${label}`); };

// Mirrors the entitlement rule in src/hooks/useProStatus.js (asserted below).
const entitled = rows => rows.some(r => ['active', 'trialing'].includes(r.status) && r.plan && r.plan !== 'free');
const rowsFor = async user => (await pool.query('select stripe_subscription_id, plan, status from subscriptions where user_id=$1 order by created_date', [user])).rows;

const COLS = new Set(['id', 'user_id', 'provider', 'stripe_customer_id', 'stripe_subscription_id', 'plan', 'status', 'current_period_end', 'cancel_at_period_end']);
async function asService(sql, params) {
  const c = await pool.connect();
  try { await c.query('begin'); await c.query('set local role service_role'); const r = await c.query(sql, params); await c.query('commit'); return r; }
  catch (e) { await c.query('rollback').catch(() => {}); throw e; }
  finally { c.release(); }
}
// The subset of supabase-js the handler uses, executed as real SQL.
function queryBuilder(table, op, payload) {
  assert.equal(table, 'subscriptions');
  const where = []; const params = []; let limit = null; let columns = '*';
  const col = c => { assert.ok(COLS.has(c), c); return c; };
  const api = {
    select(cols) { columns = cols.split(',').map(s => col(s.trim())).join(', '); return api; },
    eq(c, v) { params.push(v); where.push(`${col(c)} = $${params.length}`); return api; },
    is(c, v) { assert.equal(v, null); where.push(`${col(c)} is null`); return api; },
    limit(n) { limit = n; return api; },
    then(resolve, reject) {
      let sql;
      if (op === 'select') sql = `select ${columns} from public.subscriptions${where.length ? ' where ' + where.join(' and ') : ''}${limit ? ` limit ${Number(limit)}` : ''}`;
      if (op === 'update') {
        const keys = Object.keys(payload).map(col);
        const base = params.length;
        sql = `update public.subscriptions set ${keys.map((k, i) => `${k} = $${base + i + 1}`).join(', ')} where ${where.join(' and ')}`;
        params.push(...keys.map(k => payload[k]));
      }
      if (op === 'insert') {
        const keys = Object.keys(payload).map(col);
        sql = `insert into public.subscriptions (${keys.join(', ')}) values (${keys.map((_, i) => `$${i + 1}`).join(', ')})`;
        params.push(...keys.map(k => payload[k]));
      }
      return asService(sql, params)
        .then(r => ({ data: r.rows, error: null }), e => ({ data: null, error: { code: e.code, message: e.message } }))
        .then(resolve, reject);
    },
  };
  return api;
}
const admin = { from: table => ({ select: cols => queryBuilder(table, 'select').select(cols), update: p => queryBuilder(table, 'update', p), insert: p => queryBuilder(table, 'insert', p) }) };

const truth = new Map(); // subscription id -> Stripe's current state
const setTruth = (id, customer, status, price = 'price_1UDXISA4mvP1HWCKCxoL3PcL') =>
  truth.set(id, { id, customer, status, items: { data: [{ price: { id: price } }] }, current_period_end: 1893456000, cancel_at_period_end: false });

async function makeHandler({ configured = true } = {}) {
  const policyJs = (await transform(read('supabase/functions/_shared/billing.ts').replace(/^export /gm, ''), { loader: 'ts' })).code;
  const src = read('supabase/functions/stripe-webhook/index.ts').replace(/^import .*;\r?\n/gm, '');
  const js = (await transform(src, { loader: 'ts' })).code;
  class Stripe {
    constructor() {
      this.webhooks = { constructEventAsync: async (body, sig) => { if (sig !== 'valid-synthetic-signature') throw new Error('No signatures found matching the expected signature'); return JSON.parse(body); } };
      this.subscriptions = { retrieve: async id => { const s = truth.get(id); if (!s) throw new Error('No such subscription'); return structuredClone(s); } };
    }
  }
  let handler;
  const sandbox = {
    Deno: { serve: fn => { handler = fn; }, env: { get: () => (configured ? 'synthetic' : undefined) } },
    Stripe, serviceClient: () => admin,
    jsonResponse: (body, status = 200) => ({ status, body }), errorResponse: (message, status) => ({ status, body: { error: message } }),
    console: { log() {}, error() {}, warn() {} },
  };
  vm.runInNewContext(policyJs, sandbox);
  vm.runInNewContext(js, sandbox);
  return (event, signature = 'valid-synthetic-signature') => handler({ text: async () => JSON.stringify(event), headers: { get: () => signature } });
}
const checkout = (sub, customer, user) => ({ type: 'checkout.session.completed', data: { object: { subscription: sub, customer, client_reference_id: user } } });
const subEvent = (type, sub, customer, payloadStatus) => ({ type: `customer.subscription.${type}`, data: { object: { id: sub, customer, status: payloadStatus } } });

let seq = 0;
async function newUser() { const id = `00000000-0000-4000-9000-${String(++seq).padStart(12, '0')}`; await pool.query('insert into auth.users(id) values ($1)', [id]); return { id, customer: `cus_synthetic_${seq}` }; }

try {
  await server.initialise(); await server.start();
  pool = new pgPkg.Pool({ host: 'localhost', port, user: 'postgres', password: 'local-test-only', database: 'postgres', max: 8 });
  await pool.query(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
    create schema auth; create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth, public to anon, authenticated, service_role;`);
  await pool.query(schema.match(/create table if not exists public\.subscriptions \([\s\S]*?\n\);/)[0]);
  await pool.query(`alter table public.subscriptions enable row level security;
    create policy "subscriptions_select_own" on public.subscriptions for select using (auth.uid() = user_id);`);
  await pool.query('grant all on public.subscriptions to authenticated, service_role');
  await pool.query(read('supabase/migrations/20260908234547_restrict_subscription_writes.sql'));
  await pool.query(read('supabase/migrations/20260927130000_unique_stripe_subscription_rows.sql'));
  await pool.query(read('supabase/migrations/20260927140000_app_store_subscriptions.sql'));
  const send = await makeHandler();
  console.log('Real PostgreSQL: subscriptions table from schema.sql + real migrations; real stripe-webhook handler; fake Stripe.\n');

  assert.match(read('src/hooks/useProStatus.js'), /\['active', 'trialing'\]\.includes\(s\.status\) && s\.plan && s\.plan !== 'free'/);

  {
    const u = await newUser();
    setTruth('sub_a1', u.customer, 'trialing');
    assert.equal((await send(checkout('sub_a1', u.customer, u.id))).status, 200);
    assert.ok(entitled(await rowsFor(u.id)));
    ok('checkout (trial) creates the row for the checkout\'s user and grants Pro');

    setTruth('sub_a1', u.customer, 'canceled');
    assert.equal((await send(subEvent('deleted', 'sub_a1', u.customer, 'canceled'))).status, 200);
    assert.equal((await send(subEvent('updated', 'sub_a1', u.customer, 'active'))).status, 200);
    assert.equal((await send(checkout('sub_a1', u.customer, u.id))).status, 200);
    assert.ok(!entitled(await rowsFor(u.id)));
    assert.equal((await rowsFor(u.id)).length, 1);
    ok('a stale "updated: active" and a replayed checkout arriving after cancellation do not restore access');
  }
  {
    const u = await newUser();
    setTruth('sub_b1', u.customer, 'active');
    await send(checkout('sub_b1', u.customer, u.id));
    setTruth('sub_b1', u.customer, 'canceled');
    await send(subEvent('deleted', 'sub_b1', u.customer, 'canceled'));
    setTruth('sub_b2', u.customer, 'active', 'price_1UDXJiA4mvP1HWCKDQ18B5bX');
    await send(checkout('sub_b2', u.customer, u.id));
    assert.equal((await send(subEvent('deleted', 'sub_b1', u.customer, 'canceled'))).status, 200);
    assert.equal((await send(subEvent('updated', 'sub_b1', u.customer, 'active'))).status, 200);
    const rows = await rowsFor(u.id);
    assert.equal(rows.length, 2);
    assert.deepEqual(rows.map(r => `${r.stripe_subscription_id}:${r.status}:${r.plan}`), ['sub_b1:canceled:free', 'sub_b2:active:pro_yearly']);
    assert.ok(entitled(rows));
    ok('resubscribing: replayed events for the old subscription never overwrite the new paid one');
  }
  {
    const u = await newUser();
    setTruth('sub_c1', u.customer, 'active'); await send(checkout('sub_c1', u.customer, u.id));
    setTruth('sub_c1', u.customer, 'past_due'); await send(subEvent('updated', 'sub_c1', u.customer, 'past_due'));
    assert.ok(!entitled(await rowsFor(u.id)));
    setTruth('sub_c1', u.customer, 'active'); await send(subEvent('updated', 'sub_c1', u.customer, 'active'));
    assert.ok(entitled(await rowsFor(u.id)));
    ok('payment failure (past_due) removes access; recovery restores it');

    for (const [stripeStatus, stored] of [['unpaid', 'past_due'], ['paused', 'past_due'], ['incomplete_expired', 'canceled']]) {
      setTruth('sub_c1', u.customer, stripeStatus);
      assert.equal((await send(subEvent('updated', 'sub_c1', u.customer, stripeStatus))).status, 200, stripeStatus);
      const [row] = await rowsFor(u.id);
      assert.equal(row.status, stored); assert.ok(!entitled([row]));
    }
    ok('unpaid / paused / incomplete_expired are stored as no-access states instead of failing the CHECK constraint forever');
  }
  {
    const u = await newUser();
    setTruth('sub_d1', u.customer, 'active');
    assert.equal((await send(subEvent('updated', 'sub_d1', u.customer, 'active'))).status, 500);
    assert.equal((await rowsFor(u.id)).length, 0);
    ok('an event for a subscription with no known owner is retried (500), never guessed');

    assert.equal((await send(checkout('sub_d1', u.customer, u.id), 'forged')).status, 400);
    assert.equal((await rowsFor(u.id)).length, 0);
    const unconfigured = await makeHandler({ configured: false });
    assert.equal((await unconfigured(checkout('sub_d1', u.customer, u.id))).status, 501);
    ok('an invalid signature is rejected before any write; missing configuration returns 501');
  }
  {
    let single = 0;
    for (let i = 0; i < 8; i++) {
      const u = await newUser();
      const sub = `sub_e${i}`;
      setTruth(sub, u.customer, 'active');
      const results = await Promise.all([send(checkout(sub, u.customer, u.id)), send(checkout(sub, u.customer, u.id)), send(subEvent('updated', sub, u.customer, 'active'))]);
      const rows = await rowsFor(u.id);
      if (rows.length === 1 && results.some(r => r.status === 200) && entitled(rows)) single++;
    }
    assert.equal(single, 8);
    ok('8/8 simultaneous duplicate deliveries for a new subscription leave exactly one row (unique index; the loser is retried)');
  }
  {
    const u = await newUser();
    await asService(`insert into public.subscriptions (user_id, stripe_customer_id, plan, status) values ($1, $2, 'pro_monthly', 'active')`, [u.id, u.customer]);
    setTruth('sub_f1', u.customer, 'canceled');
    await send(subEvent('updated', 'sub_f1', u.customer, 'canceled'));
    const rows = await rowsFor(u.id);
    assert.equal(rows.length, 1); assert.equal(rows[0].stripe_subscription_id, 'sub_f1'); assert.ok(!entitled(rows));
    ok('a legacy row not yet tied to a subscription is adopted and updated, not left granting access forever');
  }
  {
    // An App Store entitlement row (written by revenuecat-webhook) beside Stripe.
    const u = await newUser();
    await asService(`insert into public.subscriptions (user_id, provider, plan, status) values ($1, 'app_store', 'pro_yearly', 'active')`, [u.id]);
    setTruth('sub_g1', u.customer, 'canceled');
    await send(checkout('sub_g1', u.customer, u.id));
    await send(subEvent('deleted', 'sub_g1', u.customer, 'canceled'));
    const rows = (await pool.query('select provider, status from subscriptions where user_id=$1 order by provider', [u.id])).rows;
    assert.deepEqual(rows.map(r => `${r.provider}:${r.status}`), ['app_store:active', 'stripe:canceled']);
    ok('Stripe events never adopt or overwrite an App Store entitlement row');
  }
  console.log(`\nAll ${passed} checks passed against real PostgreSQL.`);
} finally {
  await pool?.end().catch(() => {});
  await server.stop().catch(() => {});
  fs.rmSync(dataDir, { recursive: true, force: true });
}
