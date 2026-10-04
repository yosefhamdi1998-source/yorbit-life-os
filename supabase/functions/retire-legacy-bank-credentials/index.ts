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
// run>, "limit": n}. confirm must equal the current count, so a run never
// acts on a set the operator has not just looked at. Repeating is safe:
// finished accounts drop out; failures keep their credential for the next run.
// Output and logs carry account ids and reason codes only - never tokens,
// institution names, balances or provider payloads.

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

type Candidate = { id: string; user_id: string; provider_item_id: string | null; sync_status: string; shared_item_in_use: boolean };

async function findCandidates(admin: ReturnType<typeof serviceClient>): Promise<Candidate[]> {
  const { data: accounts, error } = await admin.from('connected_accounts')
    .select('id, user_id, provider_item_id, sync_status')
    .eq('provider', 'plaid')
    .in('sync_status', ['disconnected', 'disconnecting']);
  if (error || !Array.isArray(accounts)) throw new Error('Could not list disconnected accounts');
  if (!accounts.length) return [];
  const ids = accounts.map(a => a.id);

  // Which still hold a credential. Selects ids only, never the token.
  const { data: vault, error: vaultError } = await admin.from('plaid_credentials')
    .select('connected_account_id').in('connected_account_id', ids);
  if (vaultError || !Array.isArray(vault)) throw new Error('Could not check stored credentials');
  const { data: legacyColumn, error: legacyError } = await admin.from('connected_accounts')
    .select('id').in('id', ids).not('access_token_ref', 'is', null);
  if (legacyError || !Array.isArray(legacyColumn)) throw new Error('Could not check legacy credential column');
  const holding = new Set([...vault.map(v => v.connected_account_id), ...legacyColumn.map(l => l.id)]);

  // A 'disconnecting' account is unfinished even without a credential (its
  // finalize may be what failed); a 'disconnected' one only matters if it
  // still holds a credential.
  const found = accounts.filter(a => a.sync_status === 'disconnecting' || holding.has(a.id));

  // Informational only: claim_bank_disconnect decides at run time, under the
  // lock, whether a connected sibling still needs the Item.
  const items = [...new Set(found.map(a => a.provider_item_id).filter(Boolean))];
  const inUse = new Set<string>();
  if (items.length) {
    const { data: siblings, error: siblingError } = await admin.from('connected_accounts')
      .select('user_id, provider_item_id').in('provider_item_id', items)
      .not('sync_status', 'in', '(disconnecting,disconnected)');
    if (siblingError || !Array.isArray(siblings)) throw new Error('Could not check sibling accounts');
    for (const s of siblings) inUse.add(`${s.user_id}:${s.provider_item_id}`);
  }
  return found
    .map(a => ({ ...a, shared_item_in_use: inUse.has(`${a.user_id}:${a.provider_item_id}`) }))
    .sort((a, b) => a.id.localeCompare(b.id));
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
    const candidates = await findCandidates(admin);
    const summary = {
      candidates: candidates.length,
      disconnected_with_credential: candidates.filter(c => c.sync_status === 'disconnected').length,
      unfinished_disconnecting: candidates.filter(c => c.sync_status === 'disconnecting').length,
      sharing_an_item_still_in_use: candidates.filter(c => c.shared_item_in_use).length,
    };

    if (body?.dry_run !== false) {
      return jsonResponse({
        dry_run: true, ...summary,
        accounts: candidates.map(c => ({ account_id: c.id, state: c.sync_status, shared_item_in_use: c.shared_item_in_use })),
      }, 200, {}, req);
    }

    if (body?.confirm !== candidates.length) {
      return jsonResponse({ error: 'Run a dry run first and pass its candidate count as confirm.', dry_run: false, ...summary }, 409, {}, req);
    }
    const limit = Math.min(MAX_LIMIT, Math.max(1, Number.isInteger(body?.limit) ? body.limit : DEFAULT_LIMIT));

    const revokedTokens = new Set<string>();
    const results: Array<{ account_id: string; outcome: string; reason?: string }> = [];
    for (const c of candidates.slice(0, limit)) {
      // Sequential on purpose: Plaid calls stay slow and countable, and the
      // per-Item lock is never contended by this run itself.
      const r = await completeBankDisconnect(admin, c.user_id, c.id, { env: name => Deno.env.get(name), revokedTokens });
      if (r.status === 'done') results.push({ account_id: c.id, outcome: r.revoked ? 'revoked_and_cleaned' : 'cleaned' });
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
      retry,
      not_processed_this_run: candidates.length - results.length,
      results,
    }, retry ? 502 : 200, {}, req);
  } catch (error) {
    return errorResponse('Legacy credential cleanup failed before finishing; nothing further was changed. Run the dry run again.', 500, { internal: error, fn: 'retire-legacy-bank-credentials', req });
  }
});
