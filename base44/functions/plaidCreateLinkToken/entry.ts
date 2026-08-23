import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { Configuration, PlaidApi, PlaidEnvironments, Products, CountryCode } from 'npm:plaid@29.0.0';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const config = new Configuration({
      basePath: PlaidEnvironments.production,
      baseOptions: {
        headers: {
          'PLAID-CLIENT-ID': Deno.env.get('PLAID_CLIENT_ID'),
          'PLAID-SECRET': Deno.env.get('PLAID_SECRET'),
        },
      },
    });
    const plaidClient = new PlaidApi(config);

    const response = await plaidClient.linkTokenCreate({
      user: { client_user_id: user.id },
      client_name: 'Yoglow',
      products: [Products.Transactions],
      country_codes: [CountryCode.Us],
      language: 'en',
    });

    return Response.json({ link_token: response.data.link_token });
  } catch (error) {
    console.error('plaidCreateLinkToken error:', error.response?.data || error.message);
    return Response.json({ error: 'We couldn\'t start the bank connection. Please try again.' }, { status: 500 });
  }
});