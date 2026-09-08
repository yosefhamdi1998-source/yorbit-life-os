import { handleOptions, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { getUser, serviceClient } from '../_shared/supabase.ts';
import { getPlaidAccessToken } from '../_shared/plaidToken.ts';
import { Configuration, PlaidApi, PlaidEnvironments, Products, CountryCode } from 'npm:plaid@29.0.0';
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
      'plaid-link', identityFromRequest(req, user.id), RULES.sync,
      req,
    );
    if (limited) return limited;

    // Optional: reconnecting an existing account (status `reconnect_required`)
    // instead of linking a new one. Previously there was no way to do this at
    // all — a bank whose credentials expired had only Sync (which cannot fix
    // ITEM_LOGIN_REQUIRED, it just fails again) and Disconnect, which throws
    // the connection away instead of re-authenticating it. Passing Plaid the
    // existing access_token opens Link in "update mode": same item, same
    // transaction history, just a fresh login.
    let existingAccessToken;
    const body = await req.json().catch(() => ({}));
    if (body?.connected_account_id) {
      const admin = serviceClient();
      const { data: account } = await admin
        .from('connected_accounts').select('user_id').eq('id', body.connected_account_id).single();
      // Same response for "does not exist" and "not yours" as the sync
      // functions use, so neither case confirms the other.
      if (!account || account.user_id !== user.id) {
        return jsonResponse({ error: "We couldn't find this account. Please reconnect your bank." }, 404, {}, req);
      }
      const { token } = await getPlaidAccessToken(admin, body.connected_account_id);
      if (!token) {
        return errorResponse("We couldn't find this connection's credentials. Please disconnect and add the bank again.", 500, { fn: 'plaid-create-link-token', req });
      }
      existingAccessToken = token;
    }

    const config = new Configuration({
      basePath: PlaidEnvironments.production,
      baseOptions: { headers: { 'PLAID-CLIENT-ID': plaidClientId, 'PLAID-SECRET': plaidSecret } },
    });
    const plaidClient = new PlaidApi(config);

    const response = await plaidClient.linkTokenCreate({
      user: { client_user_id: user.id },
      // Shown to the user inside Plaid's own consent dialog while they type
// their bank password. It said MoneyGlow - the pre-rename name - so the
// app asking for access and the name on the consent screen disagreed at
// the single moment trust matters most. Plaid also expects client_name
// to match the registered application.
      client_name: 'Yorbit',
      // Update mode takes its products from the existing item, not this
      // list — Plaid errors if products are passed alongside access_token.
      ...(existingAccessToken
        ? { access_token: existingAccessToken }
        : { products: [Products.Transactions], optional_products: [Products.Investments] }),
      country_codes: [CountryCode.Us],
      language: 'en',
    });

    return jsonResponse({ link_token: response.data.link_token }, 200, {}, req);
  } catch (error) {
    console.error('plaid-create-link-token error:', error.response?.data || error.message);
    return errorResponse("We couldn't start the bank connection. Please try again.", 500, { internal: error, fn: 'plaid-create-link-token', req });
  }
});
