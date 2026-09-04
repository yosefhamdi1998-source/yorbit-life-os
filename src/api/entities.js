import { supabase } from './supabaseClient';

// Maps the PascalCase entity names used throughout the app (base44.entities.Transaction, etc.)
// to their Postgres table names in schema.sql.
const TABLE_MAP = {
  Transaction: 'transactions',
  Bill: 'bills',
  Budget: 'budgets',
  Goal: 'goals',
  SavingsGoal: 'savings_goals',
  NetWorthEntry: 'net_worth_entries',
  Habit: 'habits',
  Task: 'tasks',
  HealthLog: 'health_logs',
  JournalEntry: 'journal_entries',
  Note: 'notes',
  CustomForm: 'custom_forms',
  CustomRecord: 'custom_records',
  AIInsightCache: 'ai_insight_caches',
  Notification: 'notifications',
  ConnectedAccount: 'connected_accounts',
  InvestmentHolding: 'investment_holdings',
  BankSyncLog: 'bank_sync_logs',
  Subscription: 'subscriptions',
  AdvisorConversation: 'advisor_conversations',
  AdvisorMessage: 'advisor_messages',
};

// Parses base44-style sort strings: 'due_date' (asc) or '-created_date' (desc).
function applySort(query, sort) {
  if (!sort) return query;
  const desc = sort.startsWith('-');
  const column = desc ? sort.slice(1) : sort;
  return query.order(column, { ascending: !desc });
}

async function getUserId() {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user) throw new Error('Not authenticated');
  return data.user.id;
}

function unwrap({ data, error }) {
  if (error) throw new Error(error.message);
  return data;
}

// Supabase/PostgREST enforces a project-level "Max Rows" cap (this project's
// is 1,000) that silently truncates ANY single request to that many rows —
// a plain `.limit(50000)` from the client does nothing to raise it; the
// server just returns its 1,000-row page and stops, no error, no warning.
// That meant every `.list()`/`.filter()` call in the app — Home's hero,
// Budget, Money, Save More, the Totals page — was quietly only ever seeing
// the newest 1,000 transactions, not the real total, once the account grew
// past that (which it badly has: 15,000+ rows). Paginating in the client
// with repeated `.range()` calls up to the server's page size is the fix;
// it's transparent to every caller, none of which need to change.
const SERVER_MAX_PAGE = 1000;

class Entity {
  constructor(table) {
    this.table = table;
  }

  // The first page is fetched with an exact count, so we know up front how
  // many more pages (if any) exist — every remaining page is then fired in
  // parallel instead of waiting for each one before starting the next. For
  // a 15,000-row account on a 1,000-row server page cap, that's the
  // difference between ~16 sequential round trips (several seconds, on
  // every single page in the app that lists all transactions) and
  // effectively 2 round trips' worth of latency total.
  async _paginated(buildQuery, limit) {
    const target = limit ?? Infinity;
    const firstPageSize = Math.min(SERVER_MAX_PAGE, target);
    const first = await buildQuery(0, firstPageSize - 1, true);
    if (first.error) throw new Error(first.error.message);
    const rows = [...first.data];
    const totalAvailable = first.count ?? rows.length;
    const totalNeeded = Math.min(totalAvailable, target);

    if (rows.length < totalNeeded && first.data.length === firstPageSize) {
      const requests = [];
      for (let from = firstPageSize; from < totalNeeded; from += SERVER_MAX_PAGE) {
        const to = Math.min(from + SERVER_MAX_PAGE, totalNeeded) - 1;
        requests.push(buildQuery(from, to, false));
      }
      const pages = await Promise.all(requests);
      for (const page of pages) {
        if (page.error) throw new Error(page.error.message);
        rows.push(...page.data);
      }
    }
    return rows;
  }

  // base44: entities.X.list(sort?, limit?)
  async list(sort, limit) {
    return this._paginated((from, to, withCount) => {
      let query = supabase.from(this.table).select('*', withCount ? { count: 'exact' } : undefined);
      query = applySort(query, sort || '-created_date');
      return query.range(from, to);
    }, limit);
  }

  // base44: entities.X.filter(queryObj, sort?, limit?)
  async filter(queryObj = {}, sort, limit) {
    return this._paginated((from, to, withCount) => {
      let query = supabase.from(this.table).select('*', withCount ? { count: 'exact' } : undefined);
      for (const [key, value] of Object.entries(queryObj)) {
        query = query.eq(key, value);
      }
      query = applySort(query, sort || '-created_date');
      return query.range(from, to);
    }, limit);
  }

  // base44: entities.X.create(data)
  async create(payload) {
    const user_id = await getUserId();
    const result = unwrap(
      await supabase.from(this.table).insert({ ...payload, user_id }).select().single()
    );
    return result;
  }

  // base44: entities.X.update(id, data)
  async update(id, payload) {
    const result = unwrap(
      await supabase.from(this.table).update(payload).eq('id', id).select().single()
    );
    return result;
  }

  // base44: entities.X.delete(id)
  async delete(id) {
    unwrap(await supabase.from(this.table).delete().eq('id', id));
    return { success: true };
  }

  // base44: entities.X.bulkUpdate([{ id, ...fields }, ...])
  async bulkUpdate(rows) {
    const results = [];
    for (const row of rows) {
      const { id, ...fields } = row;
      results.push(await this.update(id, fields));
    }
    return results;
  }

  // base44: entities.X.deleteMany({ field: value }) — used by customForms cascade delete
  async deleteMany(queryObj = {}) {
    let query = supabase.from(this.table).delete();
    for (const [key, value] of Object.entries(queryObj)) {
      query = query.eq(key, value);
    }
    unwrap(await query);
    return { success: true };
  }
}

// Transactions come in two flavours and mixing them is what made every
// number in the app wrong: money you actually earned and spent, and
// investing activity (crypto trades especially, where buying and selling
// the same money repeatedly inflates both income and expenses without any
// of it being real income or real spending).
//
// So the default `list`/`filter` — what every budgeting screen in the app
// already calls — returns ONLY budget-relevant money. Investing activity is
// still there, still owned by the user, nothing deleted; it's reached
// explicitly through `listInvestments()`. Filtering here rather than in
// each page means no screen can accidentally forget to do it.

// Columns the UI actually reads. `select('*')` returned all 14, including
// five nothing renders: pfc_primary, pfc_detailed, updated_date,
// exclusion_reason, and exclude_from_budget (which is filtered
// server-side and never read on the client).
//
// Measured against the real 15,700-row account: select('*') serialises to
// 7,130 kB, these seven to 2,781 kB. Same rows, same behaviour, 61% less
// over the wire — and eight pages each pull the full history on load, so
// this is the single highest-leverage change in the app.
//
// Verified by grepping every read of each column across pages, components
// and lib before removing any. If a screen ever needs one of the dropped
// columns, add it HERE rather than reverting to '*'.
const TX_COLUMNS = 'id,user_id,title,amount,type,category,date,notes,created_date';

// Investments.jsx reads only these four off each row.
// provider_memo carries Coinbase's own text, and 845 of those rows contain
// actual coin quantities ("Converted 0.037 BTC to 0.632 ETH") - the only
// quantity data anywhere in this dataset.
// Real columns now, not prose. crypto_asset and crypto_quantity come
// straight from Coinbase's export; quantity is SIGNED, so summing it per
// asset is the position. Investments.jsx no longer parses titles.
const INVESTMENT_COLUMNS = 'id,title,amount,date,type,crypto_asset,crypto_quantity,provider_memo';

class TransactionEntity extends Entity {
  async list(sort, limit) {
    return this._paginated((from, to, withCount) => {
      let query = supabase.from(this.table).select(TX_COLUMNS, withCount ? { count: 'exact' } : undefined);
      query = query.eq('exclude_from_budget', false);
      query = query.eq('superseded_by_import', false);
      query = applySort(query, sort || '-created_date');
      return query.range(from, to);
    }, limit);
  }

  async filter(queryObj = {}, sort, limit) {
    return this._paginated((from, to, withCount) => {
      let query = supabase.from(this.table).select(TX_COLUMNS, withCount ? { count: 'exact' } : undefined);
      query = query.eq('exclude_from_budget', false);
      query = query.eq('superseded_by_import', false);
      for (const [key, value] of Object.entries(queryObj)) {
        query = query.eq(key, value);
      }
      query = applySort(query, sort || '-created_date');
      return query.range(from, to);
    }, limit);
  }

  // Investing activity only — powers the Investments section. Note this
  // filters on the REASON, not just the exclusion flag: bank-to-bank
  // transfers are also kept out of budgeting, but they aren't investments
  // and would be nonsense on that page.
  async listInvestments(sort, limit) {
    return this._paginated((from, to, withCount) => {
      // The heaviest query in the app by an order of magnitude: this
      // account holds 14,913 investment rows (crypto trades) against 344
      // budget rows. Investments.jsx aggregates all of them client-side by
      // parsing `title`, so it genuinely needs every row — but it reads
      // only four fields off each one (verified by grepping every `t.*`
      // access in that file). select('*') was 6,794 kB; these four are
      // 2,234 kB.
      //
      // Aggregating this in Postgres would be better still, but the
      // grouping depends on parseActivity() parsing the title in JS.
      // Reimplementing that in SQL would create exactly the duplicated-logic
      // drift that caused the enum bugs, so it stays client-side until the
      // asset/action is stored as a real column.
      let query = supabase.from(this.table).select(INVESTMENT_COLUMNS, withCount ? { count: 'exact' } : undefined);
      query = query.eq('exclusion_reason', 'investment');
      // Rows replaced by the authoritative Coinbase import are kept for
      // audit but must never be counted - including them double-counts
      // every 2023-2026 trade.
      query = query.eq('superseded_by_import', false);
      query = applySort(query, sort || '-date');
      return query.range(from, to);
    }, limit);
  }

  // Person-to-person payments (Venmo/Zelle/Cash App) and ATM withdrawals.
  // These are excluded from budgeting because they have no spending
  // category — but they're still real money the user moved, so the
  // Payments Sent page reads them here. Without this, marking them
  // excluded would have silently emptied that entire page.
  async listPayments(sort, limit) {
    return this._paginated((from, to, withCount) => {
      let query = supabase.from(this.table).select(TX_COLUMNS + ',exclusion_reason', withCount ? { count: 'exact' } : undefined);
      query = query.in('exclusion_reason', ['p2p', 'cash']);
      query = query.eq('superseded_by_import', false);
      query = applySort(query, sort || '-date');
      return query.range(from, to);
    }, limit);
  }

  // Cash arriving in the bank FROM investments — a Coinbase withdrawal, a
  // brokerage transfer out. This is not earned income and must never be
  // added to salary, but hiding it makes a user's cash flow nonsensical:
  // this account showed $359 of income against $1,769 of spending in June
  // while $8,846 of crypto withdrawals that year were invisible.
  //
  // Surfaced as its own line so "where did the money come from" has a true
  // answer without overstating what was earned.
  async listCashFromInvestments(sort, limit) {
    return this._paginated((from, to, withCount) => {
      let query = supabase.from(this.table).select(
        'id,title,amount,date,type,crypto_asset',
        withCount ? { count: 'exact' } : undefined,
      );
      query = query.eq('exclusion_reason', 'investment');
      query = query.eq('superseded_by_import', false);
      // The fiat leg only: USD leaving the exchange for a bank account.
      query = query.eq('crypto_asset', 'USD');
      query = query.ilike('title', 'Coinbase Withdrawal%');
      query = applySort(query, sort || '-date');
      return query.range(from, to);
    }, limit);
  }

  // Everything, unfiltered — for tools that genuinely need the full ledger.
  async listAll(sort, limit) {
    return super.list(sort, limit);
  }
}

export const entities = Object.fromEntries(
  Object.entries(TABLE_MAP).map(([name, table]) => [
    name,
    name === 'Transaction' ? new TransactionEntity(table) : new Entity(table),
  ])
);
