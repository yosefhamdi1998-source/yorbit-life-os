// Dev-only in-memory stand-in for src/api/entities.js, wired in by
// vite.fixture.config.js so UI states can be exercised at every viewport
// without reading or writing the production database. Never bundled by
// `npm run build`.
import { SCENARIOS } from './scenarios';

const scenarioName = new URLSearchParams(globalThis.location?.search || '').get('scenario') || 'default';
const DATA = SCENARIOS[scenarioName] || SCENARIOS.default;

function applySort(rows, sort) {
  const s = sort || '-created_date';
  const desc = s.startsWith('-');
  const col = desc ? s.slice(1) : s;
  return [...rows].sort((a, b) => {
    const av = a?.[col] ?? '';
    const bv = b?.[col] ?? '';
    if (av === bv) return 0;
    return (av > bv ? 1 : -1) * (desc ? -1 : 1);
  });
}

class FixtureEntity {
  constructor(table) {
    this.table = table;
    this.rows = (DATA[table] || []).map((r, i) => ({ id: r.id ?? `${table}-${i}`, created_date: r.created_date ?? '2026-01-01', ...r }));
  }
  async list(sort, limit) { const r = applySort(this.rows, sort); return limit ? r.slice(0, limit) : r; }
  async filter(q = {}, sort, limit) {
    const matched = this.rows.filter(r => Object.entries(q).every(([k, v]) => r[k] === v));
    const r = applySort(matched, sort);
    return limit ? r.slice(0, limit) : r;
  }
  async create(payload) { const row = { id: `${this.table}-new-${this.rows.length}`, created_date: new Date().toISOString(), ...payload }; this.rows.push(row); return row; }
  async update(id, payload) { const row = this.rows.find(r => r.id === id); Object.assign(row, payload); return row; }
  async delete(id) { this.rows = this.rows.filter(r => r.id !== id); return { success: true }; }
  async bulkUpdate(rows) { return Promise.all(rows.map(({ id, ...f }) => this.update(id, f))); }
  async deleteMany(q = {}) { this.rows = this.rows.filter(r => !Object.entries(q).every(([k, v]) => r[k] === v)); return { success: true }; }
}

// Mirrors the real TransactionEntity: the default list excludes investing
// activity, which is reached through the explicit helpers instead.
class FixtureTransactionEntity extends FixtureEntity {
  budgeted() { return this.rows.filter(r => !r.exclude_from_budget); }
  investing() { return this.rows.filter(r => r.exclude_from_budget); }
  async list(sort, limit) { const r = applySort(this.budgeted(), sort); return limit ? r.slice(0, limit) : r; }
  async filter(q = {}, sort, limit) {
    const matched = this.budgeted().filter(r => Object.entries(q).every(([k, v]) => r[k] === v));
    const r = applySort(matched, sort);
    return limit ? r.slice(0, limit) : r;
  }
  async listInvestments(sort, limit) { const r = applySort(this.investing(), sort); return limit ? r.slice(0, limit) : r; }
  async listPayments(sort, limit) { return this.listInvestments(sort, limit); }
  async listCashFromInvestments(sort, limit) { return this.listInvestments(sort, limit); }
  async listAll(sort, limit) { const r = applySort(this.rows, sort); return limit ? r.slice(0, limit) : r; }
  async cryptoAssetSummary() { return []; }
  async cryptoYearlySummary() { return []; }
  async cryptoPnlByYear() { return []; }
  async cryptoTimeCoverage() { return { first: null, last: null }; }
  async summaryStats() {
    const b = this.budgeted().map(t => t.date).filter(Boolean).sort();
    return { total: this.rows.length, budgeted: b.length, first: b[0] || null, last: b[b.length - 1] || null };
  }
}

const TABLES = [
  'transactions', 'bills', 'budgets', 'goals', 'savings_goals', 'net_worth_entries',
  'habits', 'tasks', 'health_logs', 'journal_entries', 'notes', 'custom_forms',
  'custom_records', 'ai_insight_caches', 'notifications', 'connected_accounts',
  'investment_holdings', 'bank_sync_logs', 'subscriptions', 'advisor_conversations',
  'advisor_messages',
];
const NAMES = {
  Transaction: 'transactions', Bill: 'bills', Budget: 'budgets', Goal: 'goals',
  SavingsGoal: 'savings_goals', NetWorthEntry: 'net_worth_entries', Habit: 'habits',
  Task: 'tasks', HealthLog: 'health_logs', JournalEntry: 'journal_entries', Note: 'notes',
  CustomForm: 'custom_forms', CustomRecord: 'custom_records', AIInsightCache: 'ai_insight_caches',
  Notification: 'notifications', ConnectedAccount: 'connected_accounts',
  InvestmentHolding: 'investment_holdings', BankSyncLog: 'bank_sync_logs',
  Subscription: 'subscriptions', AdvisorConversation: 'advisor_conversations',
  AdvisorMessage: 'advisor_messages',
};
void TABLES;

export const entities = Object.fromEntries(
  Object.entries(NAMES).map(([name, table]) => [
    name,
    name === 'Transaction' ? new FixtureTransactionEntity(table) : new FixtureEntity(table),
  ])
);
