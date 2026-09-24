import { handleOptions, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { serviceClient, requireSystemCaller } from '../_shared/supabase.ts';

// System job (pg_cron with the service-role key) — but also callable by an admin
// user for a manual "sync now" trigger, mirroring the original's dual auth check.
Deno.serve(async (req) => {
  const opt = handleOptions(req);
  if (opt) return opt;

  try {
    const admin = serviceClient();

    // Deny by default.
    //
    // This previously read: if not a service-role call, resolve the user,
    // and IF a user resolved, require admin. Failing to resolve a user —
    // no token, an expired one, or the public anon key that ships in the
    // frontend bundle — skipped the check entirely and fell through to
    // syncing every account in the system. The response then returned each
    // account's name, so an unauthenticated caller got a directory of every
    // connected bank account across all users, and triggered a paid Plaid
    // call for each one.
    //
    // An unauthenticated caller is not an admin. That has to be the
    // default branch, not a case that falls through.
    const denied = await requireSystemCaller(req, admin, jsonResponse);
    if (denied) return denied;

    // Candidates, not a guarantee of who actually syncs. 'connected' is the
    // normal case; 'error' lets a transient prior failure heal on the next
    // scheduled run instead of waiting for someone to notice and click Retry;
    // 'syncing' is included so an ABANDONED row - the worker that claimed it
    // died before clearing the status - gets a chance to be reclaimed rather
    // than sitting outside every future run forever, which is the exact
    // stuck-state failure this exists to recover from. 'reconnect_required'
    // and 'disconnected' are excluded: the first needs a fresh Plaid Link,
    // not a sync, and the second means the owner asked to stop.
    //
    // This list does not by itself decide who wins a race or whether a
    // 'syncing' row is actually stale enough to reclaim - beginBankSync does
    // that atomically, against the live row, for every account attempted
    // below. Listing 'syncing' here just means a genuinely-abandoned account
    // is not silently skipped every single run; a still-active one is
    // attempted too, and simply refused.
    const { data: accounts, error: accountError } = await admin.from('connected_accounts')
      .select('id, account_type')
      .in('sync_status', ['connected', 'error', 'syncing']);
    if (accountError) throw new Error('Could not load connected accounts');
    if (!accounts || accounts.length === 0) {
      console.log('No connected accounts to sync.');
      return jsonResponse({ message: 'No connected accounts to sync.', synced: 0 }, 200, {}, req);
    }

    console.log(`Starting sync for ${accounts.length} connected account(s)...`);
    const results = [];
    const baseUrl = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!baseUrl || !serviceKey) throw new Error('Sync configuration unavailable');

    for (const account of accounts) {
      try {
        // No pre-mark here. This used to flip sync_status to 'syncing'
        // itself before calling the child function - unconditionally, with
        // no check of the row's current state. That did not just duplicate
        // beginBankSync's job, it defeated it: the child function re-reads
        // the row fresh, so by the time IT ran, the status this loop had
        // just written was the only status it could ever see. Two racing
        // callers for the same account - this loop and a manual "Sync now"
        // click, or two overlapping scheduled runs - would BOTH observe
        // 'syncing' as the starting point and both transition 'syncing' to
        // 'syncing', which trivially satisfies an equality check and let
        // both proceed to call Plaid concurrently for the same account.
        // beginBankSync, inside the child function, is now the only place
        // that claims a row, and it is the same code path a direct user
        // request goes through - the one place that can actually see every
        // caller and arbitrate between them.

        // Investment accounts (Coinbase and similar) report holdings, not a
        // dated transaction log — Plaid's transactionsGet doesn't apply to
        // them (the item was never authorized for that product), so they
        // route to the holdings sync instead.
        const functionsUrl = account.account_type === 'investment'
          ? `${baseUrl}/functions/v1/plaid-sync-holdings`
          : `${baseUrl}/functions/v1/plaid-sync-transactions`;

        const res = await fetch(functionsUrl, {
          method: 'POST',
          headers: { Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ connected_account_id: account.id }),
        });

        if (res.status === 409) {
          // Someone else genuinely holds this account's sync right now - a
          // user's own click, or another concurrent run. Not a failure: that
          // other caller owns reporting the outcome, and re-marking the row
          // here would just be a second write racing the one already
          // in flight. Recorded separately so it is never counted as this
          // batch failing to do its job.
          results.push({ id: account.id, status: 'skipped' });
          continue;
        }

        const syncResponse = await res.json();
        if (!res.ok || syncResponse?.error) throw new Error('Downstream sync failed');
        const confirmed = account.account_type === 'investment'
          ? Number.isFinite(syncResponse?.synced)
          : Number.isFinite(syncResponse?.imported);
        if (syncResponse?.success !== true || !confirmed) throw new Error('Downstream sync was not confirmed');
        // Child functions own success timestamps and reconnect_required state.
        // Never manufacture a fresh timestamp from an HTTP error response.
        results.push({ id: account.id, status: 'success' });
      } catch {
        console.error("A scheduled account sync failed");
        // Guarded: a genuine failure inside the child function already ran
        // failBankSync and moved the row off 'syncing' itself, so this is a
        // no-op then. It only actually writes for failures ABOVE the child
        // function - the fetch itself throwing, or a malformed response -
        // where nothing else recorded that this account did not sync.
        await admin.from('connected_accounts').update({
          sync_status: 'error',
          error_message: "We couldn't sync this account. Please try again.",
        }).eq('id', account.id).eq('sync_status', 'syncing');
        results.push({ id: account.id, status: 'error', error: 'Sync failed' });
      }
    }

    const succeeded = results.filter((r) => r.status === 'success').length;
    const skipped = results.filter((r) => r.status === 'skipped').length;
    const failed = results.filter((r) => r.status === 'error').length;
    console.log(`Sync complete. Success: ${succeeded}, Skipped: ${skipped}, Failed: ${failed}`);
    // A skip is not a failure - it means another caller has this account
    // and this run correctly stayed out of the way. Only real failures
    // should make the batch's own status reflect trouble.
    return jsonResponse({ synced: succeeded, skipped, failed, results }, failed ? 502 : 200, {}, req);
  } catch (error) {
    console.error('sync-all-accounts fatal error:', error.message);
    return errorResponse("We couldn't sync your accounts. Please try again.", 500, { internal: error, fn: 'sync-all-accounts', req });
  }
});
