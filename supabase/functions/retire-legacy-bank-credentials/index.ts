import { handleOptions, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { serviceClient, requireSystemCaller } from '../_shared/supabase.ts';
import { completeBankDisconnect } from '../_shared/bankDisconnect.ts';

// OPERATOR MAINTENANCE - never scheduled, never called by the app.
//
// Before plaid-disconnect-account existed, the app marked accounts
// 'disconnected' in the browser and left their Plaid credential (and the
// bank Item) live. The app hides disconnected accounts, so their owners can
// no longer finish the job. Accounts left in 'disconnecting' by an abandoned
// retry are in the same position. This finds both and finishes them with
// exactly the user endpoint's sequence (_shared/bankDisconnect.ts): claim
// under the per-Item lock, revoke only when no still-connected sibling needs
// the Item, then delete the credential and mark disconnected atomically.
//
// Dry run by default: {} or {"dry_run": true} lists candidates and changes
// nothing. To act: {"dry_run": false, "confirm": <candidates from the dry
// run>, "review_token": <dry-run fingerprint>, "limit": n}. Both the count
// and fingerprint must match a fresh scan of account ids, states and Items. Repeating is safe:
// finished accounts drop out; failures keep their credential for the next run.
// Output and logs carry account ids and reason codes only - never tokens,
// institution names, balances or provider payloads.

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

type Candidate = { id: string; user_id: string; provider_item_id: string | null; sync_status: string; shared_item_in_use: boolean };

// Continue until an empty page, even if the project caps responses below our
// requested page size. A bounded scan must fail closed, never return a partial
// candidate list that can be mistaken for "nothing left".
const PAGE_SIZE = 100;
const MAX_SCAN_ROWS = 10000;
async function readPages(makeQuery: () => any, key = 'id'): Promise<any[]> {
  const rows: any[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < 200; page++) {
    let query = makeQuery().order(key, { ascending: true }).limit(PAGE_SIZE);
    if (cursor) query = query.gt(key, cursor);
    const { data, error } = await query;
    if (error || !Array.isArray(data)) throw new Error('Cleanup scan failed');
    if (!data.length) return rows;
    const next = data[data.length - 1][key];
    if (typeof next !== 'string' || (cursor && next <= cursor)) throw new Error('Cleanup scan did not advance');
    rows.push(...data);
    if (rows.length > MAX_SCAN_ROWS) throw new Error('Cleanup scan exceeds the safety bound');
    cursor = next;
  }
  throw new Error('Cleanup scan exceeds the page bound');
}

async function findCandidates(admin: ReturnType<typeof serviceClient>): Promise<Candidate[]> {
  const accounts = await readPages(() => admin.from('connected_accounts')
    .select('id, user_id, provider_item_id, sync_status')
    .eq('provider', 'plaid').in('sync_status', ['disconnected', 'disconnecting']));
  const found: Candidate[] = [];
  // Chunk IN filters as well as results, so long account lists cannot overflow
  // request URLs. Credential queries select identifiers, never token values.
  for (let offset = 0; offset < accounts.length; offset += PAGE_SIZE) {
    const batch = accounts.slice(offset, offset + PAGE_SIZE);
    const ids = batch.map(a => a.id);
    const vault = await readPages(() => admin.from('plaid_credentials')
      .select('connected_account_id').in('connected_account_id', ids), 'connected_account_id');
    const legacy = await readPages(() => admin.from('connected_accounts')
      .select('id').in('id', ids).not('access_token_ref', 'is', null));
    const holding = new Set([...vault.map(v => v.connected_account_id), ...legacy.map(l => l.id)]);
    const eligible = batch.filter(a => a.sync_status === 'disconnecting' || holding.has(a.id));
    const items = [...new Set(eligible.map(a => a.provider_item_id).filter(Boolean))];
    const inUse = new Set<string>();
    if (items.length) {
      const siblings = await readPages(() => admin.from('connected_accounts')
        .select('id, user_id, provider_item_id').eq('provider', 'plaid').in('provider_item_id', items)
        .not('sync_status', 'in', '(disconnecting,disconnected)'));
      for (const sibling of siblings) inUse.add(sibling.user_id + ':' + sibling.provider_item_id);
    }
    found.push(...eligible.map(a => ({ ...a, shared_item_in_use: inUse.has(a.user_id + ':' + a.provider_item_id) })));
  }
  return found.sort((a, b) => a.id.localeCompare(b.id));
}

// A review fingerprint, not an authentication token. No credential values
// are included. Account replacement or state/Item changes invalidate it,
// even when the number of candidates happens to stay the same.
async function reviewToken(candidates: Candidate[]): Promise<string> {
  const snapshot = candidates.map(c => [c.id, c.user_id, c.provider_item_id, c.sync_status, c.shared_item_in_use]);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(snapshot)));
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req) => {
  const opt = handleOptions(req);
  if (opt) return opt;
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405, {}, req);

  try {
    const admin = serviceClient();
    // Service key or a signed-in admin only; deny by default.
    const denied = await requireSystemCaller(req, admin, jsonResponse);
    if (denied) return denied;

    const body = await req.json().catch(() => ({}));
    if (body?.dry_run === false && body?.limit !== undefined
        && (!Number.isInteger(body.limit) || body.limit < 1 || body.limit > MAX_LIMIT)) {
      return jsonResponse({ error: 'limit must be an integer from 1 to 100.' }, 400, {}, req);
    }
    const candidates = await findCandidates(admin);
    const review_token = await reviewToken(candidates);
    const summary = {
      candidates: candidates.length,
      disconnected_with_credential: candidates.filter(c => c.sync_status === 'disconnected').length,
      unfinished_disconnecting: candidates.filter(c => c.sync_status === 'disconnecting').length,
      sharing_an_item_still_in_use: candidates.filter(c => c.shared_item_in_use).length,
    };

    if (body?.dry_run !== false) {
      return jsonResponse({
        dry_run: true, review_token, ...summary,
        accounts: candidates.map(c => ({ account_id: c.id, state: c.sync_status, shared_item_in_use: c.shared_item_in_use })),
      }, 200, {}, req);
    }

    if (body?.confirm !== candidates.length || body?.review_token !== review_token) {
      return jsonResponse({ error: 'Run a fresh dry run and pass its candidate count as confirm and its review_token.', dry_run: false, ...summary }, 409, {}, req);
    }
    const limit = body.limit ?? DEFAULT_LIMIT;

    const revokedItems = new Set<string>();
    const failedItems = new Set<string>();
    const results: Array<{ account_id: string; outcome: string; reason?: string }> = [];
    for (const c of candidates.slice(0, limit)) {
      // Sequential on purpose: Plaid calls stay slow and countable, and the
      // per-Item lock is never contended by this run itself.
      const r = await completeBankDisconnect(admin, c.user_id, c.id, { env: name => Deno.env.get(name), revokedItems, failedItems, legacy: { expectedItemId: c.provider_item_id } });
      if (r.status === 'done') results.push({ account_id: c.id, outcome: r.revoked ? 'revoked_and_cleaned' : 'cleaned' });
      else if (r.status === 'skipped') results.push({ account_id: c.id, outcome: 'skipped', reason: r.reason });
      else if (r.status === 'not_found') results.push({ account_id: c.id, outcome: 'already_gone' });
      else {
        results.push({ account_id: c.id, outcome: 'retry', reason: r.reason });
        console.error(`retire-legacy-bank-credentials: ${c.id} kept for retry (${r.reason})`);
      }
    }
    const retry = results.filter(r => r.outcome === 'retry').length;
    return jsonResponse({
      dry_run: false,
      processed: results.length,
      revoked: results.filter(r => r.outcome === 'revoked_and_cleaned').length,
      cleaned_without_revoking: results.filter(r => r.outcome === 'cleaned').length,
      already_gone: results.filter(r => r.outcome === 'already_gone').length,
      skipped: results.filter(r => r.outcome === 'skipped').length,
      retry,
      not_processed_this_run: candidates.length - results.length,
      results,
    }, retry ? 502 : 200, {}, req);
  } catch {
    return errorResponse('Legacy credential cleanup failed before finishing; nothing further was changed. Run the dry run again.', 500, { internal: 'cleanup_interrupted', fn: 'retire-legacy-bank-credentials', req });
  }
});
