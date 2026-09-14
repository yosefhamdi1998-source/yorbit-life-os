import { publicConnectedAccount } from '../_shared/publicConnectedAccount.ts';
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
      undefined, req,
    );
    if (limited) return limited;

    const { public_token, institution_name, accounts } = await req.json();

    if (!public_token || !Array.isArray(accounts) || accounts.length < 1 || accounts.length > 100 || accounts.some(a => !a?.id)) {
      return jsonResponse({ error: 'Select at least one valid bank account.' }, 400, {}, req);
    }
    const config = new Configuration({
      basePath: PlaidEnvironments.production,
      baseOptions: { headers: { 'PLAID-CLIENT-ID': plaidClientId, 'PLAID-SECRET': plaidSecret } },
    });
    const plaidClient = new PlaidApi(config);

    const exchangeRes = await plaidClient.itemPublicTokenExchange({ public_token });
    const access_token = exchangeRes.data.access_token;
    const item_id = exchangeRes.data.item_id;

    const admin = serviceClient();
    const records = (accounts || []).map(acct => ({
        user_id: user.id,
        provider: 'plaid',
        institution_name: institution_name || 'Bank',
        account_name: acct.name || acct.official_name || 'Account',
        account_type: acct.type,
        account_mask: acct.mask,
        provider_account_id: acct.id,
        provider_item_id: item_id,

        sync_status: 'connected',
        // Plaid Link hands back balances at connect time. Storing them here
        // means the Net Worth screen shows a real number immediately after
        // connecting, instead of $0 until the first sync runs.
        current_balance: acct.balances?.current ?? null,
        available_balance: acct.balances?.available ?? null,
        balance_limit: acct.balances?.limit ?? null,
        currency: acct.balances?.iso_currency_code || 'USD',
        balance_updated_at: acct.balances ? new Date().toISOString() : null,

    }));
    const { data: saved, error: saveError } = await admin.rpc('save_plaid_accounts_private', {
      p_user_id: user.id, p_item_id: item_id, p_access_token: access_token, p_accounts: records,
    });
    if (saveError || !Array.isArray(saved) || saved.length !== records.length) {
      // The database transaction cannot leave a half-saved connection.
      // Best-effort provider cleanup; no raw provider payload or token is logged.
      try { await plaidClient.itemRemove({ access_token }); } catch { console.error('Failed bank-link cleanup requires investigation'); }
      throw new Error('Private bank connection save failed');
    }
    const created = saved.map(publicConnectedAccount);

    return jsonResponse({ success: true, accounts: created }, 200, {}, req);
  } catch (error) {
    console.error('plaid-exchange-token failed');
    return errorResponse("We couldn't connect your bank. Please try again.", 500, { internal: error, fn: 'plaid-exchange-token', req });
  }
});
