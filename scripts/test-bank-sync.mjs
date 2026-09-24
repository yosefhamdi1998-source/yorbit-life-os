import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { transformSync } from 'esbuild';

const compile = path => transformSync(fs.readFileSync(path, 'utf8').replace(/^import .*;\r?\n/gm, '').replace(/^export /gm, ''), { loader: 'ts' }).code;
const shared = compile('supabase/functions/_shared/bankSync.ts') + compile('supabase/functions/_shared/holdingsSnapshot.ts');

async function run(kind, scenario = 'success') {
  let handler, providerCalls = 0;
  const writes = [], logs = [], transactions = [];
  const account = { id: 'fixture-account', user_id: 'fixture-owner', provider_account_id: 'fixture-bank', sync_status: 'connected', last_synced_at: '2026-01-01', history_backfilled_at: null, updated_date: '2026-09-22T00:00:00.000Z' };
  const admin = {
    rpc: async (name, params) => {
      if (name !== 'replace_investment_holdings_snapshot') return {data:[],error:null};
      assert.equal(params.p_account_id, account.id);assert.equal(params.p_user_id,account.user_id);
      if (['insert-error','partial','finish-error'].includes(scenario) || account.sync_status !== 'syncing') return {data:null,error:Error('Synthetic atomic save failure')};
      transactions.push(...params.p_holdings);
      account.sync_status='connected';account.last_synced_at='2026-09-22';account.error_message=null;
      return {data:params.p_holdings.length,error:null};
    },
    from(table) {
      let operation = 'read', patch, filters = [], start = 0;
      const q = {
        select() { return q; },
        eq(k, v) { filters.push(['eq', k, v]); return q; },
        // beginBankSync's atomic claim: a live row is excluded from
        // reclaim ('neq'), and the actual staleness test arrives as a raw
        // PostgREST or() string - see matchesFilter below for the parser.
        neq(k, v) { filters.push(['neq', k, v]); return q; },
        or(filterString) { filters.push(['or', filterString]); return q; },
        not() { return q; }, gte() { return q; }, lte() { return q; },
        range(from) { start = from; return q; },
        update(value) { operation = 'update'; patch = value; return q; },
        insert(value) { operation = 'insert'; patch = value; return q; },
        upsert(value) { operation = 'insert'; patch = value; return q; },
        single() { return execute(); }, maybeSingle() { return execute(); },
        then(resolve, reject) { return execute().then(resolve, reject); },
      };
      async function execute() {
        if (operation === 'read') {
          if (table === 'connected_accounts') return { data: scenario === 'missing' ? null : { ...account }, error: null };
          assert.equal(table, 'transactions');
          if (scenario === 'read-error') return { data: null, error: new Error('Synthetic read failure') };
          return { data: scenario === 'duplicate' && start === 0 ? [{ provider_transaction_id: 'tx-0' }] : [], error: null };
        }
        if (table === 'connected_accounts') {
          assert.equal(operation, 'update');
          // Mirrors just enough of PostgREST's filter grammar to evaluate
          // what beginBankSync actually sends: eq/neq are plain equality,
          // and or() is a comma-joined list of `column.operator.value`
          // terms, true if ANY one matches - exactly the "not currently
          // syncing, OR syncing but stale" claim condition.
          const matchesTerm = (term) => {
            const [col, op, ...rest] = term.split('.');
            const val = rest.join('.');
            if (op === 'neq') return account[col] !== val;
            if (op === 'lt') return new Date(account[col]).getTime() < new Date(val).getTime();
            throw new Error(`Unsupported synthetic or() operator: ${op}`);
          };
          const matching = filters.every(([tag, a, b]) => {
            if (tag === 'eq') return account[a] === b;
            if (tag === 'neq') return account[a] !== b;
            if (tag === 'or') return a.split(',').some(matchesTerm);
            throw new Error(`Unsupported synthetic filter tag: ${tag}`);
          });
          const fails = scenario === 'start-error' && patch.sync_status === 'syncing' || scenario === 'finish-error' && patch.sync_status === 'connected';
          if (fails) return { data: null, error: new Error('Synthetic write failure') };
          if (matching) { Object.assign(account, patch); writes.push(patch); }
          return { data: matching ? { id: account.id } : null, error: null };
        }
        if (table === 'bank_sync_logs') { logs.push(patch); return { error: null }; }
        assert.ok(['transactions', 'investment_holdings'].includes(table));
        if (scenario === 'insert-error' || scenario === 'partial' && transactions.length === 1) return { error: new Error('Synthetic insert failure') };
        transactions.push(patch); return { error: null };
      }
      return q;
    },
  };
  function providerError() {
    if (scenario === 'reconnect' || scenario === 'disconnect-error' || scenario === 'provider-error') {
      if (scenario === 'disconnect-error') account.sync_status = 'disconnected';
      const error = new Error('Synthetic provider failure');
      if (scenario === 'reconnect') error.response = { data: { error_code: 'ITEM_LOGIN_REQUIRED' } };
      throw error;
    }
    if (scenario === 'disconnect') account.sync_status = 'disconnected';
  }
  const source = compile(`supabase/functions/plaid-sync-${kind}/index.ts`);
  vm.runInNewContext(`${shared}\n${source}`, {
    Deno: { serve: fn => { handler = fn; }, env: { get: () => 'fixture' } },
    handleOptions: () => null, serviceClient: () => admin,
    getUser: async () => { if (scenario === 'auth-error') throw new Error('Synthetic auth failure'); return scenario === 'anonymous' ? null : { id: scenario === 'foreign' ? 'someone-else' : 'fixture-owner' }; },
    isServiceBearer: () => scenario === 'service', getPlaidAccessToken: async () => ({ token: 'fixture-token' }),
    enforceRateLimit: async () => null, identityFromRequest: () => '', RULES: { sync: {} },
    jsonResponse: (body, status = 200) => ({ body, status }), errorResponse: (error, status) => ({ body: { error }, status }),
    Configuration: class {}, PlaidEnvironments: { production: 'unused' },
    PlaidApi: class {
      async transactionsGet({ options }) {
        providerCalls++; providerError();
        assert.equal(options.account_ids[0], 'fixture-bank');
        const empty = scenario === 'empty-page' || scenario === 'empty';
        const rows = empty ? [] : [0, 1].map(i => ({ transaction_id: `tx-${options.offset + i}`, amount: i ? -12 : 25, date: '2026-09-01', name: 'Fixture', pending: false }));
        return { data: { transactions: rows, total_transactions: scenario === 'page-cap' ? 99999 : scenario === 'empty' ? 0 : 2, accounts: [] } };
      }
      async investmentsHoldingsGet({options}) {
        assert.equal(options.account_ids[0], 'fixture-bank');
        providerCalls++; providerError();
        return { data: { accounts: [{account_id:'fixture-bank'}], holdings: [0, 1].map(i => ({ account_id: 'fixture-bank', security_id: `sec-${i}`, quantity: 1, institution_value: 50, iso_currency_code: 'USD' })), securities: [0, 1].map(i => ({ security_id: `sec-${i}`, name: `Fixture ${i}`, ticker_symbol: `F${i}` })) } };
      }
    },
    console: { log() {}, warn() {}, error() {} },
  });
  const req = new Request('https://fixture.invalid/sync', { method: 'POST', body: scenario === 'invalid-json' ? '{' : JSON.stringify({ connected_account_id: account.id }) });
  const response = await handler(req);
  return { response, providerCalls, account, writes, logs, transactions };
}

let passed = 0;
for (const kind of ['transactions', 'holdings']) {
  for (const scenario of ['reconnect', 'success', 'service', 'provider-error', 'auth-error', 'anonymous', 'foreign', 'missing', 'invalid-json', 'start-error', 'finish-error', 'insert-error', 'partial', 'disconnect', 'disconnect-error']) {
    const result = await run(kind, scenario);
    const { response, providerCalls, account, logs, transactions, writes } = result;
    const succeeds = ['success', 'service'].includes(scenario);
    assert.equal(response.status === 200, succeeds, `${kind}/${scenario}: HTTP success must mean a complete, persisted sync`);
    if (['auth-error', 'anonymous', 'foreign', 'missing', 'invalid-json', 'start-error'].includes(scenario)) {
      assert.equal(providerCalls, 0, `${kind}/${scenario}: no provider call before successful authorized start`);
      assert.equal(writes.length, 0, `${kind}/${scenario}: no unauthorized cleanup write`);
      assert.equal(logs.length, 0);
    } else if (scenario.startsWith('disconnect')) {
      assert.equal(account.sync_status, 'disconnected');
      assert.equal(account.last_synced_at, '2026-01-01');
    } else {
      assert.equal(account.sync_status, succeeds ? 'connected' : scenario === 'reconnect' ? 'reconnect_required' : 'error', `${kind}/${scenario}`);
      assert.equal(logs.length, 1, `${kind}/${scenario}: observable outcome`);
      assert.equal(logs[0].imported_count, transactions.length);
      if (!succeeds) assert.equal(account.last_synced_at, '2026-01-01', `${kind}/${scenario}: preserve last successful sync`);
      else assert.equal(account.error_message, null);
    }
    passed++;
  }
}
for (const scenario of ['empty-page', 'page-cap', 'read-error', 'duplicate', 'empty']) {
  const r = await run('transactions', scenario);
  if (['duplicate', 'empty'].includes(scenario)) {
    assert.equal(r.response.status, 200);
    assert.equal(r.transactions.length, scenario === 'empty' ? 0 : 1);
  } else {
    assert.notEqual(r.response.status, 200, scenario);
    assert.equal(r.account.history_backfilled_at, null, scenario);
    assert.equal(r.account.last_synced_at, '2026-01-01', scenario);
    assert.equal(r.transactions.length, 0, scenario);
  }
  assert.ok(r.providerCalls <= 40, 'Pagination must remain bounded');
  passed++;
}
console.log(`PASS ${passed} bank-sync scenarios using real handlers and Request bodies; synthetic auth, Plaid and database only`);
