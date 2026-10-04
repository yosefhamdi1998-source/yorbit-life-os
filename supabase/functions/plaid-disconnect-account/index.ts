import { handleOptions, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { getUser, serviceClient } from '../_shared/supabase.ts';
import { completeBankDisconnect } from '../_shared/bankDisconnect.ts';
import { enforceRateLimit, identityFromRequest, RULES } from '../_shared/rateLimit.ts';

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

    // The shared sequence (claim under a per-Item lock, revoke only when no
    // connected sibling needs the Item, finalize atomically) lives in
    // _shared/bankDisconnect.ts so the operator cleanup of legacy accounts
    // runs exactly the same steps. Ownership is enforced inside
    // claim_bank_disconnect via the session's own user id.
    const result = await completeBankDisconnect(admin, user.id, accountId, { env: name => Deno.env.get(name) });
    if (result.status === 'not_found' && result.stage === 'claim') {
      return jsonResponse({ error: "We couldn't find this account." }, 404, {}, req);
    }
    if (result.status !== 'done') return retryLater(result.status === 'retry' ? result.internal : result);

    return jsonResponse({ success: true }, 200, {}, req);
  } catch (error) {
    return retryLater(error);
  }
});
