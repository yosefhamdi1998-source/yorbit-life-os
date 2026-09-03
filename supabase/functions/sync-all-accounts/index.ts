import { handleOptions, jsonResponse } from '../_shared/cors.ts';
import { getUser, serviceClient } from '../_shared/supabase.ts';

// System job (pg_cron with the service-role key) — but also callable by an admin
// user for a manual "sync now" trigger, mirroring the original's dual auth check.
Deno.serve(async (req) => {
  const opt = handleOptions(req);
  if (opt) return opt;

  try {
    const admin = serviceClient();

    // If a user JWT is present, require admin. If not (system/cron call), proceed.
    const authHeader = req.headers.get('Authorization') || '';
    const isServiceRoleCall = authHeader.includes(Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '__none__');
    if (!isServiceRoleCall) {
      const user = await getUser(req);
      if (user) {
        const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).single();
        if (profile?.role !== 'admin') return jsonResponse({ error: 'Forbidden' }, 403);
      }
    }

    const { data: accounts } = await admin.from('connected_accounts').select('*').eq('sync_status', 'connected');
    if (!accounts || accounts.length === 0) {
      console.log('No connected accounts to sync.');
      return jsonResponse({ message: 'No connected accounts to sync.', synced: 0 });
    }

    console.log(`Starting sync for ${accounts.length} connected account(s)...`);
    const results = [];
    const baseUrl = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    for (const account of accounts) {
      try {
        await admin.from('connected_accounts').update({ sync_status: 'syncing' }).eq('id', account.id);

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
        console.log(`Sync complete for ${account.account_name}:`, JSON.stringify(syncResponse));

        await admin.from('connected_accounts').update({
          sync_status: 'connected',
          last_synced_at: new Date().toISOString(),
          error_message: null,
        }).eq('id', account.id);

        results.push({ id: account.id, name: account.account_name, status: 'success' });
      } catch (err) {
        console.error(`Sync failed for account ${account.id}:`, err.message);
        await admin.from('connected_accounts').update({
          sync_status: 'error',
          error_message: "We couldn't sync this account. Please try again.",
        }).eq('id', account.id);
        results.push({ id: account.id, name: account.account_name, status: 'error', error: 'Sync failed' });
      }
    }

    const succeeded = results.filter((r) => r.status === 'success').length;
    const failed = results.filter((r) => r.status === 'error').length;
    console.log(`Sync complete. Success: ${succeeded}, Failed: ${failed}`);
    return jsonResponse({ synced: succeeded, failed, results });
  } catch (error) {
    console.error('sync-all-accounts fatal error:', error.message);
    return jsonResponse({ error: "We couldn't sync your accounts. Please try again." }, 500);
  }
});
