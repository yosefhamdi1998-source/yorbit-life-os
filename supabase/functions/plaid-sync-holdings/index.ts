import { handleOptions, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { getUser, serviceClient } from '../_shared/supabase.ts';
import { Configuration, PlaidApi, PlaidEnvironments } from 'npm:plaid@29.0.0';
import { enforceRateLimit, identityFromRequest, RULES } from '../_shared/rateLimit.ts';

// Investment/crypto accounts (Coinbase and similar) report a current
// snapshot of positions via investmentsHoldingsGet, not a dated log of
// transactions — a fundamentally different shape than plaid-sync-transactions,
// so this is its own function rather than a branch inside that one.
Deno.serve(async (req) => {
  const opt = handleOptions(req);
  if (opt) return opt;

  // Read once, up front, and keep it in scope for the catch block below —
  // a Request body can only be consumed once, so re-reading it after an
  // error (to mark the account 'error') isn't an option.
  let connected_account_id;
  try {
    const plaidClientId = Deno.env.get('PLAID_CLIENT_ID');
    const plaidSecret = Deno.env.get('PLAID_SECRET');
    if (!plaidClientId || !plaidSecret) return jsonResponse({ error: 'Bank sync is not enabled yet.' }, 501, {}, req);

    ({ connected_account_id } = await req.json());
    const admin = serviceClient();

    const authHeader = req.headers.get('Authorization') || '';
    const isServiceRoleCall = authHeader.includes(Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '__none__');

    // Identity before data — see plaid-sync-transactions for why. The
    // 404/401 split otherwise told an unauthenticated caller whether a
    // given connected_account_id was real.
    let user = null;
    if (!isServiceRoleCall) {
      user = await getUser(req);
      if (!user) return jsonResponse({ error: 'Unauthorized' }, 401, {}, req);
    }

    const { data: account } = await admin
      .from('connected_accounts').select('*').eq('id', connected_account_id).single();

    if (!account || (!isServiceRoleCall && account.user_id !== user.id)) {
      return jsonResponse({ error: "We couldn't find this account. Please reconnect it." }, 404, {}, req);
    }

    if (!isServiceRoleCall) {
      // User-initiated only; the cron path is exempt for the same reason
      // as plaid-sync-transactions. Holdings calls cost money at Plaid too.
      const limited = await enforceRateLimit(
        'plaid-holdings', identityFromRequest(req, user.id), RULES.sync,
        "You've refreshed this account several times recently. Holdings update roughly once a day.",
        req,
      );
      if (limited) return limited;
    }

    const access_token = account.access_token_ref;
    if (!access_token) return jsonResponse({ error: 'Your connection needs to be reconnected.' }, 400, {}, req);

    await admin.from('connected_accounts').update({ sync_status: 'syncing' }).eq('id', connected_account_id);

    const config = new Configuration({
      basePath: PlaidEnvironments.production,
      baseOptions: { headers: { 'PLAID-CLIENT-ID': plaidClientId, 'PLAID-SECRET': plaidSecret } },
    });
    const plaidClient = new PlaidApi(config);

    const holdingsRes = await plaidClient.investmentsHoldingsGet({ access_token });
    const { holdings, securities } = holdingsRes.data;
    const securityById = new Map(securities.map((s) => [s.security_id, s]));

    // This account's holdings only — the same access_token can cover
    // multiple accounts at the institution, and Plaid returns all of them.
    const ownHoldings = holdings.filter((h) => h.account_id === account.provider_account_id);

    let synced = 0;
    for (const h of ownHoldings) {
      const security = securityById.get(h.security_id);
      const { error } = await admin.from('investment_holdings').upsert({
        user_id: account.user_id,
        connected_account_id,
        security_name: security?.name || 'Unknown',
        ticker_symbol: security?.ticker_symbol || null,
        quantity: h.quantity,
        institution_value: h.institution_value ?? (h.quantity * (h.institution_price || 0)),
        currency: h.iso_currency_code || 'USD',
        updated_date: new Date().toISOString(),
      }, { onConflict: 'connected_account_id,security_name,ticker_symbol' });
      if (!error) synced++;
    }

    await admin.from('connected_accounts').update({
      sync_status: 'connected',
      last_synced_at: new Date().toISOString(),
    }).eq('id', connected_account_id);

    await admin.from('bank_sync_logs').insert({
      user_id: account.user_id,
      provider: 'plaid',
      connected_account_id,
      started_at: new Date().toISOString(),
      finished_at: new Date().toISOString(),
      status: 'success',
      imported_count: synced,
      skipped_duplicate_count: 0,
      error_count: 0,
      message: `Synced ${synced} holding(s)`,
    });

    return jsonResponse({ success: true, synced }, 200, {}, req);
  } catch (error) {
    console.error('plaid-sync-holdings error:', error.response?.data || error.message);
    if (connected_account_id) {
      try {
        const admin = serviceClient();
        await admin.from('connected_accounts').update({
          sync_status: 'error',
          error_message: "We couldn't sync this account's holdings. Please try again.",
        }).eq('id', connected_account_id);
      } catch { /* best-effort status update only */ }
    }
    return errorResponse("We couldn't sync your holdings. Please try again.", 500, { internal: error, fn: 'plaid-sync-holdings', req });
  }
});
