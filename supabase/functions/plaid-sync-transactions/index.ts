import { handleOptions, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { getUser, serviceClient } from '../_shared/supabase.ts';
import { Configuration, PlaidApi, PlaidEnvironments } from 'npm:plaid@29.0.0';
import { enforceRateLimit, identityFromRequest, RULES } from '../_shared/rateLimit.ts';

// --- categorisation -----------------------------------------------------
// This used to read Plaid's LEGACY `category` array through a 12-entry map,
// which dumped most spending into 'other'. Plaid's modern
// personal_finance_category is far richer (16 primary values, 100+
// detailed) and was already present in every response — this same file
// reads its `.detailed` field for self-transfer detection. So the better
// taxonomy was arriving all along and being thrown away.
//
// Matching is: detailed override first (most precise), then primary, then
// the legacy array as a last resort for any older/edge response shape.

// Primary covers everything; detailed below only overrides where the
// specific value belongs somewhere different from its primary bucket.
const PFC_PRIMARY_MAP: Record<string, string> = {
  INCOME: 'salary',
  TRANSFER_IN: 'savings',
  TRANSFER_OUT: 'savings',
  LOAN_PAYMENTS: 'other',
  BANK_FEES: 'other',
  ENTERTAINMENT: 'entertainment',
  FOOD_AND_DRINK: 'food',
  GENERAL_MERCHANDISE: 'shopping',
  HOME_IMPROVEMENT: 'housing',
  MEDICAL: 'health',
  PERSONAL_CARE: 'health',
  GENERAL_SERVICES: 'other',
  GOVERNMENT_AND_NON_PROFIT: 'other',
  TRANSPORTATION: 'transport',
  TRAVEL: 'transport',
  RENT_AND_UTILITIES: 'housing',
};

// Only the cases where the detailed value genuinely belongs elsewhere than
// its primary — a mortgage payment is housing, not a generic loan; a
// student loan is education; dividends are investment income, not wages.
const PFC_DETAILED_MAP: Record<string, string> = {
  INCOME_DIVIDENDS: 'investment',
  INCOME_INTEREST_EARNED: 'investment',
  INCOME_RETIREMENT_PENSION: 'salary',
  INCOME_UNEMPLOYMENT: 'salary',
  INCOME_WAGES: 'salary',
  INCOME_TAX_REFUND: 'other',
  INCOME_OTHER_INCOME: 'other',

  LOAN_PAYMENTS_MORTGAGE_PAYMENT: 'housing',
  LOAN_PAYMENTS_CAR_PAYMENT: 'transport',
  LOAN_PAYMENTS_STUDENT_LOAN_PAYMENT: 'education',

  GENERAL_SERVICES_EDUCATION: 'education',
  GENERAL_SERVICES_CHILDCARE: 'other',
  GENERAL_SERVICES_AUTOMOTIVE: 'transport',
  GENERAL_SERVICES_INSURANCE: 'other',

  PERSONAL_CARE_GYMS_AND_FITNESS_CENTERS: 'health',
  PERSONAL_CARE_HAIR_AND_BEAUTY: 'shopping',
  PERSONAL_CARE_LAUNDRY_AND_DRY_CLEANING: 'other',

  GENERAL_MERCHANDISE_BOOKSTORES_AND_NEWSSTANDS: 'education',
  GENERAL_MERCHANDISE_CONVENIENCE_STORES: 'food',

  ENTERTAINMENT_MUSIC_AND_AUDIO: 'entertainment',
  ENTERTAINMENT_TV_AND_MOVIES: 'entertainment',

  HOME_IMPROVEMENT_FURNITURE: 'shopping',

  TRANSFER_OUT_WITHDRAWAL: 'other',
};

function mapCategory(tx: any): string {
  const detailed = tx?.personal_finance_category?.detailed;
  if (detailed && PFC_DETAILED_MAP[detailed]) return PFC_DETAILED_MAP[detailed];

  const primary = tx?.personal_finance_category?.primary;
  if (primary && PFC_PRIMARY_MAP[primary]) return PFC_PRIMARY_MAP[primary];

  // Legacy fallback — only reached if a response somehow lacks PFC.
  const legacy = tx?.category?.[0];
  const LEGACY: Record<string, string> = {
    'Food and Drink': 'food', 'Shops': 'shopping', 'Recreation': 'entertainment',
    'Healthcare': 'health', 'Travel': 'transport', 'Transfer': 'savings',
    'Payroll': 'salary', 'Income': 'salary',
  };
  return (legacy && LEGACY[legacy]) || 'other';
}

// --- P2P and cash detection --------------------------------------------
// Sending money to a person is not spending on a category, and neither is
// pulling cash out of an ATM. Forcing them into a spending breakdown makes
// every category chart wrong. These are flagged so they're kept out of
// budgeting totals while still being visible on the Payments Sent page.
const P2P_DETAILED = new Set([
  'TRANSFER_OUT_OTHER_TRANSFER_OUT',
  'TRANSFER_IN_OTHER_TRANSFER_IN',
]);
const P2P_TITLE_RE = /zelle|venmo|cash\s?app|cashapp|paypal|pmnt sent/i;
const CASH_TITLE_RE = /\batm\b|withdrwl|withdrawal|cash withdrawal/i;

// REMOVED: classifyExclusion().
//
// This was a second implementation of the same ruleset that lives in the
// database function classify_exclusion_reason(), and the two had already
// drifted — this copy keyed off Plaid's personal_finance_category while the
// SQL trigger keyed off the title, so a row's classification depended on
// which path imported it. Two copies of a rule list is exactly the drift
// that produced the enum bugs.
//
// The database trigger is now the single source of truth. It fires BEFORE
// INSERT on every row regardless of origin (Plaid sync, CSV import, manual
// entry), and it skips any row that already carries an explicit
// exclusion_reason — so a deliberate manual classification still wins.
//
// Inserting without an exclusion_reason is therefore not an oversight here;
// it is what lets the trigger classify the row.

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
    if (!plaidClientId || !plaidSecret) return jsonResponse({ error: 'Bank sync is not enabled yet.' }, 501, {}, req);

    const { connected_account_id, full } = await req.json();
    const admin = serviceClient();

    // This function is called two ways: directly by the signed-in owner of the
    // account, or by sync-all-accounts using the service-role key (no end-user
    // JWT). In the service-role case there's no `user` to check against — the
    // caller already authenticated with the service-role secret, which is enough.
    const authHeader = req.headers.get('Authorization') || '';
    const isServiceRoleCall = authHeader.includes(Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '__none__');

    // Identity is established BEFORE the account is looked up.
    //
    // The lookup used to come first, using the service-role client, and
    // returned 404 for an unknown id versus 401 for a real one — which let
    // an unauthenticated caller probe whether any given connected_account_id
    // exists. UUIDs make that expensive to exploit, but an endpoint should
    // not answer questions about data before it knows who is asking.
    let user = null;
    if (!isServiceRoleCall) {
      user = await getUser(req);
      if (!user) return jsonResponse({ error: 'Unauthorized' }, 401, {}, req);
    }

    const { data: account } = await admin
      .from('connected_accounts').select('*').eq('id', connected_account_id).single();

    // Same response for "does not exist" and "not yours", so neither case
    // confirms the other.
    if (!account || (!isServiceRoleCall && account.user_id !== user.id)) {
      return jsonResponse({ error: "We couldn't find this account. Please reconnect your bank." }, 404, {}, req);
    }

    if (!isServiceRoleCall) {
      // User-initiated syncs only. The cron path is deliberately exempt —
      // it legitimately calls this once per account per run, and rate
      // limiting it would mean the accounts at the end of the list stop
      // syncing once there are enough users.
      //
      // Every one of these calls costs real money at Plaid, and `full`
      // is read straight from the request body, so without this a user
      // can force unlimited 5-year backfills.
      const limited = await enforceRateLimit(
        'plaid-sync', identityFromRequest(req, user.id), RULES.sync,
        "You've refreshed this account several times recently. Bank data updates roughly once a day, so give it a little while.",
        req,
      );
      if (limited) return limited;
    }

    const access_token = account.access_token_ref;
    if (!access_token) return jsonResponse({ error: 'Your bank connection needs to be reconnected.' }, 400, {}, req);

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
    // Populated from the accounts array on each page; the last page wins,
    // which is fine because every page reports the same current balance.
    let latestBalances: Record<string, unknown> | null = null;
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

      // The response carries an `accounts` array alongside the
      // transactions, and every entry has balances.current / .available /
      // .limit. This was read for `.transactions` and `.total_transactions`
      // only, so the balance for every account arrived on every sync and
      // was discarded — which is why the Net Worth screen showed $0 after
      // months of use. Capturing it needs no new Plaid product and no
      // re-authorisation.
      //
      // Only the account this sync is scoped to; one access token covers
      // every account at the institution and the array contains all of them.
      const acctBal = (txRes.data.accounts || [])
        .find((a: any) => a.account_id === account.provider_account_id);
      if (acctBal?.balances) {
        latestBalances = {
          current_balance: acctBal.balances.current ?? null,
          available_balance: acctBal.balances.available ?? null,
          balance_limit: acctBal.balances.limit ?? null,
          currency: acctBal.balances.iso_currency_code || 'USD',
          balance_updated_at: new Date().toISOString(),
        };
      }

      offset += txRes.data.transactions.length;
      if (offset >= txRes.data.total_transactions || txRes.data.transactions.length === 0) break;
    }

    // Build the duplicate-check set from what's ALREADY stored for this
    // window.
    //
    // This previously fetched with a bare select() and no range — but
    // PostgREST caps a response at 1,000 rows. On an account with 15,000+
    // transactions the set therefore held ~7% of the data, so almost
    // everything looked new and every full sync re-imported it. Four
    // full-history syncs in a row produced five copies of the same rows.
    //
    // Two fixes: only look at the date window actually being synced (far
    // fewer rows), and page through it properly instead of trusting one
    // request to return everything.
    const existingKeys = new Set<string>();
    const PAGE = 1000;
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await admin
        .from('transactions')
        .select('title, date, amount')
        .eq('user_id', account.user_id)
        .gte('date', startDate)
        .lte('date', endDate)
        .range(from, from + PAGE - 1);
      if (error) throw error;
      for (const t of data ?? []) existingKeys.add(`${t.title}-${t.date}-${t.amount}`);
      if (!data || data.length < PAGE) break;
    }

    let imported = 0;
    let skipped = 0;
    let failed = 0;

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
      const category = mapCategory(tx);

      // Store Plaid's own category verbatim as well. Previously only the
      // mapped result was kept, so improving the mapping later could never
      // be applied to rows already imported without re-fetching everything
      // from Plaid. Keeping the source value makes re-categorisation a
      // local operation.
      const { error } = await admin.from('transactions').insert({
        user_id: account.user_id,
        title, amount, type, category, date,
        pfc_primary: tx?.personal_finance_category?.primary ?? null,
        pfc_detailed: tx?.personal_finance_category?.detailed ?? null,
        // exclusion_reason deliberately omitted — the database trigger
        // classifies it. See the note where classifyExclusion() was removed.
        notes: `Imported from ${account.institution_name}`,
      });
      // Insert failures were silently discarded here while the log below
      // hardcoded error_count: 0 — so a sync where every single insert
      // failed reported "success, imported 0" and the only telemetry that
      // existed actively lied about it.
      if (error) {
        failed++;
        if (failed <= 3) console.error('transaction insert failed:', error.message);
      } else {
        imported++;
      }
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
      // Spread only when we actually got a balance. Writing nulls would
      // overwrite a good previous balance with "unknown" on any sync where
      // Plaid omitted the payload.
      ...(latestBalances || {}),
      // Only a full-window pass counts as a completed backfill.
      ...(wantsFullHistory ? { history_backfilled_at: new Date().toISOString() } : {}),
    }).eq('id', connected_account_id);

    await admin.from('bank_sync_logs').insert({
      user_id: account.user_id,
      provider: 'plaid',
      connected_account_id,
      started_at: new Date().toISOString(),
      finished_at: new Date().toISOString(),
      status: failed > 0 ? 'partial' : 'success',
      imported_count: imported,
      skipped_duplicate_count: skipped,
      error_count: failed,
      message: `Imported ${imported}, skipped ${skipped} duplicates, ${failed} failed`,
    });

    return jsonResponse({
      success: true,
      imported,
      skipped,
      fullHistoryPass: wantsFullHistory,
      requestedFrom: startDate,
      actualHistoryStart: historyStart,
      transactionsAvailableFromPlaid: plaidTxs.length,
    }, 200, {}, req);
  } catch (error) {
    console.error('plaid-sync-transactions error:', error.response?.data || error.message);

    // Release the 'syncing' status set before the Plaid call.
    //
    // Without this a single transient failure was permanent: the row stayed
    // at 'syncing' forever, and sync-all-accounts selects only rows where
    // sync_status = 'connected', so the cron never looked at that account
    // again. The bank kept showing as connected in the UI while new
    // transactions silently stopped arriving — the worst possible failure
    // mode, because nothing anywhere said anything was wrong.
    try {
      const body = await req.clone().json().catch(() => ({}));
      const id = body?.connected_account_id;
      if (id) {
        const admin2 = serviceClient();
        const { data: acct } = await admin2
          .from('connected_accounts').select('user_id').eq('id', id).single();
        await admin2.from('connected_accounts').update({
          sync_status: 'error',
          error_message: "We couldn't sync this account. Please try again.",
        }).eq('id', id);
        if (acct?.user_id) {
          await admin2.from('bank_sync_logs').insert({
            user_id: acct.user_id,
            provider: 'plaid',
            connected_account_id: id,
            started_at: new Date().toISOString(),
            finished_at: new Date().toISOString(),
            status: 'error',
            imported_count: 0,
            skipped_duplicate_count: 0,
            error_count: 1,
            message: 'Sync failed',
          });
        }
      }
    } catch (cleanupErr) {
      console.error('plaid-sync-transactions cleanup failed:', cleanupErr.message);
    }

    return errorResponse("We couldn't sync your transactions. Please try again.", 500, { internal: error, fn: 'plaid-sync-transactions', req });
  }
});
