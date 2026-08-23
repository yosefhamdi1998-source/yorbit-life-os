import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { Configuration, PlaidApi, PlaidEnvironments } from 'npm:plaid@29.0.0';

const CATEGORY_MAP = {
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

function mapCategory(plaidCategories) {
  if (!plaidCategories || plaidCategories.length === 0) return 'other';
  const top = plaidCategories[0];
  return CATEGORY_MAP[top] || 'other';
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { connected_account_id } = await req.json();

    // Get the connected account
    const accounts = await base44.asServiceRole.entities.ConnectedAccount.filter({ id: connected_account_id });
    const account = accounts[0];
    if (!account) return Response.json({ error: 'We couldn\'t find this account. Please reconnect your bank.' }, { status: 404 });

    const access_token = account.access_token_ref;
    if (!access_token) return Response.json({ error: 'Your bank connection needs to be reconnected.' }, { status: 400 });

    // Mark as syncing
    await base44.asServiceRole.entities.ConnectedAccount.update(connected_account_id, { sync_status: 'syncing' });

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

    // Get transactions from last 30 days
    const endDate = new Date().toISOString().split('T')[0];
    const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const txRes = await plaidClient.transactionsGet({
      access_token,
      start_date: startDate,
      end_date: endDate,
      options: { count: 100 },
    });

    const plaidTxs = txRes.data.transactions;

    // Fetch existing transactions to avoid duplicates
    const existing = await base44.asServiceRole.entities.Transaction.filter({ created_by_id: user.id });
    const existingTitles = new Set(existing.map(t => `${t.title}-${t.date}-${t.amount}`));

    let imported = 0;
    let skipped = 0;

    for (const tx of plaidTxs) {
      if (tx.pending) { skipped++; continue; }

      const title = tx.merchant_name || tx.name || 'Transaction';
      const amount = Math.abs(tx.amount);
      const date = tx.date;
      const key = `${title}-${date}-${amount}`;

      if (existingTitles.has(key)) { skipped++; continue; }

      // Plaid amounts: positive = money out (expense), negative = money in (income)
      const type = tx.amount > 0 ? 'expense' : 'income';
      const category = mapCategory(tx.category);

      await base44.asServiceRole.entities.Transaction.create({
        title,
        amount,
        type,
        category,
        date,
        notes: `Imported from ${account.institution_name}`,
      });
      imported++;
    }

    // Update sync status and timestamp
    await base44.asServiceRole.entities.ConnectedAccount.update(connected_account_id, {
      sync_status: 'connected',
      last_synced_at: new Date().toISOString(),
    });

    // Log the sync
    await base44.asServiceRole.entities.BankSyncLog.create({
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

    return Response.json({ success: true, imported, skipped });
  } catch (error) {
    console.error('plaidSyncTransactions error:', error.response?.data || error.message);
    return Response.json({ error: 'We couldn\'t sync your transactions. Please try again.' }, { status: 500 });
  }
});