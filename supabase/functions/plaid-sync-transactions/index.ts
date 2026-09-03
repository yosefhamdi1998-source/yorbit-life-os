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

// Money moving between someone's own accounts — a Venmo balance sent to
// their own linked bank, cash moved into their own savings — isn't income
// or spending, it's the same dollar staying theirs. Counting it as an
// expense (money "sent" out of Venmo) makes real spending look inflated by
// however much they happen to shuffle between their own accounts, which
// has nothing to do with what they actually bought. Plaid's own
// personal_finance_category.detailed calls this out specifically — these
// are the values that mean "self transfer," not a payment to someone
// else, so they're excluded from import entirely rather than counted
// either way.
const SELF_TRANSFER_DETAILED = new Set([
  'TRANSFER_OUT_ACCOUNT_TRANSFER', 'TRANSFER_IN_ACCOUNT_TRANSFER',
  'TRANSFER_OUT_SAVINGS', 'TRANSFER_IN_SAVINGS',
  'TRANSFER_OUT_INVESTMENT_AND_RETIREMENT_FUNDS', 'TRANSFER_IN_INVESTMENT_AND_RETIREMENT_FUNDS',
]);

function isSelfTransfer(tx: any) {
  return SELF_TRANSFER_DETAILED.has(tx.personal_finance_category?.detailed);
}

Deno.serve(async (req) => {
  const opt = handleOptions(req);
  if (opt) return opt;

  try {
    const plaidClientId = Deno.env.get('PLAID_CLIENT_ID');
    const plaidSecret = Deno.env.get('PLAID_SECRET');
    if (!plaidClientId || !plaidSecret) return jsonResponse({ error: 'Bank sync is not enabled yet.' }, 501);

    const { connected_account_id, full } = await req.json();
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

    // First-ever sync for this account pulls a real backfill — 5 years back.
    // When Plaid first connects an item it only has a small initial window
    // of transactions ready, then backfills the institution's full history
    // asynchronously (minutes to hours) and announces it with a
    // HISTORICAL_UPDATE webhook. Syncing once at connect time and then only
    // ever asking for 30 days afterwards meant that backfill — the actual
    // years of history — was never collected. That's why an account could
    // sit at 90 days of history forever despite a 5-year request.
    //
    // So: keep asking for the FULL window until a full pass has actually
    // completed, and keep re-checking for the first week after connecting,
    // which is well past when Plaid's historical update lands. Only after
    // that does it drop to the cheap 30-day incremental. The dedup below
    // makes re-fetching the same window harmless.
    const connectedAt = account.created_date ? new Date(account.created_date).getTime() : 0;
    const daysSinceConnect = (Date.now() - connectedAt) / (24 * 60 * 60 * 1000);
    const wantsFullHistory =
      full === true ||
      !account.last_synced_at ||
      !account.history_backfilled_at ||
      daysSinceConnect < 7;

    // Ask for 5 years and let the institution return whatever it actually
    // has — we record the real earliest date below rather than pretending
    // the requested window is the delivered one.
    const endDate = new Date().toISOString().split('T')[0];
    const startDate = new Date(Date.now() - (wantsFullHistory ? 5 * 365 : 30) * 24 * 60 * 60 * 1000)
      .toISOString().split('T')[0];

    // transactionsGet caps each response at 500 rows and reports the true
    // matching total in total_transactions — a single call silently missed
    // everything past the first page for any account with real history.
    // Page through with offset until we've pulled all of it.
    const plaidTxs = [];
    let offset = 0;
    while (true) {
      const txRes = await plaidClient.transactionsGet({
        access_token,
        start_date: startDate,
        end_date: endDate,
        // Scope to THIS account. One access token covers every account at
        // the institution, so without this each of the 4 connected accounts
        // pulled all 430 transactions from all of them — 4x the API work,
        // and each transaction got labelled with whichever account happened
        // to import it first. Dedup hid the damage but not the waste.
        options: { count: 500, offset, account_ids: [account.provider_account_id] },
      });
      plaidTxs.push(...txRes.data.transactions);
      offset += txRes.data.transactions.length;
      if (offset >= txRes.data.total_transactions || txRes.data.transactions.length === 0) break;
    }

    const { data: existing } = await admin.from('transactions').select('title, date, amount').eq('user_id', account.user_id);
    const existingKeys = new Set((existing || []).map((t) => `${t.title}-${t.date}-${t.amount}`));

    let imported = 0;
    let skipped = 0;

    for (const tx of plaidTxs) {
      if (tx.pending) { skipped++; continue; }
      if (isSelfTransfer(tx)) { skipped++; continue; }

      const title = tx.merchant_name || tx.name || 'Transaction';
      const amount = Math.abs(tx.amount);
      const date = tx.date;
      const key = `${title}-${date}-${amount}`;
      // Checked (and immediately recorded) against the SAME running set for
      // every row in this batch, not just what was already in the database
      // before this sync started. A large first-time historical pull from
      // Plaid's transactionsGet can itself return the same transaction more
      // than once across pages on a freshly-connected item — this is what
      // actually produced 8 identical "Zelle payment to YOSEFH" rows on the
      // 5-year backfill. Without updating the set as we go, nothing catches
      // a duplicate that only exists within this one batch.
      if (existingKeys.has(key)) { skipped++; continue; }
      existingKeys.add(key);

      const type = tx.amount > 0 ? 'expense' : 'income';
      const category = mapCategory(tx.category);

      const { error } = await admin.from('transactions').insert({
        user_id: account.user_id,
        title, amount, type, category, date,
        notes: `Imported from ${account.institution_name}`,
      });
      if (!error) imported++;
    }

    // What history did we ACTUALLY get? The earliest date Plaid returned is
    // the honest answer — never the window we asked for. Keep the oldest
    // date ever seen, since a later incremental sync legitimately returns
    // only recent transactions and shouldn't shrink the recorded coverage.
    const returnedDates = plaidTxs.map((t: any) => t.date).filter(Boolean).sort();
    const earliestReturned = returnedDates[0] || null;
    const priorStart = account.history_start_date || null;
    const historyStart = earliestReturned && (!priorStart || earliestReturned < priorStart)
      ? earliestReturned
      : priorStart;

    await admin.from('connected_accounts').update({
      sync_status: 'connected',
      last_synced_at: new Date().toISOString(),
      history_start_date: historyStart,
      // Only a full-window pass counts as a completed backfill.
      ...(wantsFullHistory ? { history_backfilled_at: new Date().toISOString() } : {}),
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

    return jsonResponse({
      success: true,
      imported,
      skipped,
      fullHistoryPass: wantsFullHistory,
      requestedFrom: startDate,
      actualHistoryStart: historyStart,
      transactionsAvailableFromPlaid: plaidTxs.length,
    });
  } catch (error) {
    console.error('plaid-sync-transactions error:', error.response?.data || error.message);
    return jsonResponse({ error: "We couldn't sync your transactions. Please try again." }, 500);
  }
});
