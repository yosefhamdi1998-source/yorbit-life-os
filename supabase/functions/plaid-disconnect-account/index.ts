import { handleOptions, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { getUser, serviceClient } from '../_shared/supabase.ts';
import { getPlaidAccessToken } from '../_shared/plaidToken.ts';
import { Configuration, PlaidApi, PlaidEnvironments } from 'npm:plaid@29.0.0';
import { enforceRateLimit, identityFromRequest, RULES } from '../_shared/rateLimit.ts';

// Postgres "no_data_found", raised by claim/finalize_bank_disconnect for an
// account that does not exist or is not this user's.
const NOT_FOUND = 'P0002';

Deno.serve(async (req) => {
  const opt = handleOptions(req);
  if (opt) return opt;
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405, {}, req);

  const retryLater = (internal: unknown) =>
    errorResponse("We couldn't finish disconnecting this account. It's still listed so you can try again.", 503, { internal, fn: 'plaid-disconnect-account', req });

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

    // Moves the account to 'disconnecting' (visible and retryable, never
    // hidden) and decides under a per-Item lock whether this call must revoke
    // the shared Plaid Item. See migration 20260927120000. Ownership is
    // enforced inside the function via p_user_id.
    const { data, error: claimError } = await admin.rpc('claim_bank_disconnect', {
      p_user_id: user.id, p_account_id: accountId,
    });
    if (claimError) {
      if (claimError.code === NOT_FOUND) return jsonResponse({ error: "We couldn't find this account." }, 404, {}, req);
      return retryLater(claimError);
    }
    const claim = Array.isArray(data) ? data[0] : null;
    if (!claim) return retryLater(new Error('Disconnect claim returned no row'));

    if (claim.account_provider === 'plaid') {
      let token: string | null;
      try {
        ({ token } = await getPlaidAccessToken(admin, accountId));
      } catch (err) {
        // A failed read is not "nothing to revoke".
        return retryLater(err);
      }
      if (token && !claim.sibling_active) {
        const plaidClientId = Deno.env.get('PLAID_CLIENT_ID');
        const plaidSecret = Deno.env.get('PLAID_SECRET');
        if (!plaidClientId || !plaidSecret) return retryLater(new Error('Plaid is not configured'));
        const plaidClient = new PlaidApi(new Configuration({
          basePath: PlaidEnvironments.production,
          baseOptions: { headers: { 'PLAID-CLIENT-ID': plaidClientId, 'PLAID-SECRET': plaidSecret } },
        }));
        try {
          await plaidClient.itemRemove({ access_token: token });
        } catch (err) {
          // ITEM_NOT_FOUND: already removed, e.g. by an earlier attempt or a
          // sibling's own disconnect. Anything else leaves the credential in
          // place for the retry.
          if (err?.response?.data?.error_code !== 'ITEM_NOT_FOUND') return retryLater(err);
        }
      }
    }

    // Deletes this account's credential copy and marks it disconnected in
    // one transaction. When a sibling still needs the Item, only this copy
    // goes; the sibling keeps its own.
    const { error: finalizeError } = await admin.rpc('finalize_bank_disconnect', {
      p_user_id: user.id, p_account_id: accountId,
    });
    if (finalizeError) return retryLater(finalizeError);

    return jsonResponse({ success: true }, 200, {}, req);
  } catch (error) {
    return retryLater(error);
  }
});
