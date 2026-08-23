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

class Entity {
  constructor(table) {
    this.table = table;
  }

  // base44: entities.X.list(sort?, limit?)
  async list(sort, limit) {
    let query = supabase.from(this.table).select('*');
    query = applySort(query, sort || '-created_date');
    if (limit) query = query.limit(limit);
    return unwrap(await query);
  }

  // base44: entities.X.filter(queryObj, sort?, limit?)
  async filter(queryObj = {}, sort, limit) {
    let query = supabase.from(this.table).select('*');
    for (const [key, value] of Object.entries(queryObj)) {
      query = query.eq(key, value);
    }
    query = applySort(query, sort || '-created_date');
    if (limit) query = query.limit(limit);
    return unwrap(await query);
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
