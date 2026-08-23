import { handleOptions, jsonResponse } from '../_shared/cors.ts';
import { getUser, serviceClient } from '../_shared/supabase.ts';
import Stripe from 'npm:stripe@14.21.0';

const ENTITY_TABLES = [
  'transactions', 'bills', 'budgets', 'goals', 'savings_goals', 'net_worth_entries',
  'habits', 'tasks', 'health_logs', 'journal_entries', 'notes', 'custom_forms',
  'custom_records', 'ai_insight_caches', 'notifications', 'connected_accounts',
  'bank_sync_logs', 'subscriptions',
];

Deno.serve(async (req) => {
  const opt = handleOptions(req);
  if (opt) return opt;

  try {
    const user = await getUser(req);
    if (!user) return jsonResponse({ error: 'Unauthorized' }, 401);

    const admin = serviceClient();
    const userId = user.id;
    console.log(`[delete-account] Starting deletion for user ${userId}`);

    // 1. Cancel active Stripe subscription if one exists (no-op safely if billing isn't configured yet)
    try {
      const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
      if (stripeKey) {
        const stripe = new Stripe(stripeKey);
        const { data: subs } = await admin.from('subscriptions').select('*').eq('user_id', userId);
        for (const sub of subs || []) {
          if (sub.stripe_subscription_id && sub.status === 'active') {
            console.log(`[delete-account] Canceling Stripe subscription ${sub.stripe_subscription_id}`);
            await stripe.subscriptions.cancel(sub.stripe_subscription_id);
          }
        }
      }
    } catch (err) {
      console.error('[delete-account] Stripe cancellation error (non-fatal):', err.message);
    }

    // 2. Revoke Plaid items before deleting local records (no-op safely if bank sync isn't configured yet)
    try {
      const plaidClientId = Deno.env.get('PLAID_CLIENT_ID');
      const plaidSecret = Deno.env.get('PLAID_SECRET');
      if (plaidClientId && plaidSecret) {
        const { data: accounts } = await admin
          .from('connected_accounts')
          .select('*')
          .eq('user_id', userId)
          .eq('provider', 'plaid')
          .not('access_token_ref', 'is', null);

        for (const account of accounts || []) {
          try {
            const res = await fetch('https://production.plaid.com/item/remove', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                client_id: plaidClientId,
                secret: plaidSecret,
                access_token: account.access_token_ref,
              }),
            });
            const data = await res.json();
            if (!data.removed) {
              console.warn(`[delete-account] Plaid item/remove unexpected response for ${account.id}:`, JSON.stringify(data));
            }
          } catch (plaidErr) {
            console.error(`[delete-account] Plaid item/remove failed for ${account.id} (non-fatal):`, plaidErr.message);
          }
        }
      }
    } catch (err) {
      console.error('[delete-account] Plaid revocation error (non-fatal):', err.message);
    }

    // 3. Delete all user-owned rows across every table
    for (const table of ENTITY_TABLES) {
      const { error, count } = await admin.from(table).delete({ count: 'exact' }).eq('user_id', userId);
      if (error) {
        console.error(`[delete-account] Error deleting from ${table} (non-fatal):`, error.message);
      } else {
        console.log(`[delete-account] Deleted ${count ?? 0} rows from ${table}`);
      }
    }

    // 4. Delete advisor chat history if present
    await admin.from('advisor_messages').delete().eq('user_id', userId).then(() => {}).catch(() => {});
    await admin.from('advisor_conversations').delete().eq('user_id', userId).then(() => {}).catch(() => {});

    // 5. Finally, delete the auth user itself (profiles row cascades via FK)
    const { error: authDeleteError } = await admin.auth.admin.deleteUser(userId);
    if (authDeleteError) {
      console.error('[delete-account] Failed to delete auth user:', authDeleteError.message);
      return jsonResponse({ error: "We couldn't complete your account deletion. Please try again or contact support." }, 500);
    }

    console.log(`[delete-account] Full deletion complete for user ${userId}`);
    return jsonResponse({ success: true });
  } catch (error) {
    console.error('[delete-account] Fatal error:', error.message);
    return jsonResponse({ error: "We couldn't complete your account deletion. Please try again or contact support." }, 500);
  }
});
