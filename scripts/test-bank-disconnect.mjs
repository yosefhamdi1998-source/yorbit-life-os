import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { transform } from 'esbuild';

// SCOPE OF THIS FILE: the Edge Function's own logic - given whatever
// claim_bank_disconnect (migration 20260927120000) reports, does the
// handler make exactly the right calls? This does NOT execute real SQL:
// there is no local Postgres/Docker available in this environment to run
// the migration's pg_advisory_xact_lock logic against. The migration's own
// concurrency correctness is reasoned through in its own comments and by
// the "concurrent siblings" scenario below, which simulates the two
// *correct* outcomes a properly-serializing RPC call would produce for two
// racing sibling disconnects, and checks the handler reacts to each
// correctly. It is not a substitute for running the migration against a
// real database once that access exists - see YORBIT_PROGRESS.md.

const source = fs.readFileSync('supabase/functions/plaid-disconnect-account/index.ts', 'utf8');
const js = (await transform(source.replace(/^import .*;\r?\n/gm, ''), { loader: 'ts' })).code;

async function run({
  userId = 'user-1', body = { connected_account_id: 'acct-1' },
  claim = { provider: 'plaid', provider_item_id: 'item-1', already_disconnected: false, sibling_active: false },
  claimError = null,
  tokenResult = { token: 'token-acct-1' }, tokenThrows = null,
  plaidBehavior = 'success', deleteError = null,
  configured = true,
}) {
  let handler;
  const log = { itemRemoveCalls: 0, deletes: [], rpcCalls: [] };
  class PlaidApi {
    itemRemove = async ({ access_token }) => {
      log.itemRemoveCalls++;
      log.lastToken = access_token;
      if (plaidBehavior === 'not-found') { const e = new Error('not found'); e.response = { data: { error_code: 'ITEM_NOT_FOUND' } }; throw e; }
      if (plaidBehavior === 'error') { const e = new Error('provider down'); e.response = { data: { error_code: 'INTERNAL_SERVER_ERROR' } }; throw e; }
      return { data: {} };
    };
  }
  const admin = {
    rpc: async (name, args) => {
      log.rpcCalls.push({ name, args });
      if (claimError) return { data: null, error: claimError };
      return { data: [claim], error: null };
    },
    from(table) {
      assert.equal(table, 'plaid_credentials', 'the handler must never touch any other table directly - ownership and status live entirely behind the RPC now');
      return {
        delete: () => ({
          eq: async () => { log.deletes.push(1); return { error: deleteError }; },
        }),
      };
    },
  };
  const sandbox = {
    Deno: { serve: fn => { handler = fn; }, env: { get: key => (configured ? 'fixture' : (key === 'PLAID_CLIENT_ID' || key === 'PLAID_SECRET' ? null : 'fixture')) } },
    getUser: async () => (userId ? { id: userId } : null),
    serviceClient: () => admin,
    getPlaidAccessToken: async () => { if (tokenThrows) throw tokenThrows; return tokenResult; },
    Configuration: class {}, PlaidEnvironments: { production: 'https://production.plaid.com' }, PlaidApi,
    handleOptions: () => null,
    jsonResponse: (body, status = 200) => ({ status, body }),
    errorResponse: (message, status, opts) => ({ status, body: { error: message }, internal: opts?.internal }),
    enforceRateLimit: async () => null, identityFromRequest: () => 'fixture', RULES: { sync: {} },
    console: { log() {}, error() {}, warn() {} },
  };
  vm.runInNewContext(js, sandbox);
  const response = await handler({ method: 'POST', json: async () => body });
  return { response, log };
}

// --- auth and RPC-reported not-found/not-owned ---
{
  const { response } = await run({ userId: null });
  assert.equal(response.status, 401);
}
{
  const { response, log } = await run({ claimError: { message: 'not found' } });
  assert.equal(response.status, 404);
  assert.equal(log.itemRemoveCalls, 0); assert.equal(log.deletes.length, 0);
}
{
  // The RPC call itself is where ownership is enforced now (p_user_id) -
  // confirm the handler actually passes the authenticated user's own id,
  // not anything client-supplied.
  const { log } = await run({ userId: 'the-real-user', body: { connected_account_id: 'acct-1' } });
  assert.equal(log.rpcCalls[0].args.p_user_id, 'the-real-user');
  assert.equal(log.rpcCalls[0].args.p_account_id, 'acct-1');
}

// --- Defect 1 (Codex, reproduced/fixed): cleanup failure must recover on retry ---
{
  // First attempt: Plaid succeeds but the credential delete fails.
  const first = await run({ claim: { provider: 'plaid', provider_item_id: 'item-1', already_disconnected: false, sibling_active: false }, deleteError: { message: 'synthetic cleanup outage' } });
  assert.equal(first.response.status, 503, 'a failed cleanup must not report success with the credential still in the vault');
  assert.equal(first.log.itemRemoveCalls, 1);
  // Retry: claim_bank_disconnect now reports already_disconnected - the OLD
  // handler short-circuited to success here without ever touching Plaid or
  // the credential again, which is exactly how the leak became permanent.
  const retry = await run({ claim: { provider: 'plaid', provider_item_id: 'item-1', already_disconnected: true, sibling_active: false }, plaidBehavior: 'not-found' });
  assert.equal(retry.response.status, 200, 'a retry must still finish the job, not skip it because sync_status already reads disconnected');
  assert.equal(retry.log.itemRemoveCalls, 1, 'retry must re-attempt revocation, not assume it already happened');
  assert.equal(retry.log.deletes.length, 1, 'retry must re-attempt the credential cleanup that failed last time');
}

// --- Defect 2 (Codex, reproduced/fixed): concurrent siblings must not both skip revocation ---
// Simulates the two outcomes a correctly-serializing claim_bank_disconnect
// produces for two accounts sharing one Item disconnected at the same
// moment (see the migration's own reasoning) - not a live concurrency test.
{
  const a = await run({ body: { connected_account_id: 'acct-a' }, claim: { provider: 'plaid', provider_item_id: 'item-1', already_disconnected: false, sibling_active: true } });
  const b = await run({ body: { connected_account_id: 'acct-b' }, claim: { provider: 'plaid', provider_item_id: 'item-1', already_disconnected: false, sibling_active: false } });
  assert.equal(a.response.status, 200); assert.equal(b.response.status, 200);
  assert.equal(a.log.itemRemoveCalls, 0, 'the account told a sibling is still active must not call Plaid');
  assert.equal(b.log.itemRemoveCalls, 1, 'exactly one of the two must actually revoke the shared Item');
  assert.equal(a.log.deletes.length, 1, 'the sibling-protected account still cleans up its OWN redundant credential copy');
  assert.equal(b.log.deletes.length, 1);
}

// --- Defect 3 (Codex, reproduced/fixed): a token-read failure must fail closed ---
{
  const { response, log } = await run({ tokenThrows: new Error('synthetic token-store outage') });
  assert.equal(response.status, 503, 'a failed credential read must never be treated as "nothing to revoke"');
  assert.equal(log.itemRemoveCalls, 0);
  assert.equal(log.deletes.length, 0, 'must not delete a credential it could not even confirm the contents of');
}

// --- already-removed at Plaid is success, not failure ---
{
  const { response, log } = await run({ plaidBehavior: 'not-found' });
  assert.equal(response.status, 200); assert.equal(log.itemRemoveCalls, 1); assert.equal(log.deletes.length, 1);
}

// --- a genuine provider failure must not delete the credential ---
{
  const { response, log } = await run({ plaidBehavior: 'error' });
  assert.equal(response.status, 503);
  assert.equal(log.deletes.length, 0, 'a live, unrevoked credential must not be deleted');
}

// --- missing Plaid config fails safely ---
{
  const { response, log } = await run({ configured: false });
  assert.equal(response.status, 503);
  assert.equal(log.itemRemoveCalls, 0); assert.equal(log.deletes.length, 0);
}

// --- no token on file at all (legitimately nothing to revoke) ---
{
  const { response, log } = await run({ tokenResult: { token: null } });
  assert.equal(response.status, 200);
  assert.equal(log.itemRemoveCalls, 0); assert.equal(log.deletes.length, 0, 'nothing to delete either');
}

// --- non-Plaid provider never touches Plaid or reads a token ---
{
  const { response, log } = await run({ claim: { provider: 'teller', provider_item_id: null, already_disconnected: false, sibling_active: false } });
  assert.equal(response.status, 200);
  assert.equal(log.itemRemoveCalls, 0); assert.equal(log.deletes.length, 0);
}

// --- integration: the migration exists, is idempotent to reapply, and is exactly what the function relies on ---
const migrationSource = fs.readFileSync('supabase/migrations/20260927120000_atomic_bank_disconnect_claim.sql', 'utf8');
assert.match(migrationSource, /create or replace function public\.claim_bank_disconnect/);
assert.match(migrationSource, /pg_advisory_xact_lock/);
assert.match(migrationSource, /user_id = p_user_id/);
assert.match(migrationSource, /grant execute on function public\.claim_bank_disconnect\(uuid, uuid\) to service_role;/);
assert.match(source, /admin\.rpc\('claim_bank_disconnect'/);

console.log('PASS bank disconnect: RPC-reported not-found/ownership, cleanup-failure retry recovery (defect 1), simulated correctly-serialized sibling outcomes (defect 2), fail-closed token-read errors (defect 3), already-removed/provider-failure/missing-config/no-token/non-plaid paths, and migration presence');
