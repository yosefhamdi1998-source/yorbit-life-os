import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { transform } from 'esbuild';

const source = fs.readFileSync('supabase/functions/plaid-disconnect-account/index.ts', 'utf8');
const js = (await transform(source.replace(/^import .*;\r?\n/gm, ''), { loader: 'ts' })).code;

function makeAdmin(seed) {
  const tables = { connected_accounts: seed.connected_accounts.map(r => ({ ...r })), plaid_credentials: seed.plaid_credentials.map(r => ({ ...r })) };
  const log = { itemRemoveCalls: 0, updates: [], deletes: [] };
  function builder(tableName, op, patch) {
    const filters = [];
    let limit = null;
    const api = {
      eq(field, value) { filters.push(row => row[field] === value); return api; },
      neq(field, value) { filters.push(row => row[field] !== value); return api; },
      select() { return api; },
      limit(n) { limit = n; return api; },
      async maybeSingle() {
        const rows = tables[tableName].filter(row => filters.every(f => f(row)));
        if (op === 'update') {
          if (rows.length === 0) return { data: null, error: null };
          Object.assign(rows[0], patch);
          log.updates.push({ table: tableName, id: rows[0].id, patch: { ...patch } });
          return { data: { id: rows[0].id }, error: null };
        }
        return { data: rows[0] || null, error: null };
      },
      then(resolve) {
        if (op === 'delete') {
          const before = tables[tableName].length;
          tables[tableName] = tables[tableName].filter(row => !filters.every(f => f(row)));
          log.deletes.push({ table: tableName, removed: before - tables[tableName].length });
          return Promise.resolve({ error: null }).then(resolve);
        }
        let rows = tables[tableName].filter(row => filters.every(f => f(row)));
        if (limit) rows = rows.slice(0, limit);
        return Promise.resolve({ data: rows, error: null }).then(resolve);
      },
    };
    return api;
  }
  const admin = {
    from(tableName) {
      return {
        select: () => builder(tableName, 'select'),
        update: patch => builder(tableName, 'update', patch),
        delete: () => builder(tableName, 'delete'),
      };
    },
  };
  return { admin, tables, log };
}

async function run({ seed, plaidBehavior = 'success', tokenSource = 'vault', configured = true, userId = 'user-1', body = { connected_account_id: 'acct-1' } }) {
  let handler;
  const { admin, tables, log } = makeAdmin(seed);
  class PlaidApi {
    itemRemove = async ({ access_token }) => {
      log.itemRemoveCalls++;
      log.lastToken = access_token;
      if (plaidBehavior === 'not-found') { const e = new Error('not found'); e.response = { data: { error_code: 'ITEM_NOT_FOUND' } }; throw e; }
      if (plaidBehavior === 'error') { const e = new Error('provider down'); e.response = { data: { error_code: 'INTERNAL_SERVER_ERROR' } }; throw e; }
      return { data: {} };
    };
  }
  const sandbox = {
    Deno: { serve: fn => { handler = fn; }, env: { get: key => (configured ? 'fixture' : (key === 'PLAID_CLIENT_ID' || key === 'PLAID_SECRET' ? null : 'fixture')) } },
    getUser: async () => (userId ? { id: userId } : null),
    serviceClient: () => admin,
    getPlaidAccessToken: async (_admin, id) => {
      const cred = tables.plaid_credentials.find(c => c.connected_account_id === id);
      if (!cred) return { token: null, source: 'none' };
      return { token: cred.access_token, source: tokenSource };
    },
    Configuration: class {}, PlaidEnvironments: { production: 'https://production.plaid.com' }, PlaidApi,
    handleOptions: () => null,
    jsonResponse: (body, status = 200) => ({ status, body }),
    errorResponse: (message, status, opts) => ({ status, body: { error: message }, internal: opts?.internal }),
    enforceRateLimit: async () => null, identityFromRequest: () => 'fixture', RULES: { sync: {} },
    console: { log() {}, error() {}, warn() {} },
  };
  vm.runInNewContext(js, sandbox);
  const response = await handler({ method: 'POST', json: async () => body });
  return { response, tables, log };
}

const baseSeed = () => ({
  connected_accounts: [
    { id: 'acct-1', user_id: 'user-1', provider: 'plaid', provider_item_id: 'item-1', sync_status: 'connected' },
  ],
  plaid_credentials: [
    { connected_account_id: 'acct-1', access_token: 'token-acct-1' },
  ],
});

// --- auth and ownership ---
{
  const { response } = await run({ seed: baseSeed(), userId: null });
  assert.equal(response.status, 401);
}
{
  const seed = baseSeed();
  const { response, tables } = await run({ seed, userId: 'someone-else' });
  assert.equal(response.status, 404, 'not owned reads the same as not found');
  assert.equal(tables.connected_accounts[0].sync_status, 'connected', 'nothing touched for a non-owner');
}
{
  const { response } = await run({ seed: baseSeed(), body: { connected_account_id: 'does-not-exist' } });
  assert.equal(response.status, 404);
}

// --- idempotent: already disconnected ---
{
  const seed = baseSeed(); seed.connected_accounts[0].sync_status = 'disconnected';
  const { response, log } = await run({ seed });
  assert.equal(response.status, 200); assert.equal(response.body.success, true);
  assert.equal(log.itemRemoveCalls, 0, 'an already-disconnected account must not re-attempt revocation');
  assert.equal(log.updates.length, 0);
}

// --- happy path: no sibling, token exists, Plaid confirms removal ---
{
  const { response, tables, log } = await run({ seed: baseSeed() });
  assert.equal(response.status, 200); assert.equal(response.body.success, true);
  assert.equal(log.itemRemoveCalls, 1); assert.equal(log.lastToken, 'token-acct-1');
  assert.equal(tables.connected_accounts[0].sync_status, 'disconnected');
  assert.equal(tables.plaid_credentials.length, 0, 'the disconnected account\'s own token copy must be removed');
}

// --- already removed at Plaid (ITEM_NOT_FOUND) is treated as success, not failure ---
{
  const { response, tables, log } = await run({ seed: baseSeed(), plaidBehavior: 'not-found' });
  assert.equal(response.status, 200); assert.equal(response.body.success, true);
  assert.equal(log.itemRemoveCalls, 1);
  assert.equal(tables.connected_accounts[0].sync_status, 'disconnected');
}

// --- a genuine provider failure must not mark disconnected or delete the token ---
{
  const { response, tables, log } = await run({ seed: baseSeed(), plaidBehavior: 'error' });
  assert.equal(response.status, 503);
  assert.equal(tables.connected_accounts[0].sync_status, 'connected', 'a failed revocation must leave the account exactly as it was, so a retry starts over cleanly');
  assert.equal(tables.plaid_credentials.length, 1, 'the token must still be there for a retry');
  assert.equal(log.updates.length, 0);
}

// --- missing Plaid config (no sibling) fails safely, no false completion ---
{
  const { response, tables } = await run({ seed: baseSeed(), configured: false });
  assert.equal(response.status, 503);
  assert.equal(tables.connected_accounts[0].sync_status, 'connected');
}

// --- a sibling account on the same Item must block revocation, but this account still disconnects ---
{
  const seed = baseSeed();
  seed.connected_accounts.push({ id: 'acct-2', user_id: 'user-1', provider: 'plaid', provider_item_id: 'item-1', sync_status: 'connected' });
  seed.plaid_credentials.push({ connected_account_id: 'acct-2', access_token: 'token-acct-1' }); // same underlying Item, its own row
  const { response, tables, log } = await run({ seed });
  assert.equal(response.status, 200); assert.equal(response.body.success, true);
  assert.equal(log.itemRemoveCalls, 0, 'a still-connected sibling on the same Item must block Plaid revocation entirely');
  assert.equal(tables.connected_accounts.find(a => a.id === 'acct-1').sync_status, 'disconnected');
  assert.equal(tables.connected_accounts.find(a => a.id === 'acct-2').sync_status, 'connected', 'the sibling must be completely untouched');
  assert.equal(tables.plaid_credentials.find(c => c.connected_account_id === 'acct-1'), undefined, 'this account\'s own token copy is still removed');
  assert.equal(tables.plaid_credentials.find(c => c.connected_account_id === 'acct-2').access_token, 'token-acct-1', 'the sibling keeps its own copy of the still-live token');
}

// --- a sibling that is ALREADY disconnected does not count - revocation proceeds normally ---
{
  const seed = baseSeed();
  seed.connected_accounts.push({ id: 'acct-2', user_id: 'user-1', provider: 'plaid', provider_item_id: 'item-1', sync_status: 'disconnected' });
  const { response, log } = await run({ seed });
  assert.equal(response.status, 200);
  assert.equal(log.itemRemoveCalls, 1, 'an already-disconnected sibling must not block revoking the shared Item');
}

// --- no token on file at all (legacy/edge case): nothing to revoke, still disconnects cleanly ---
{
  const seed = baseSeed(); seed.plaid_credentials = [];
  const { response, tables, log } = await run({ seed });
  assert.equal(response.status, 200);
  assert.equal(log.itemRemoveCalls, 0);
  assert.equal(tables.connected_accounts[0].sync_status, 'disconnected');
}

// --- a non-Plaid provider skips revocation entirely ---
{
  const seed = baseSeed(); seed.connected_accounts[0].provider = 'teller';
  const { response, log } = await run({ seed });
  assert.equal(response.status, 200);
  assert.equal(log.itemRemoveCalls, 0, 'no Plaid API call exists for a non-plaid provider');
}

// --- retry after a failure self-heals once Plaid actually confirms removal on the next attempt ---
{
  const seed = baseSeed();
  const first = await run({ seed, plaidBehavior: 'error' });
  assert.equal(first.response.status, 503);
  // Same seed's underlying tables were mutated in place only by the failed run (nothing committed);
  // simulate a second, independent request against that same still-untouched state.
  const second = await run({ seed, plaidBehavior: 'not-found' }); // the earlier failed attempt's own retry against Plaid now finds it already gone
  assert.equal(second.response.status, 200);
  assert.equal(second.tables.connected_accounts[0].sync_status, 'disconnected');
}

console.log('PASS bank disconnect: ownership enforced, idempotent retries, shared-Item siblings protected, provider failures never falsely report completion, token cleanup only after confirmed disconnect');
