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

    const { data: accounts, error: accountError } = await admin.from('connected_accounts').select('id, account_type').eq('sync_status', 'connected');
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
        const { error: startError } = await admin.from('connected_accounts').update({ sync_status: 'syncing' }).eq('id', account.id);
        if (startError) throw new Error('Could not mark sync in progress');

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
        await admin.from('connected_accounts').update({
          sync_status: 'error',
          error_message: "We couldn't sync this account. Please try again.",
        }).eq('id', account.id).eq('sync_status', 'syncing');
        results.push({ id: account.id, status: 'error', error: 'Sync failed' });
      }
    }

    const succeeded = results.filter((r) => r.status === 'success').length;
    const failed = results.filter((r) => r.status === 'error').length;
    console.log(`Sync complete. Success: ${succeeded}, Failed: ${failed}`);
    return jsonResponse({ synced: succeeded, failed, results }, failed ? 502 : 200, {}, req);
  } catch (error) {
    console.error('sync-all-accounts fatal error:', error.message);
    return errorResponse("We couldn't sync your accounts. Please try again.", 500, { internal: error, fn: 'sync-all-accounts', req });
  }
});
