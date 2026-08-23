import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Verify admin or scheduled call
    const isAuthenticated = await base44.auth.isAuthenticated();
    if (isAuthenticated) {
      const user = await base44.auth.me();
      if (user.role !== 'admin') {
        return Response.json({ error: 'Forbidden' }, { status: 403 });
      }
    }

    const accounts = await base44.asServiceRole.entities.ConnectedAccount.filter({ sync_status: 'connected' });

    if (!accounts || accounts.length === 0) {
      console.log('No connected accounts to sync.');
      return Response.json({ message: 'No connected accounts to sync.', synced: 0 });
    }

    console.log(`Starting sync for ${accounts.length} connected account(s)...`);

    const results = [];

    for (const account of accounts) {
      try {
        console.log(`Syncing account: ${account.institution_name} / ${account.account_name} (${account.id})`);

        // Mark as syncing
        await base44.asServiceRole.entities.ConnectedAccount.update(account.id, {
          sync_status: 'syncing',
        });

        // Invoke the existing plaid sync function
        const syncResponse = await base44.asServiceRole.functions.invoke('plaidSyncTransactions', {
          connected_account_id: account.id,
        });

        console.log(`Sync complete for ${account.account_name}:`, JSON.stringify(syncResponse));

        // Mark back as connected on success
        await base44.asServiceRole.entities.ConnectedAccount.update(account.id, {
          sync_status: 'connected',
          last_synced_at: new Date().toISOString(),
          error_message: null,
        });

        results.push({ id: account.id, name: account.account_name, status: 'success' });
      } catch (err) {
        console.error(`Sync failed for account ${account.id}:`, err.message);

        await base44.asServiceRole.entities.ConnectedAccount.update(account.id, {
          sync_status: 'error',
          error_message: 'We couldn\'t sync this account. Please try again.',
        });

        results.push({ id: account.id, name: account.account_name, status: 'error', error: 'Sync failed' });
      }
    }

    const succeeded = results.filter(r => r.status === 'success').length;
    const failed = results.filter(r => r.status === 'error').length;

    console.log(`Sync complete. Success: ${succeeded}, Failed: ${failed}`);
    return Response.json({ synced: succeeded, failed, results });
  } catch (error) {
    console.error('syncAllAccounts fatal error:', error.message);
    return Response.json({ error: 'We couldn\'t sync your accounts. Please try again.' }, { status: 500 });
  }
});