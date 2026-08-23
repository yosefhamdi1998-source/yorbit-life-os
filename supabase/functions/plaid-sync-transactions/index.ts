import { handleOptions, jsonResponse } from '../_shared/cors.ts';
import { getUser, serviceClient } from '../_shared/supabase.ts';
import { Configuration, PlaidApi, PlaidEnvironments } from 'npm:plaid@29.0.0';

const CATEGORY_MAP: Record<string, string> = {
  'Food and Drink': 'food',
  'Shops': 'shopping',
  'Recreation': 'entertainment',
  'Healthcare': 'health',
  'Travel': 'transport',
  'Transfer': 'savings',
  'Payment': 'other',
  'Bank Fees': 'other',
  'Interest': 'other',
  'Tax': 'other',
  'Payroll': 'salary',
  'Income': 'salary',
};

function mapCategory(plaidCategories?: string[]) {
  if (!plaidCategories || plaidCategories.length === 0) return 'other';
  return CATEGORY_MAP[plaidCategories[0]] || 'other';
}

Deno.serve(async (req) => {
  const opt = handleOptions(req);
  if (opt) return opt;

  try {
    const plaidClientId = Deno.env.get('PLAID_CLIENT_ID');
    const plaidSecret = Deno.env.get('PLAID_SECRET');
    if (!plaidClientId || !plaidSecret) return jsonResponse({ error: 'Bank sync is not enabled yet.' }, 501);

    const { connected_account_id } = await req.json();
    const admin = serviceClient();

    // This function is called two ways: directly by the signed-in owner of the
    // account, or by sync-all-accounts using the service-role key (no end-user
    // JWT). In the service-role case there's no `user` to check against — the
    // caller already authenticated with the service-role secret, which is enough.
    const authHeader = req.headers.get('Authorization') || '';
    const isServiceRoleCall = authHeader.includes(Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '__none__');

    const { data: account } = await admin
      .from('connected_accounts').select('*').eq('id', connected_account_id).single();
    if (!account) return jsonResponse({ error: "We couldn't find this account. Please reconnect your bank." }, 404);

    if (!isServiceRoleCall) {
      const user = await getUser(req);
      if (!user || user.id !== account.user_id) return jsonResponse({ error: 'Unauthorized' }, 401);
    }

    const access_token = account.access_token_ref;
    if (!access_token) return jsonResponse({ error: 'Your bank connection needs to be reconnected.' }, 400);

    await admin.from('connected_accounts').update({ sync_status: 'syncing' }).eq('id', connected_account_id);

    const config = new Configuration({
      basePath: PlaidEnvironments.production,
      baseOptions: { headers: { 'PLAID-CLIENT-ID': plaidClientId, 'PLAID-SECRET': plaidSecret } },
    });
    const plaidClient = new PlaidApi(config);

    const endDate = new Date().toISOString().split('T')[0];
    const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const txRes = await plaidClient.transactionsGet({
      access_token, start_date: startDate, end_date: endDate, options: { count: 100 },
    });
    const plaidTxs = txRes.data.transactions;

    const { data: existing } = await admin.from('transactions').select('title, date, amount').eq('user_id', account.user_id);
    const existingKeys = new Set((existing || []).map((t) => `${t.title}-${t.date}-${t.amount}`));

    let imported = 0;
    let skipped = 0;

    for (const tx of plaidTxs) {
      if (tx.pending) { skipped++; continue; }

      const title = tx.merchant_name || tx.name || 'Transaction';
      const amount = Math.abs(tx.amount);
      const date = tx.date;
      const key = `${title}-${date}-${amount}`;
      if (existingKeys.has(key)) { skipped++; continue; }

      const type = tx.amount > 0 ? 'expense' : 'income';
      const category = mapCategory(tx.category);

      const { error } = await admin.from('transactions').insert({
        user_id: account.user_id,
        title, amount, type, category, date,
        notes: `Imported from ${account.institution_name}`,
      });
      if (!error) imported++;
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
      imported_count: imported,
      skipped_duplicate_count: skipped,
      error_count: 0,
      message: `Imported ${imported} transactions, skipped ${skipped} duplicates`,
    });

    return jsonResponse({ success: true, imported, skipped });
  } catch (error) {
    console.error('plaid-sync-transactions error:', error.response?.data || error.message);
    return jsonResponse({ error: "We couldn't sync your transactions. Please try again." }, 500);
  }
});
