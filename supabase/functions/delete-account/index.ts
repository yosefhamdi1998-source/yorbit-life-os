import { getPlaidAccessToken } from '../_shared/plaidToken.ts';
import { handleOptions, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { getUser, serviceClient } from '../_shared/supabase.ts';
import Stripe from 'npm:stripe@14.21.0';
import { enforceRateLimit, identityFromRequest, RULES } from '../_shared/rateLimit.ts';

// investment_holdings was missing here — verified live that deletion still
// fully removes it (every one of these tables' user_id FK to auth.users is
// ON DELETE CASCADE, so step 5 below catches anything this loop misses),
// but it belongs in the explicit list too so its row count actually gets
// logged rather than silently vanishing via cascade with no record of it.
const ENTITY_TABLES = [
  'transactions', 'bills', 'budgets', 'goals', 'savings_goals', 'net_worth_entries',
  'habits', 'tasks', 'health_logs', 'journal_entries', 'notes', 'custom_forms',
  'custom_records', 'ai_insight_caches', 'notifications', 'connected_accounts',
  'bank_sync_logs', 'subscriptions', 'investment_holdings',
];

Deno.serve(async (req) => {
  const opt = handleOptions(req);
  if (opt) return opt;

  try {
    const user = await getUser(req);
    if (!user) return jsonResponse({ error: 'Unauthorized' }, 401, {}, req);

    const limited = await enforceRateLimit(
      'delete-account', identityFromRequest(req, user.id), RULES.destructive,
      undefined, req,
    );
    if (limited) return limited;

    const admin = serviceClient();
    const userId = user.id;
    console.log(`[delete-account] Starting deletion for user ${userId}`);

    // Keep the identifiers needed to retry until Stripe confirms cancellation.
    try {
      const { data: subs, error: subscriptionError } = await admin.from('subscriptions')
        .select('stripe_subscription_id').eq('user_id', userId);
      if (subscriptionError || !Array.isArray(subs)) throw new Error('Subscription lookup failed');
      const subscriptionIds = [...new Set(subs.map(sub => sub.stripe_subscription_id).filter(Boolean))];
      if (subscriptionIds.length) {
        const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
        if (!stripeKey) throw new Error('Subscription cancellation is not configured');
        const stripe = new Stripe(stripeKey);
        for (const id of subscriptionIds) {
          // A webhook may be delayed; use current provider status, including trials and past-due plans.
          const subscription = await stripe.subscriptions.retrieve(id);
          if (['canceled', 'incomplete_expired'].includes(subscription.status)) continue;
          const canceled = await stripe.subscriptions.cancel(id);
          if (canceled.status !== 'canceled') throw new Error('Subscription cancellation not confirmed');
        }
      }
    } catch (err) {
      return errorResponse("We couldn't confirm your web subscription cancellation. Your account has not been deleted. Please try again or contact support.", 503, { internal: err, fn: 'delete-account', req });
    }
    // Confirm bank revocation before discarding the credentials needed to retry.
    try {
      const { data: accounts, error: accountError } = await admin.from('connected_accounts')
        .select('id').eq('user_id', userId).eq('provider', 'plaid');
      if (accountError || !Array.isArray(accounts)) throw new Error('Bank connection lookup failed');
      if (accounts.length) {
        const plaidClientId = Deno.env.get('PLAID_CLIENT_ID');
        const plaidSecret = Deno.env.get('PLAID_SECRET');
        if (!plaidClientId || !plaidSecret) throw new Error('Bank disconnect is not configured');
        const removedTokens = new Set<string>();
        for (const account of accounts) {
          const { token } = await getPlaidAccessToken(admin, account.id);
          if (!token) throw new Error('Bank credential unavailable');
          if (removedTokens.has(token)) continue;
          const res = await fetch('https://production.plaid.com/item/remove', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ client_id: plaidClientId, secret: plaidSecret, access_token: token }),
          });
          const data = await res.json();
          // Current responses contain request_id, not the legacy removed boolean.
          // ITEM_NOT_FOUND also covers a successful removal on an earlier attempt.
          const alreadyRemoved = res.status === 400 && data.error_type === 'ITEM_ERROR' && data.error_code === 'ITEM_NOT_FOUND';
          if (!alreadyRemoved && (!res.ok || data.error_code || data.removed === false || (!data.request_id && data.removed !== true))) {
            throw new Error('Bank disconnect not confirmed');
          }
          removedTokens.add(token);
        }
      }
    } catch (err) {
      return errorResponse("We couldn't confirm that your bank connections were disconnected. Your account has not been deleted. Please try again or contact support. Any web subscription canceled during this attempt remains canceled.", 503, { internal: err, fn: 'delete-account', req });
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
      return errorResponse("We couldn't complete your account deletion. Please try again or contact support.", 500, { internal: authDeleteError, fn: 'delete-account', req });
    }

    console.log(`[delete-account] Full deletion complete for user ${userId}`);
    return jsonResponse({ success: true }, 200, {}, req);
  } catch (error) {
    console.error('[delete-account] Fatal error:', error.message);
    return errorResponse("We couldn't complete your account deletion. Please try again or contact support.", 500, { internal: error, fn: 'delete-account', req });
  }
});
