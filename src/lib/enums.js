/**
 * SINGLE SOURCE OF TRUTH for every enum-backed field in the app.
 *
 * Each list below mirrors a CHECK constraint in the database exactly.
 * They are duplicated here because the frontend needs them to build
 * dropdowns, and there is no way to read a Postgres constraint from the
 * browser at runtime.
 *
 * That duplication is exactly what caused two silent, invisible bugs:
 *   - Budget offered a category ("investment") that budgets.category
 *     rejects, so saving always failed.
 *   - detectRecurring wrote a transaction category into bills.category,
 *     which accepts a completely different set, so "Add" was a dead button.
 * Both looked like nothing happening at all — the worst kind of bug,
 * because it's invisible until a real user hits it.
 *
 * So this file is verified, not trusted:
 *     npm run check:enums
 * queries the live database and fails if ANY list here has drifted from
 * its constraint. Run it after any migration that touches a CHECK
 * constraint. Do not edit a list here without changing the constraint,
 * or vice versa.
 */

// --- transactions -------------------------------------------------------
export const TRANSACTION_TYPES = ['income', 'expense'];
export const TRANSACTION_CATEGORIES = [
  'housing', 'food', 'transport', 'entertainment', 'health', 'shopping',
  'education', 'savings', 'salary', 'freelance', 'investment', 'other',
];
// Why a transaction is kept out of budgeting totals. All four are still
// the user's real data and still visible somewhere — they just aren't
// spending *categories*:
//   investment — crypto/brokerage trading (Investments page)
//   transfer   — moving money between your own accounts
//   p2p        — sending money to a person (Payments Sent page)
//   cash       — ATM withdrawals
export const TRANSACTION_EXCLUSION_REASONS = ['investment', 'transfer', 'p2p', 'cash'];

// Which transaction categories belong to money coming in vs going out.
// Not a database constraint — a UI split of TRANSACTION_CATEGORIES, kept
// here so the two halves can't drift from the whole.
export const INCOME_CATEGORIES = ['salary', 'freelance', 'investment', 'other'];
export const EXPENSE_CATEGORIES = [
  'housing', 'food', 'transport', 'entertainment', 'health', 'shopping',
  'education', 'other',
];

// --- bills --------------------------------------------------------------
export const BILL_CATEGORIES = [
  'housing', 'utilities', 'phone', 'insurance', 'subscription',
  'credit_card', 'loan', 'other',
];

// --- budgets ------------------------------------------------------------
// Note: NO 'investment' — investing activity is deliberately excluded from
// budgeting and lives on the Investments page.
export const BUDGET_CATEGORIES = [
  'housing', 'food', 'transport', 'entertainment', 'health', 'shopping',
  'education', 'savings', 'other',
];

// --- net worth ----------------------------------------------------------
export const NET_WORTH_TYPES = ['asset', 'liability'];
export const NET_WORTH_CATEGORIES = [
  'cash', 'investment', 'property', 'vehicle', 'crypto', 'loan',
  'mortgage', 'credit_card', 'other',
];

// --- life-organizer tables (kept for existing data; not in main nav) -----
export const GOAL_CATEGORIES = [
  'career', 'health', 'finance', 'relationships', 'learning', 'personal', 'other',
];
export const GOAL_STATUSES = ['active', 'completed', 'paused'];
export const HABIT_FREQUENCIES = ['daily', 'weekly'];
export const JOURNAL_MOODS = ['great', 'good', 'neutral', 'bad', 'terrible'];
export const TASK_PRIORITIES = ['low', 'medium', 'high', 'urgent'];
export const TASK_STATUSES = ['todo', 'in_progress', 'done'];

// --- system / infrastructure -------------------------------------------
export const NOTIFICATION_TYPES = ['subscription_renewal', 'bill_due', 'goal', 'info'];
export const PROFILE_ROLES = ['user', 'admin'];
export const SUBSCRIPTION_PLANS = ['free', 'pro_monthly', 'pro_yearly'];
export const SUBSCRIPTION_STATUSES = ['active', 'canceled', 'past_due', 'trialing', 'incomplete'];
export const BANK_PROVIDERS = ['plaid', 'teller'];
export const BANK_SYNC_STATUSES = ['success', 'partial', 'failed'];
export const CONNECTED_ACCOUNT_SYNC_STATUSES = [
  'not_connected', 'connected', 'syncing', 'error', 'disconnected',
];
export const AI_INSIGHT_TYPES = ['briefing', 'coach'];
export const ADVISOR_MESSAGE_ROLES = ['user', 'assistant'];

/**
 * Maps each exported list to the database constraint it mirrors, so
 * scripts/check-enums.cjs can verify all of them automatically. A field
 * with a CHECK constraint that is NOT listed here will also be reported,
 * so new constraints can't be added without being covered.
 */
export const ENUM_CONSTRAINT_MAP = {
  transactions_type_check: TRANSACTION_TYPES,
  transactions_category_check: TRANSACTION_CATEGORIES,
  transactions_exclusion_reason_check: TRANSACTION_EXCLUSION_REASONS,
  bills_category_check: BILL_CATEGORIES,
  budgets_category_check: BUDGET_CATEGORIES,
  net_worth_entries_type_check: NET_WORTH_TYPES,
  net_worth_entries_category_check: NET_WORTH_CATEGORIES,
  goals_category_check: GOAL_CATEGORIES,
  goals_status_check: GOAL_STATUSES,
  habits_frequency_check: HABIT_FREQUENCIES,
  journal_entries_mood_check: JOURNAL_MOODS,
  tasks_priority_check: TASK_PRIORITIES,
  tasks_status_check: TASK_STATUSES,
  notifications_type_check: NOTIFICATION_TYPES,
  profiles_role_check: PROFILE_ROLES,
  subscriptions_plan_check: SUBSCRIPTION_PLANS,
  subscriptions_status_check: SUBSCRIPTION_STATUSES,
  bank_sync_logs_provider_check: BANK_PROVIDERS,
  bank_sync_logs_status_check: BANK_SYNC_STATUSES,
  connected_accounts_provider_check: BANK_PROVIDERS,
  connected_accounts_sync_status_check: CONNECTED_ACCOUNT_SYNC_STATUSES,
  ai_insight_caches_type_check: AI_INSIGHT_TYPES,
  advisor_messages_role_check: ADVISOR_MESSAGE_ROLES,
};

// INCOME_CATEGORIES + EXPENSE_CATEGORIES are UI subsets, so they get their
// own rule: every value must exist in the full transactions list.
export const SUBSET_CHECKS = {
  INCOME_CATEGORIES: { subset: INCOME_CATEGORIES, of: TRANSACTION_CATEGORIES },
  EXPENSE_CATEGORIES: { subset: EXPENSE_CATEGORIES, of: TRANSACTION_CATEGORIES },
};
