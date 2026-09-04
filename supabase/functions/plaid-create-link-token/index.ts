import { handleOptions, jsonResponse } from '../_shared/cors.ts';
import { getUser } from '../_shared/supabase.ts';
import { Configuration, PlaidApi, PlaidEnvironments, Products, CountryCode } from 'npm:plaid@29.0.0';
import { enforceRateLimit, identityFromRequest, RULES } from '../_shared/rateLimit.ts';

Deno.serve(async (req) => {
  const opt = handleOptions(req);
  if (opt) return opt;

  try {
    const plaidClientId = Deno.env.get('PLAID_CLIENT_ID');
    const plaidSecret = Deno.env.get('PLAID_SECRET');
    if (!plaidClientId || !plaidSecret) return jsonResponse({ error: 'Bank sync is not enabled yet.' }, 501);

    const user = await getUser(req);
    if (!user) return jsonResponse({ error: 'Unauthorized' }, 401);

    const limited = await enforceRateLimit(
      'plaid-link', identityFromRequest(req, user.id), RULES.sync,
    );
    if (limited) return limited;

    const config = new Configuration({
      basePath: PlaidEnvironments.production,
      baseOptions: { headers: { 'PLAID-CLIENT-ID': plaidClientId, 'PLAID-SECRET': plaidSecret } },
    });
    const plaidClient = new PlaidApi(config);

    const response = await plaidClient.linkTokenCreate({
      user: { client_user_id: user.id },
      client_name: 'MoneyGlow',
      // Transactions covers every bank/Venmo-style institution already
      // working; Investments is what makes Coinbase (and any brokerage)
      // show up as a selectable institution at all — without it Plaid
      // Link silently excludes anything that only reports holdings.
      products: [Products.Transactions],
      optional_products: [Products.Investments],
      country_codes: [CountryCode.Us],
      language: 'en',
    });

    return jsonResponse({ link_token: response.data.link_token });
  } catch (error) {
    console.error('plaid-create-link-token error:', error.response?.data || error.message);
    return jsonResponse({ error: "We couldn't start the bank connection. Please try again." }, 500);
  }
});
