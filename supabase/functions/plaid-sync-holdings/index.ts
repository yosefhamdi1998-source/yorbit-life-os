import { beginBankSync, completeBankSync, failBankSync, logBankSync, type BankSyncContext } from '../_shared/bankSync.ts';
import { isServiceBearer } from '../_shared/serviceBearer.ts';
import { handleOptions, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { getUser, serviceClient } from '../_shared/supabase.ts';
import { getPlaidAccessToken } from '../_shared/plaidToken.ts';
import { Configuration, PlaidApi, PlaidEnvironments } from 'npm:plaid@29.0.0';
import { enforceRateLimit, identityFromRequest, RULES } from '../_shared/rateLimit.ts';

// Investment/crypto accounts (Coinbase and similar) report a current
// snapshot of positions via investmentsHoldingsGet, not a dated log of
// transactions — a fundamentally different shape than plaid-sync-transactions,
// so this is its own function rather than a branch inside that one.
Deno.serve(async (req) => {
  const opt = handleOptions(req);
  if (opt) return opt;

  let sync: BankSyncContext | null = null;
  try {
    const plaidClientId = Deno.env.get('PLAID_CLIENT_ID');
    const plaidSecret = Deno.env.get('PLAID_SECRET');
    if (!plaidClientId || !plaidSecret) return jsonResponse({ error: 'Bank sync is not enabled yet.' }, 501, {}, req);

    const { connected_account_id } = await req.json();
    const admin = serviceClient();

    const authHeader = req.headers.get('Authorization') || '';
    const isServiceRoleCall = isServiceBearer(authHeader, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'));

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

    // From plaid_credentials (RLS on, no policies) with a transitional
    // fallback to the legacy column. See _shared/plaidToken.ts.
    const { token: access_token } = await getPlaidAccessToken(admin, connected_account_id);
    if (!access_token) return jsonResponse({ error: 'Your connection needs to be reconnected.' }, 400, {}, req);

    sync = await beginBankSync(admin, account);

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
      if (error) sync.failed++;
      else sync.imported++;
    }

    if (sync.failed > 0) throw new Error('Some holdings could not be saved; sync is incomplete');
    await completeBankSync(sync);
    const synced = sync.imported;
    await logBankSync(sync, 'success', `Synced ${synced} holding(s)`);

    return jsonResponse({ success: true, synced }, 200, {}, req);
  } catch (error) {
    try {
      await failBankSync(sync, error);
    } catch {
      console.error('Bank sync failure status could not be saved');
    }
    return errorResponse("We couldn't finish syncing your holdings. Please try again.", 500, {
      internal: new Error('Bank sync incomplete'), fn: 'plaid-sync-holdings', req,
    });
  }
});
