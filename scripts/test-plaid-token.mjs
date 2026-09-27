import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { transform } from 'esbuild';

// Tests the real _shared/plaidToken.ts, not a hand-written restatement of
// it - every other function that reads a Plaid credential trusts this
// helper's null-means-nothing-to-revoke contract, so a silently-swallowed
// read error here is exactly as dangerous wherever it's called from.
const source = fs.readFileSync('supabase/functions/_shared/plaidToken.ts', 'utf8');
// Function declarations attach to the sandbox object as properties when run
// via vm.runInNewContext; only the `export` keyword needs stripping.
const js = (await transform(source.replace(/^export async function/m, 'async function'), { loader: 'ts' })).code;
const sandbox = {};
vm.runInNewContext(js, sandbox);
const { getPlaidAccessToken } = sandbox;

function makeAdmin({ credRow = null, credError = null, acctRow = null, acctError = null } = {}) {
  return {
    from(table) {
      if (table === 'plaid_credentials') {
        return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: credRow, error: credError }) }) }) };
      }
      assert.equal(table, 'connected_accounts');
      return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: acctRow, error: acctError }) }) }) };
    },
  };
}

// --- normal cases still work ---
{
  const { token, source: src } = await getPlaidAccessToken(makeAdmin({ credRow: { access_token: 'vault-token' } }), 'acct-1');
  assert.equal(token, 'vault-token'); assert.equal(src, 'vault');
}
{
  const { token, source: src } = await getPlaidAccessToken(makeAdmin({ acctRow: { access_token_ref: 'legacy-token' } }), 'acct-1');
  assert.equal(token, 'legacy-token'); assert.equal(src, 'legacy');
}
{
  const { token, source: src } = await getPlaidAccessToken(makeAdmin({}), 'acct-1');
  assert.equal(token, null); assert.equal(src, 'none');
}

// --- Defect 3 (Codex, reproduced/fixed): a genuine read error must throw, never read as "no token" ---
await assert.rejects(
  () => getPlaidAccessToken(makeAdmin({ credError: { message: 'synthetic token-store outage' } }), 'acct-1'),
  'a failed plaid_credentials read must throw, not silently fall through to the legacy column and then to null',
);
await assert.rejects(
  () => getPlaidAccessToken(makeAdmin({ acctError: { message: 'synthetic outage' } }), 'acct-1'),
  'a failed connected_accounts (legacy fallback) read must also throw, not return null',
);
// A real row simply not existing (no error at all) must NOT throw - only an
// actual read failure should.
{
  const { token } = await getPlaidAccessToken(makeAdmin({ credRow: null, credError: null, acctRow: null, acctError: null }), 'acct-1');
  assert.equal(token, null);
}

console.log('PASS plaid token: vault/legacy/none reads unchanged, a genuine read error on either table now fails closed instead of silently returning null');
