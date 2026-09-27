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

    // Atomically decides whether THIS request is responsible for revoking
    // the shared Plaid Item, and marks this account disconnected - see
    // migration 20260927120000_atomic_bank_disconnect_claim.sql. Ownership
    // is enforced inside the function itself (p_user_id), which also gives
    // "does not exist" and "not yours" the same response.
    const { data, error: claimError } = await admin.rpc('claim_bank_disconnect', {
      p_user_id: user.id, p_account_id: accountId,
    });
    if (claimError) return jsonResponse({ error: "We couldn't find this account." }, 404, {}, req);
    const claim = data?.[0];
    if (!claim) return jsonResponse({ error: "We couldn't find this account." }, 404, {}, req);

    // Whether or not THIS call is the one that just flipped sync_status -
    // it may already have been flipped by an earlier attempt whose own
    // cleanup below failed partway through - always re-attempt revocation
    // and credential cleanup. A retry has to actually finish the job, not
    // silently skip it just because the account already reads disconnected.
    if (claim.provider === 'plaid') {
      let token: string | null;
      try {
        ({ token } = await getPlaidAccessToken(admin, accountId));
      } catch (err) {
        // A failed read must never be mistaken for "nothing to revoke" -
        // that would let a real, live credential go unrevoked and then get
        // silently deleted anyway, which is exactly the bug this replaces.
        return errorResponse("We couldn't confirm the disconnect. Please try again.", 503, { internal: err, fn: 'plaid-disconnect-account', req });
      }
      if (token) {
        if (!claim.sibling_active) {
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
              // Do not delete the credential below - a live token with
              // nowhere left to read it from can never be revoked on retry.
              return errorResponse("We couldn't confirm the disconnect with your bank. Please try again.", 503, { internal: err, fn: 'plaid-disconnect-account', req });
            }
          }
        }
        // Reached only once Plaid has actually confirmed the Item is gone
        // (or was already gone), or a sibling account still needs it - this
        // account's own copy is unused either way. Checking the error here
        // (rather than firing-and-forgetting it) is what makes a retry
        // actually finish the job instead of silently reporting success
        // with the credential still sitting in the vault.
        const { error: deleteError } = await admin.from('plaid_credentials').delete().eq('connected_account_id', accountId);
        if (deleteError) {
          return errorResponse("We couldn't confirm the disconnect. Please try again.", 503, { internal: deleteError, fn: 'plaid-disconnect-account', req });
        }
      }
    }

    return jsonResponse({ success: true }, 200, {}, req);
  } catch (error) {
    console.error('plaid-disconnect-account error:', error?.response?.data || error?.message);
    return errorResponse("We couldn't confirm the disconnect. Please try again.", 500, { internal: error, fn: 'plaid-disconnect-account', req });
  }
});
