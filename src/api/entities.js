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
  BankSyncLog: 'bank_sync_logs',
  Subscription: 'subscriptions',
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

  async _paginated(buildQuery, limit) {
    const target = limit ?? Infinity;
    const rows = [];
    let from = 0;
    while (rows.length < target) {
      const pageSize = Math.min(SERVER_MAX_PAGE, target - rows.length);
      const page = unwrap(await buildQuery(from, from + pageSize - 1));
      rows.push(...page);
      if (page.length < pageSize) break; // fewer than asked for = no more rows
      from += pageSize;
    }
    return rows;
  }

  // base44: entities.X.list(sort?, limit?)
  async list(sort, limit) {
    return this._paginated((from, to) => {
      let query = supabase.from(this.table).select('*');
      query = applySort(query, sort || '-created_date');
      return query.range(from, to);
    }, limit);
  }

  // base44: entities.X.filter(queryObj, sort?, limit?)
  async filter(queryObj = {}, sort, limit) {
    return this._paginated((from, to) => {
      let query = supabase.from(this.table).select('*');
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

export const entities = Object.fromEntries(
  Object.entries(TABLE_MAP).map(([name, table]) => [name, new Entity(table)])
);
