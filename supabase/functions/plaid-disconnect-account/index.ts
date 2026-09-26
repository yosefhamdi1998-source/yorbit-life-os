import { handleOptions, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { getUser, serviceClient } from '../_shared/supabase.ts';
import { getPlaidAccessToken } from '../_shared/plaidToken.ts';
import { Configuration, PlaidApi, PlaidEnvironments } from 'npm:plaid@29.0.0';
import { enforceRateLimit, identityFromRequest, RULES } from '../_shared/rateLimit.ts';

Deno.serve(async (req) => {
  const opt = handleOptions(req);
  if (opt) return opt;
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405, {}, req);

  try {
    const user = await getUser(req);
    if (!user) return jsonResponse({ error: 'Unauthorized' }, 401, {}, req);

    const limited = await enforceRateLimit(
      'plaid-disconnect', identityFromRequest(req, user.id), RULES.sync,
      undefined, req,
    );
    if (limited) return limited;

    const body = await req.json().catch(() => ({}));
    const accountId = body?.connected_account_id;
    if (typeof accountId !== 'string' || !accountId) {
      return jsonResponse({ error: 'Missing account.' }, 400, {}, req);
    }

    const admin = serviceClient();
    // Same response for "does not exist" and "not yours" used by every
    // other account-scoped function here, so neither case confirms the other.
    const { data: account } = await admin.from('connected_accounts')
      .select('id, user_id, provider, provider_item_id, sync_status')
      .eq('id', accountId).eq('user_id', user.id).maybeSingle();
    if (!account) return jsonResponse({ error: "We couldn't find this account." }, 404, {}, req);

    // Idempotent: a retry after a partial earlier failure, or a duplicate
    // request, has nothing left to do and must not report an error.
    if (account.sync_status === 'disconnected') return jsonResponse({ success: true }, 200, {}, req);

    if (account.provider === 'plaid') {
      const { token } = await getPlaidAccessToken(admin, accountId);
      if (token) {
        // One Plaid Item can back several of this user's connected_accounts
        // rows at once - save_plaid_accounts_private creates one row per
        // account returned from a single Link session, all sharing the same
        // item/access token (checking + savings from one bank login, for
        // example). Revoking the Item revokes it for all of them, so this
        // only actually calls Plaid once no sibling row still needs it.
        const { data: siblings, error: siblingError } = await admin.from('connected_accounts')
          .select('id').eq('user_id', user.id).eq('provider_item_id', account.provider_item_id)
          .neq('id', accountId).neq('sync_status', 'disconnected').limit(1);
        if (siblingError) {
          return errorResponse("We couldn't confirm the disconnect. Please try again.", 503, { internal: siblingError, fn: 'plaid-disconnect-account', req });
        }
        if (!siblings?.length) {
          const plaidClientId = Deno.env.get('PLAID_CLIENT_ID');
          const plaidSecret = Deno.env.get('PLAID_SECRET');
          if (!plaidClientId || !plaidSecret) {
            return jsonResponse({ error: "We couldn't confirm the disconnect. Please try again later." }, 503, {}, req);
          }
          const plaidClient = new PlaidApi(new Configuration({
            basePath: PlaidEnvironments.production,
            baseOptions: { headers: { 'PLAID-CLIENT-ID': plaidClientId, 'PLAID-SECRET': plaidSecret } },
          }));
          try {
            await plaidClient.itemRemove({ access_token: token });
          } catch (err) {
            // ITEM_NOT_FOUND covers a removal that already succeeded on an
            // earlier attempt - not a failure, the goal is already met.
            const alreadyRemoved = err?.response?.data?.error_code === 'ITEM_NOT_FOUND';
            if (!alreadyRemoved) {
              return errorResponse("We couldn't confirm the disconnect with your bank. Please try again.", 503, { internal: err, fn: 'plaid-disconnect-account', req });
            }
          }
        }
      }
    }

    // Only mark disconnected once revocation is confirmed (or wasn't
    // needed) - never the other way around. If anything above failed, the
    // account is untouched here and a retry safely starts over.
    const { error: updateError } = await admin.from('connected_accounts')
      .update({ sync_status: 'disconnected' })
      .eq('id', accountId).eq('user_id', user.id).neq('sync_status', 'disconnected')
      .select('id').maybeSingle();
    if (updateError) {
      return errorResponse("We couldn't confirm the disconnect. Please try again.", 503, { internal: updateError, fn: 'plaid-disconnect-account', req });
    }

    // This account will never sync again, so its own copy of the token is
    // never needed again either way - regardless of whether the Item itself
    // stays live for a sibling account. Best-effort: the disconnect above is
    // already durable without this succeeding, and nothing reads a token
    // for an account whose sync_status is 'disconnected'.
    await admin.from('plaid_credentials').delete().eq('connected_account_id', accountId).then(() => {}).catch(() => {});

    return jsonResponse({ success: true }, 200, {}, req);
  } catch (error) {
    console.error('plaid-disconnect-account error:', error?.response?.data || error?.message);
    return errorResponse("We couldn't confirm the disconnect. Please try again.", 500, { internal: error, fn: 'plaid-disconnect-account', req });
  }
});
