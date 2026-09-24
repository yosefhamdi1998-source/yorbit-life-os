import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseNativeBankLinkUrl, createNativeBankLinkHandler } from '../src/lib/nativeBankLink.js';
import {
  NATIVE_BANK_LINK_REDIRECT_URI, savePendingBankLink, loadPendingBankLink, clearPendingBankLink,
  markPendingAutoSync, takePendingAutoSync, exchangeNewBankLink, finishReconnectBankLink,
} from '../src/lib/plaidLink.js';

function fakeStorage() {
  const map = new Map();
  return { getItem: k => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), removeItem: k => map.delete(k) };
}

// --- parseNativeBankLinkUrl: only the exact registered redirect is ever trusted ---
const callback = id => `${NATIVE_BANK_LINK_REDIRECT_URI}?oauth_state_id=${id}`;
for (const url of [
  'https://evil.test/bank-oauth-return?oauth_state_id=x',
  'http://yorbit-life-os.vercel.app/bank-oauth-return?oauth_state_id=x',
  'https://yorbit-life-os.vercel.app/other-path?oauth_state_id=x',
  'https://user@yorbit-life-os.vercel.app/bank-oauth-return?oauth_state_id=x',
  'garbage',
]) assert.equal(parseNativeBankLinkUrl(url), null, url);
for (const url of [
  NATIVE_BANK_LINK_REDIRECT_URI,
  `${NATIVE_BANK_LINK_REDIRECT_URI}?oauth_state_id=`,
  `${NATIVE_BANK_LINK_REDIRECT_URI}?oauth_state_id=a&oauth_state_id=b`,
]) assert.equal(parseNativeBankLinkUrl(url).invalid, true, url);
assert.deepEqual(parseNativeBankLinkUrl(callback('abc123')), { oauthStateId: 'abc123' });

// --- createNativeBankLinkHandler: dedupe, queueing, error surfacing ---
{
  const resumed = [], errors = [];
  const handle = createNativeBankLinkHandler({ resume: async url => { resumed.push(url); }, onError: () => errors.push(1) });
  await handle('https://evil.test?oauth_state_id=x'); // not a match: silently ignored, not an error
  assert.equal(resumed.length, 0); assert.equal(errors.length, 0);

  let release; const gate = new Promise(r => { release = r; });
  const slowHandle = createNativeBankLinkHandler({
    resume: async () => { await gate; resumed.push('slow'); }, onError: () => errors.push(1),
  });
  const first = slowHandle(callback('one'));
  const duplicate = slowHandle(callback('one')); // App.getLaunchUrl + appUrlOpen can both report the same redirect
  release();
  await Promise.all([first, duplicate]);
  assert.deepEqual(resumed, ['slow']);

  let invalidErrors = 0;
  await createNativeBankLinkHandler({ resume: async () => assert.fail('must not resume on invalid'), onError: () => invalidErrors++ })(`${NATIVE_BANK_LINK_REDIRECT_URI}?oauth_state_id=`);
  assert.equal(invalidErrors, 1);

  let thrownErrors = 0;
  await createNativeBankLinkHandler({ resume: async () => { throw new Error('plaid secret'); }, onError: () => thrownErrors++ })(callback('throws'));
  assert.equal(thrownErrors, 1);
}

// --- pending link storage: round trip, staleness, malformed/missing data ---
{
  const storage = fakeStorage();
  assert.equal(loadPendingBankLink(storage), null);
  savePendingBankLink({ link_token: 'link-sandbox-1', mode: 'new' }, storage);
  const saved = loadPendingBankLink(storage);
  assert.equal(saved.link_token, 'link-sandbox-1'); assert.equal(saved.mode, 'new'); assert.equal(saved.connected_account_id, null);
  assert.ok(Date.now() - saved.savedAt < 5000, 'savedAt must be a real, current timestamp');
  clearPendingBankLink(storage);
  assert.equal(loadPendingBankLink(storage), null);

  savePendingBankLink({ link_token: 'link-sandbox-2', mode: 'reconnect', connected_account_id: 'acct-1' }, storage);
  const reconnectPending = loadPendingBankLink(storage);
  assert.equal(reconnectPending.mode, 'reconnect'); assert.equal(reconnectPending.connected_account_id, 'acct-1');

  // A stale entry (older than the 30-minute resume window) must not be resumed.
  storage.setItem('yorbit.pendingBankLink', JSON.stringify({ link_token: 'old', mode: 'new', savedAt: Date.now() - 31 * 60 * 1000 }));
  assert.equal(loadPendingBankLink(storage), null);

  for (const bad of ['not json', JSON.stringify({ mode: 'new' }), JSON.stringify({ link_token: 'x', mode: 'bogus', savedAt: Date.now() })]) {
    storage.setItem('yorbit.pendingBankLink', bad);
    assert.equal(loadPendingBankLink(storage), null, bad);
  }

  // Storage that throws (private-mode Safari, quota) must not crash either helper.
  const throwingStorage = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); }, removeItem() { throw new Error('blocked'); } };
  savePendingBankLink({ link_token: 'x', mode: 'new' }, throwingStorage);
  assert.equal(loadPendingBankLink(throwingStorage), null);
  clearPendingBankLink(throwingStorage);
}

// --- pending auto-sync queue: consumed exactly once ---
{
  const storage = fakeStorage();
  assert.deepEqual(takePendingAutoSync(storage), []);
  markPendingAutoSync([{ id: 'a1', full: true }, { id: 'a2', full: false }], storage);
  assert.deepEqual(takePendingAutoSync(storage), [{ id: 'a1', full: true }, { id: 'a2', full: false }]);
  assert.deepEqual(takePendingAutoSync(storage), [], 'a second take must return nothing - already consumed');

  storage.setItem('yorbit.pendingBankAutoSync', JSON.stringify([{ id: 'ok' }, { full: true }, null, 'x']));
  assert.deepEqual(takePendingAutoSync(storage), [{ id: 'ok' }], 'entries without a string id are dropped, not trusted');
}

// --- exchangeNewBankLink / finishReconnectBankLink: exact server calls ---
{
  let invoked = null;
  const accounts = await exchangeNewBankLink({
    base44: { functions: { invoke: async (name, payload) => { invoked = { name, payload }; return { accounts: [{ id: 'a1', account_type: 'checking' }] }; } } },
    public_token: 'public-sandbox-1',
    metadata: { institution: { name: 'Fixture Bank' }, accounts: [{ id: 'plaid-a1' }] },
  });
  assert.equal(invoked.name, 'plaidExchangeToken');
  assert.deepEqual(invoked.payload, { public_token: 'public-sandbox-1', institution_name: 'Fixture Bank', accounts: [{ id: 'plaid-a1' }] });
  assert.deepEqual(accounts, [{ id: 'a1', account_type: 'checking' }]);

  const missingInstitution = await exchangeNewBankLink({ base44: { functions: { invoke: async () => ({}) } }, public_token: 'x', metadata: {} });
  assert.deepEqual(missingInstitution, []);
  await exchangeNewBankLink({ base44: { functions: { invoke: async (_, p) => { invoked = p; return {}; } } }, public_token: 'x', metadata: {} });
  assert.equal(invoked.institution_name, 'Bank', 'missing metadata.institution.name falls back to a generic label');
}
{
  let updated = null;
  await finishReconnectBankLink({ base44: { entities: { ConnectedAccount: { update: async (id, fields) => { updated = { id, fields }; } } } }, id: 'acct-9' });
  assert.deepEqual(updated, { id: 'acct-9', fields: { sync_status: 'connected', error_message: null } });
}

// --- Integration: the redirect URI, wiring and route must actually be present, not just tested in isolation ---
assert.match(fs.readFileSync('src/pages/BankSync.jsx', 'utf8'), /native:\s*isNative\(\)/);
assert.match(fs.readFileSync('src/App.jsx', 'utf8'), /<NativeBankLinkReturn \/>/);
assert.match(fs.readFileSync('src/App.jsx', 'utf8'), /path="\/bank-oauth-return"/);
const backendSource = fs.readFileSync('supabase/functions/plaid-create-link-token/index.ts', 'utf8');
assert.match(backendSource, /body\?\.native === true/);
const backendUriMatch = backendSource.match(/NATIVE_REDIRECT_URI = '([^']+)'/);
assert.ok(backendUriMatch, 'backend must define its own NATIVE_REDIRECT_URI constant');
assert.equal(backendUriMatch[1], NATIVE_BANK_LINK_REDIRECT_URI, 'frontend and backend redirect URIs must match exactly - Plaid rejects anything not registered');

// --- connectBank / reconnectAccount: pending-link save/clear only on native, exact link-token request shape ---
{
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  const source = fs.readFileSync('src/pages/BankSync.jsx', 'utf8');
  const connectBody = source.match(/const connectBank = async \(\) => \{([\s\S]*?)\n  \};/)[1];
  const connectBank = new AsyncFunction('scope', 'with(scope){' + connectBody + '}');
  const reconnectBody = source.match(/const reconnectAccount = async \(id\) => \{([\s\S]*?)\n  \};/)[1];
  const reconnectAccount = new AsyncFunction('id', 'scope', 'with(scope){' + reconnectBody + '}');

  const makeScope = (native, extra = {}) => {
    const saved = [], cleared = [], errors = [];
    const capture = { config: null };
    return {
      scope: {
        window: { Plaid: { create: config => { capture.config = config; return { open: () => {} }; } } },
        loadPlaidScript: async () => {},
        isNative: () => native,
        savePendingBankLink: v => saved.push(v),
        clearPendingBankLink: () => cleared.push(1),
        exchangeNewBankLink: async () => [{ id: 'new-acct', account_type: 'checking' }],
        finishReconnectBankLink: async () => {},
        base44: { functions: { invoke: async (name, payload) => { capture.invoked = { name, payload }; return { link_token: 'link-sandbox' }; } } },
        setConnecting: () => {}, setError: v => errors.push(v),
        loadAccounts: async () => {}, syncAccount: async () => {},
        accounts: [{ id: 'acct-1', account_type: 'checking' }],
        ...extra,
      },
      capture, saved, cleared, errors,
    };
  };

  for (const native of [true, false]) {
    const { scope, capture, saved, cleared } = makeScope(native);
    await connectBank(scope);
    assert.equal(capture.invoked.payload.native, native, 'connectBank must report its own platform, not trust anything else');
    assert.equal(saved.length, native ? 1 : 0, `savePendingBankLink must only run natively (native=${native})`);
    if (native) assert.deepEqual(saved[0], { link_token: 'link-sandbox', mode: 'new' });

    await capture.config.onSuccess('public-token', { institution: { name: 'Fixture' } });
    assert.equal(cleared.length, native ? 1 : 0, 'a successful link must clear the pending entry natively, and be a no-op on web');

    const { scope: exitScope, capture: exitCapture, cleared: exitCleared, errors: exitErrors } = makeScope(native);
    await connectBank(exitScope); // connectBank itself calls setError(null) up front to clear any prior error - not a failure
    exitCapture.config.onExit(null); // user cancelled - still not an error
    assert.ok(exitErrors.every(e => e === null), 'a plain cancel must never surface an actual error message');
    assert.equal(exitCleared.length, native ? 1 : 0);

    const { scope: failScope, capture: failCapture, cleared: failCleared, errors: failErrors } = makeScope(native);
    await connectBank(failScope);
    failCapture.config.onExit({ error_code: 'INVALID_LINK_TOKEN' });
    assert.deepEqual(failErrors.filter(e => e !== null), ['Bank connection was cancelled.']);
    assert.equal(failCleared.length, native ? 1 : 0);
  }

  for (const native of [true, false]) {
    const { scope, capture, saved, cleared } = makeScope(native);
    await reconnectAccount('acct-1', scope);
    assert.equal(capture.invoked.payload.connected_account_id, 'acct-1');
    assert.equal(capture.invoked.payload.native, native);
    assert.equal(saved.length, native ? 1 : 0);
    if (native) assert.deepEqual(saved[0], { link_token: 'link-sandbox', mode: 'reconnect', connected_account_id: 'acct-1' });

    await capture.config.onSuccess();
    assert.equal(cleared.length, native ? 1 : 0);
  }
}

console.log('PASS native bank link: strict redirect URL validation, duplicate-delivery dedupe, pending-link staleness/storage-failure safety, auto-sync queue consumed once, exact exchange/reconnect server calls, frontend/backend redirect URI parity, connectBank/reconnectAccount only persist resume state natively');
