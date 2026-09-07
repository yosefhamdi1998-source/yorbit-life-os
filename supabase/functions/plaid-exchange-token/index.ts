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
        // Plaid Link hands back balances at connect time. Storing them here
        // means the Net Worth screen shows a real number immediately after
        // connecting, instead of $0 until the first sync runs.
        current_balance: acct.balances?.current ?? null,
        available_balance: acct.balances?.available ?? null,
        balance_limit: acct.balances?.limit ?? null,
        currency: acct.balances?.iso_currency_code || 'USD',
        balance_updated_at: acct.balances ? new Date().toISOString() : null,
      }).select().single();

      if (error) throw error;

      // Write the credential to the vault as well. plaid_credentials has RLS
      // on with no policies, so it is unreadable by any ordinary role; the
      // copy still written to connected_accounts.access_token_ref above is
      // transitional and is blanked by 20260907160000 once sync is verified
      // against the vault. New links are protected from the moment they are
      // created rather than waiting for a backfill.
      if (data?.id) {
        const { error: vaultErr } = await admin.from('plaid_credentials').upsert({
          user_id: user.id,
          connected_account_id: data.id,
          access_token,
          item_id,
        }, { onConflict: 'connected_account_id' });
        if (vaultErr) {
          // Non-fatal: the legacy column still holds the token so the account
          // works. Loud, because it means a new credential is sitting only in
          // the client-readable place.
          console.error('plaid-exchange-token: vault write failed:', vaultErr.message);
        }
      }

      created.push(data);
    }

    return jsonResponse({ success: true, accounts: created }, 200, {}, req);
  } catch (error) {
    console.error('plaid-exchange-token error:', error.response?.data || error.message);
    return errorResponse("We couldn't connect your bank. Please try again.", 500, { internal: error, fn: 'plaid-exchange-token', req });
  }
});
