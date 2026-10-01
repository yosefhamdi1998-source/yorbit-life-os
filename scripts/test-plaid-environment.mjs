import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { transformSync } from 'esbuild';

// Plaid Sandbox routing for listed test accounts: the shared helper, plus the
// real link-token and token-exchange handlers with synthetic Plaid, auth and
// database. Sync, disconnect and deletion routing are covered in their own
// suites (test-bank-sync, test-disconnect-sql, test-account-deletion).
const compile = path => transformSync(fs.readFileSync(path, 'utf8').replace(/^import .*;\r?\n/gm, '').replace(/^export /gm, ''), { loader: 'ts' }).code;
const helperJs = compile('supabase/functions/_shared/plaidEnvironment.ts');
const helper = {};
vm.runInNewContext(`${helperJs}\nObject.assign(out, { plaidEnvironmentOfToken, plaidHost, plaidCredentials, sandboxLinkAllowed });`, { out: helper });

// --- Helper ---
for (const token of ['access-sandbox-1b2c', 'public-sandbox-1b2c']) assert.equal(helper.plaidEnvironmentOfToken(token), 'sandbox', token);
for (const token of ['access-production-1b2c', 'public-production-1b2c', 'access-development-1b2c', 'link-sandbox-1b2c', 'xaccess-sandbox-1', 'ACCESS-SANDBOX-1', 'legacy-token', '', null, undefined]) {
  assert.equal(helper.plaidEnvironmentOfToken(token), 'production', String(token));
}
assert.equal(helper.plaidHost('production'), 'https://production.plaid.com');
assert.equal(helper.plaidHost('sandbox'), 'https://sandbox.plaid.com');

const envOf = vars => name => vars[name];
const FULL = { PLAID_CLIENT_ID: 'client-1', PLAID_SECRET: 'production-secret', PLAID_SANDBOX_SECRET: 'sandbox-secret', PLAID_SANDBOX_EMAILS: ' QA@Yorbit.example , @plaid-testers.example ' };
assert.deepEqual({ ...helper.plaidCredentials('production', envOf(FULL)) }, { clientId: 'client-1', secret: 'production-secret' });
assert.deepEqual({ ...helper.plaidCredentials('sandbox', envOf(FULL)) }, { clientId: 'client-1', secret: 'sandbox-secret' });
assert.equal(helper.plaidCredentials('sandbox', envOf({ ...FULL, PLAID_SANDBOX_SECRET: undefined })), null, 'the sandbox never borrows the production secret');
assert.equal(helper.plaidCredentials('sandbox', envOf({ ...FULL, PLAID_SANDBOX_SECRET: '  ' })), null);
assert.equal(helper.plaidCredentials('production', envOf({ ...FULL, PLAID_CLIENT_ID: undefined })), null);

assert.equal(helper.sandboxLinkAllowed('qa@yorbit.example', envOf(FULL)), true);
assert.equal(helper.sandboxLinkAllowed('reviewer@plaid-testers.example', envOf(FULL)), true);
for (const email of ['someone@gmail.com', 'x@evilplaid-testers.example', 'x@plaid-testers.example.org', 'qa@yorbit.example.org', '', null, undefined]) {
  assert.equal(helper.sandboxLinkAllowed(email, envOf(FULL)), false, String(email));
}
assert.equal(helper.sandboxLinkAllowed('qa@yorbit.example', envOf({ ...FULL, PLAID_SANDBOX_EMAILS: undefined })), false, 'unset list = nobody');
// Tester selection and credential availability are verified separately by the handlers below.

// --- Shared fakes for the handlers ---
function fakes({ env, user, plaidCalls, configs, extra = {} }) {
  return {
    Deno: { serve: fn => { fakes.handler = fn; }, env: { get: name => env[name] } },
    handleOptions: () => null,
    jsonResponse: (body, status = 200) => ({ status, body }),
    errorResponse: (error, status) => ({ status, body: { error } }),
    getUser: async () => user,
    enforceRateLimit: async () => null, identityFromRequest: () => 'fixture', RULES: { sync: {} },
    Configuration: class { constructor(options) { configs.push(options); } },
    PlaidEnvironments: { production: 'https://production.plaid.com', sandbox: 'https://sandbox.plaid.com' },
    PlaidApi: class {
      constructor(config) { this.config = config; }
      async linkTokenCreate(args) { plaidCalls.push(['linkTokenCreate', args]); return { data: { link_token: 'link-fixture' } }; }
      async itemPublicTokenExchange(args) {
        plaidCalls.push(['itemPublicTokenExchange', args]);
        const env = args.public_token.startsWith('public-sandbox-') ? 'sandbox' : 'production';
        return { data: { access_token: `access-${env}-fixture`, item_id: 'item-fixture' } };
      }
      async itemRemove(args) { plaidCalls.push(['itemRemove', args]); return { data: {} }; }
    },
    Products: { Transactions: 'transactions', Investments: 'investments' }, CountryCode: { Us: 'US' },
    console: { log() {}, warn() {}, error() {} },
    ...extra,
  };
}
const REAL = { email: 'someone@gmail.com' };
const TESTER = { email: 'QA@yorbit.example' };
const secretUsed = config => config.baseOptions.headers['PLAID-SECRET'];

// --- plaid-create-link-token ---
const linkJs = `${helperJs}\n${compile('supabase/functions/plaid-create-link-token/index.ts')}`;
async function createLink({ env = FULL, who = REAL, body = {}, existingToken = null }) {
  const plaidCalls = [], configs = [];
  const ctx = fakes({ env, user: { id: 'user-1', ...who }, plaidCalls, configs, extra: {
    serviceClient: () => ({ from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: { user_id: 'user-1', sync_status: 'connected' } }) }) }) }) }),
    getPlaidAccessToken: async () => ({ token: existingToken }),
  } });
  vm.runInNewContext(linkJs, ctx);
  const response = await fakes.handler(new Request('https://fixture.invalid/link', { method: 'POST', body: JSON.stringify(body) }));
  return { response, plaidCalls, configs };
}
{
  let r = await createLink({ who: REAL });
  assert.equal(r.response.status, 200);
  assert.equal(r.configs[0].basePath, 'https://production.plaid.com', 'real users link real banks');
  assert.equal(secretUsed(r.configs[0]), 'production-secret');

  r = await createLink({ who: TESTER });
  assert.equal(r.response.status, 200);
  assert.equal(r.configs[0].basePath, 'https://sandbox.plaid.com', 'a listed tester links Plaid Sandbox');
  assert.equal(secretUsed(r.configs[0]), 'sandbox-secret');
  assert.deepEqual([...r.plaidCalls[0][1].products], ['transactions']);

  r = await createLink({ who: TESTER, body: { native: true } });
  assert.equal(r.plaidCalls[0][1].redirect_uri, 'https://yorbit-life-os.vercel.app/bank-oauth-return', 'sandbox OAuth banks exercise the same native return');

  for (const secret of [undefined, '', '  ']) {
    r = await createLink({ who: TESTER, env: { ...FULL, PLAID_SANDBOX_SECRET: secret } });
    assert.equal(r.response.status, 503, 'a listed tester must fail closed when the sandbox secret is unavailable');
    assert.equal(r.plaidCalls.length, 0, 'missing sandbox configuration must never open a real-bank link');
    assert.equal(r.configs.length, 0);
  }
  for (const secret of [undefined, '', '  ']) {
    r = await createLink({ who: TESTER, body: { native: true }, env: { ...FULL, PLAID_SECRET: secret } });
    assert.equal(r.response.status, 200, 'sandbox-only configuration needs no production secret');
    assert.equal(r.configs[0].basePath, 'https://sandbox.plaid.com');
    assert.equal(secretUsed(r.configs[0]), 'sandbox-secret');
    assert.equal(r.plaidCalls[0][1].redirect_uri, 'https://yorbit-life-os.vercel.app/bank-oauth-return');
  }
  r = await createLink({ who: TESTER, env: { ...FULL, PLAID_CLIENT_ID: undefined } });
  assert.equal(r.response.status, 503);
  assert.equal(r.plaidCalls.length, 0);
  r = await createLink({ who: REAL, env: { ...FULL, PLAID_SECRET: undefined } });
  assert.equal(r.response.status, 503, 'real users do not fall back to sandbox when production is unavailable');
  assert.equal(r.plaidCalls.length, 0);

  // Update mode follows the existing item's environment, whoever asks.
  r = await createLink({ who: REAL, body: { connected_account_id: 'acct-1' }, existingToken: 'access-sandbox-old' });
  assert.equal(r.configs[0].basePath, 'https://sandbox.plaid.com');
  assert.equal(r.plaidCalls[0][1].access_token, 'access-sandbox-old');
  r = await createLink({ who: TESTER, body: { connected_account_id: 'acct-1' }, existingToken: 'access-production-old' });
  assert.equal(r.configs[0].basePath, 'https://production.plaid.com', 'a tester reconnecting a real item stays in production');

  r = await createLink({ who: REAL, body: { connected_account_id: 'acct-1' }, existingToken: 'access-sandbox-old', env: { ...FULL, PLAID_SANDBOX_SECRET: undefined } });
  assert.equal(r.response.status, 503);
  assert.equal(r.plaidCalls.length, 0, 'a sandbox item is never sent to production');
}

// --- plaid-exchange-token ---
const exchangeJs = `${helperJs}\n${compile('supabase/functions/_shared/publicConnectedAccount.ts')}\n${compile('supabase/functions/plaid-exchange-token/index.ts')}`;
async function exchange({ env = FULL, who = REAL, publicToken }) {
  const plaidCalls = [], configs = [], saved = [];
  const ctx = fakes({ env, user: { id: 'user-1', ...who }, plaidCalls, configs, extra: {
    serviceClient: () => ({ rpc: async (name, args) => { saved.push(args); return { data: args.p_accounts.map((a, i) => ({ id: `acct-${i}`, ...a })), error: null }; } }),
  } });
  vm.runInNewContext(exchangeJs, ctx);
  const body = { public_token: publicToken, institution_name: 'First Platypus Bank', accounts: [{ id: 'plaid-acct-1', name: 'Plaid Checking', type: 'depository', mask: '0000' }] };
  const response = await fakes.handler(new Request('https://fixture.invalid/exchange', { method: 'POST', body: JSON.stringify(body) }));
  return { response, plaidCalls, configs, saved };
}
{
  let r = await exchange({ who: REAL, publicToken: 'public-production-1' });
  assert.equal(r.response.status, 200);
  assert.equal(r.configs[0].basePath, 'https://production.plaid.com');
  assert.equal(secretUsed(r.configs[0]), 'production-secret');
  assert.equal(r.saved[0].p_access_token, 'access-production-fixture');

  r = await exchange({ who: TESTER, publicToken: 'public-sandbox-1' });
  assert.equal(r.response.status, 200);
  assert.equal(r.configs[0].basePath, 'https://sandbox.plaid.com');
  assert.equal(secretUsed(r.configs[0]), 'sandbox-secret');
  assert.equal(r.saved[0].p_access_token, 'access-sandbox-fixture', 'the stored token carries its environment for every later call');

  r = await exchange({ who: REAL, publicToken: 'public-sandbox-1' });
  assert.equal(r.response.status, 400, 'an unlisted user cannot add a sandbox item');
  assert.equal(r.plaidCalls.length, 0); assert.equal(r.saved.length, 0);

  for (const secret of [undefined, '', '  ']) {
    r = await exchange({ who: TESTER, publicToken: 'public-sandbox-1', env: { ...FULL, PLAID_SANDBOX_SECRET: secret } });
    assert.equal(r.response.status, 503);
    assert.equal(r.plaidCalls.length, 0); assert.equal(r.saved.length, 0);
    assert.equal(r.configs.length, 0);
  }
  for (const secret of [undefined, '', '  ']) {
    r = await exchange({ who: TESTER, publicToken: 'public-sandbox-1', env: { ...FULL, PLAID_SECRET: secret } });
    assert.equal(r.response.status, 200, 'sandbox exchange needs no production secret');
    assert.equal(r.configs[0].basePath, 'https://sandbox.plaid.com');
    assert.equal(secretUsed(r.configs[0]), 'sandbox-secret');
    assert.equal(r.saved[0].p_access_token, 'access-sandbox-fixture');
  }
  r = await exchange({ who: TESTER, publicToken: 'public-sandbox-1', env: { ...FULL, PLAID_CLIENT_ID: undefined } });
  assert.equal(r.response.status, 503);
  assert.equal(r.plaidCalls.length, 0); assert.equal(r.saved.length, 0);
  r = await exchange({ who: REAL, publicToken: 'public-production-1', env: { ...FULL, PLAID_SECRET: undefined } });
  assert.equal(r.response.status, 503);
  assert.equal(r.plaidCalls.length, 0); assert.equal(r.saved.length, 0);
}

console.log('PASS Plaid environment: real users and production items stay on production with the production secret; listed testers link Plaid Sandbox (including the native OAuth return) with the sandbox secret; update mode follows the item; missing environment configuration fails closed with no provider calls; sandbox-only setup works; unlisted users cannot exchange sandbox tokens');
