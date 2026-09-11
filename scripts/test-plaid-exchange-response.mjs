import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { transform } from 'esbuild';

const publicSource = fs.readFileSync('supabase/functions/_shared/publicConnectedAccount.ts', 'utf8');
const publicJs = (await transform(publicSource, { loader: 'ts', format: 'esm' })).code;
const { PUBLIC_ACCOUNT_COLUMNS, publicConnectedAccount } = await import('data:text/javascript;base64,' + Buffer.from(publicJs).toString('base64'));
const source = fs.readFileSync('supabase/functions/plaid-exchange-token/index.ts', 'utf8');
const handlerJs = (await transform(source.replace(/^import .*;\r?\n/gm, ''), { loader: 'ts' })).code;
const syntheticToken = 'synthetic-private-token-not-real';

async function run({ vaultFails = false, authenticated = true } = {}) {
  let handler;
  const inserts = [], vaults = [], selections = [];
  const admin = {
    from(table) {
      if (table === 'plaid_credentials') return {
        async upsert(row) {
          vaults.push(row);
          return { error: vaultFails ? { message: 'synthetic vault failure' } : null };
        },
      };
      assert.equal(table, 'connected_accounts');
      return {
        insert(row) {
          inserts.push(row);
          return {
            select(columns) {
              selections.push(columns);
              return {
                async single() {
                  // Deliberately return extra private fields to exercise the response boundary
                  // even when a database adapter does not honor the requested projection.
                  return { data: { ...row, id: `account-${inserts.length}`, future_secret: syntheticToken }, error: null };
                },
              };
            },
          };
        },
      };
    },
  };
  vm.runInNewContext(handlerJs, {
    Deno: { serve(fn) { handler = fn; }, env: { get: () => 'synthetic-config' } },
    handleOptions: () => null,
    getUser: async () => authenticated ? { id: 'synthetic-user' } : null,
    serviceClient: () => admin,
    enforceRateLimit: async (_bucket, _identity, _rule, message, request) => { assert.equal(message, undefined); assert.equal(typeof request.json, 'function'); return null; }, identityFromRequest: () => 'synthetic-user', RULES: { sync: {} },
    Configuration: class {}, PlaidEnvironments: { production: 'unused' },
    PlaidApi: class { async itemPublicTokenExchange() { return { data: { access_token: syntheticToken, item_id: 'synthetic-item' } }; } },
    jsonResponse: (body, status) => ({ body, status }),
    errorResponse: (error, status) => ({ body: { error }, status }),
    PUBLIC_ACCOUNT_COLUMNS, publicConnectedAccount, console: { error() {} },
  });
  const response = await handler({ json: async () => ({
    public_token: 'synthetic-public', institution_name: 'Fixture bank', accounts: [
      { id: 'checking', name: 'Checking', type: 'depository', mask: '1234', balances: { current: 125, available: 100, iso_currency_code: 'USD' } },
      { id: 'savings', name: 'Savings', type: 'depository', mask: '5678' },
    ],
  }) });
  return { response, inserts, vaults, selections };
}

for (const vaultFails of [false, true]) {
  const { response, inserts, vaults, selections } = await run({ vaultFails });
  assert.equal(response.status, 200);
  assert.equal(response.body.accounts.length, 2);
  assert.equal(response.body.accounts[0].current_balance, 125);
  assert.equal(response.body.accounts[0].account_mask, '1234');
  assert.equal(response.body.accounts[1].sync_status, 'connected');
  assert.ok(!JSON.stringify(response).includes(syntheticToken));
  for (const account of response.body.accounts) {
    assert.ok(!Object.hasOwn(account, 'access_token_ref'));
    assert.ok(!Object.hasOwn(account, 'future_secret'));
  }
  assert.equal(inserts.length, 2);
  assert.equal(vaults.length, 2);
  assert.ok(vaults.every(row => row.access_token === syntheticToken));
  assert.ok(selections.every(columns => columns === PUBLIC_ACCOUNT_COLUMNS && !columns.includes('access_token')));
}
const denied = await run({ authenticated: false });
assert.equal(denied.response.status, 401);
assert.equal(denied.inserts.length, 0);
console.log('PASS: actual exchange handler returns only public account fields, preserves vault writes, and rejects unauthenticated requests; synthetic only');
