import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { Configuration, PlaidApi, PlaidEnvironments } from 'npm:plaid@29.0.0';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { public_token, institution_name, accounts } = await req.json();

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

    const exchangeRes = await plaidClient.itemPublicTokenExchange({ public_token });
    const access_token = exchangeRes.data.access_token;
    const item_id = exchangeRes.data.item_id;

    // Save each account
    const created = [];
    for (const acct of (accounts || [])) {
      const record = await base44.asServiceRole.entities.ConnectedAccount.create({
        provider: 'plaid',
        institution_name: institution_name || 'Bank',
        account_name: acct.name || acct.official_name || 'Account',
        account_type: acct.type,
        account_mask: acct.mask,
        provider_account_id: acct.id,
        provider_item_id: item_id,
        access_token_ref: access_token,
        sync_status: 'connected',
      });
      created.push(record);
    }

    return Response.json({ success: true, accounts: created });
  } catch (error) {
    console.error('plaidExchangeToken error:', error.response?.data || error.message);
    return Response.json({ error: 'We couldn\'t connect your bank. Please try again.' }, { status: 500 });
  }
});