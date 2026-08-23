import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import Stripe from 'npm:stripe@14.21.0';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = user.id;
    console.log(`[deleteAccount] Starting deletion for user ${userId}`);

    // 1. Cancel active Stripe subscription if one exists
    try {
      const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY'));
      const subscriptions = await base44.asServiceRole.entities.Subscription.filter({ created_by_id: userId });
      for (const sub of subscriptions) {
        if (sub.stripe_subscription_id && sub.status === 'active') {
          console.log(`[deleteAccount] Canceling Stripe subscription ${sub.stripe_subscription_id}`);
          await stripe.subscriptions.cancel(sub.stripe_subscription_id);
        }
      }
    } catch (err) {
      console.error('[deleteAccount] Stripe cancellation error (non-fatal):', err.message);
    }

    // 2. Revoke Plaid Items via /item/remove before deleting local records
    try {
      const connectedAccounts = await base44.asServiceRole.entities.ConnectedAccount.filter({ created_by_id: userId });
      const plaidAccounts = connectedAccounts.filter(a => a.provider === 'plaid' && a.access_token_ref);

      if (plaidAccounts.length > 0) {
        const plaidClientId = Deno.env.get('PLAID_CLIENT_ID');
        const plaidSecret = Deno.env.get('PLAID_SECRET');
        const plaidEnv = 'production';

        for (const account of plaidAccounts) {
          try {
            console.log(`[deleteAccount] Revoking Plaid item for account ${account.id}`);
            const res = await fetch(`https://${plaidEnv}.plaid.com/item/remove`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                client_id: plaidClientId,
                secret: plaidSecret,
                access_token: account.access_token_ref,
              }),
            });
            const data = await res.json();
            if (data.removed) {
              console.log(`[deleteAccount] Plaid item removed for account ${account.id}`);
            } else {
              console.warn(`[deleteAccount] Plaid item/remove returned unexpected response for account ${account.id}:`, JSON.stringify(data));
            }
          } catch (plaidErr) {
            console.error(`[deleteAccount] Plaid item/remove failed for account ${account.id} (non-fatal):`, plaidErr.message);
          }
        }
      } else {
        console.log('[deleteAccount] No Plaid accounts to revoke');
      }
    } catch (err) {
      console.error('[deleteAccount] Plaid revocation error (non-fatal):', err.message);
    }

    // 3. Delete all user-owned entities
    const entityNames = [
      'Transaction',
      'Budget',
      'Bill',
      'SavingsGoal',
      'NetWorthEntry',
      'ConnectedAccount',
      'BankSyncLog',
      'AIInsightCache',
      'Subscription',
    ];

    for (const entityName of entityNames) {
      try {
        const records = await base44.asServiceRole.entities[entityName].filter({ created_by_id: userId });
        await Promise.all(records.map(r => base44.asServiceRole.entities[entityName].delete(r.id)));
        console.log(`[deleteAccount] Deleted ${records.length} ${entityName} records`);
      } catch (err) {
        console.error(`[deleteAccount] Error deleting ${entityName} (non-fatal):`, err.message);
      }
    }

    console.log(`[deleteAccount] Full deletion complete for user ${userId}`);

    return Response.json({ success: true });
  } catch (error) {
    console.error('[deleteAccount] Fatal error:', error.message);
    return Response.json({ error: 'We couldn\'t complete your account deletion. Please try again or contact support.' }, { status: 500 });
  }
});