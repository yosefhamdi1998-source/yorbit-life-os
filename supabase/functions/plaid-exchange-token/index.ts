import { handleOptions, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { getUser, serviceClient } from '../_shared/supabase.ts';
import { Configuration, PlaidApi, PlaidEnvironments } from 'npm:plaid@29.0.0';
import { enforceRateLimit, identityFromRequest, RULES } from '../_shared/rateLimit.ts';

Deno.serve(async (req) => {
  const opt = handleOptions(req);
  if (opt) return opt;

  try {
    const plaidClientId = Deno.env.get('PLAID_CLIENT_ID');
    const plaidSecret = Deno.env.get('PLAID_SECRET');
    if (!plaidClientId || !plaidSecret) return jsonResponse({ error: 'Bank sync is not enabled yet.' }, 501, {}, req);

    const user = await getUser(req);
    if (!user) return jsonResponse({ error: 'Unauthorized' }, 401, {}, req);

    const limited = await enforceRateLimit(
      'plaid-exchange', identityFromRequest(req, user.id), RULES.sync,
      req,
    );
    if (limited) return limited;

    const { public_token, institution_name, accounts } = await req.json();

    const config = new Configuration({
      basePath: PlaidEnvironments.production,
      baseOptions: { headers: { 'PLAID-CLIENT-ID': plaidClientId, 'PLAID-SECRET': plaidSecret } },
    });
    const plaidClient = new PlaidApi(config);

    const exchangeRes = await plaidClient.itemPublicTokenExchange({ public_token });
    const access_token = exchangeRes.data.access_token;
    const item_id = exchangeRes.data.item_id;

    const admin = serviceClient();
    const created = [];
    for (const acct of (accounts || [])) {
      const { data, error } = await admin.from('connected_accounts').insert({
        user_id: user.id,
        provider: 'plaid',
        institution_name: institution_name || 'Bank',
        account_name: acct.name || acct.official_name || 'Account',
        account_type: acct.type,
        account_mask: acct.mask,
        provider_account_id: acct.id,
        provider_item_id: item_id,
        access_token_ref: access_token,
        sync_status: 'connected',
      }).select().single();
      if (error) throw error;
      created.push(data);
    }

    return jsonResponse({ success: true, accounts: created }, 200, {}, req);
  } catch (error) {
    console.error('plaid-exchange-token error:', error.response?.data || error.message);
    return errorResponse("We couldn't connect your bank. Please try again.", 500, { internal: error, fn: 'plaid-exchange-token', req });
  }
});
