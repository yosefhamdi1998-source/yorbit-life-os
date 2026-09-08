// Synthetic data only. Nothing here touches the production database — the
// fixture entity layer keeps it all in memory for the life of the tab.
// Deterministic (seeded PRNG) so screenshots are reproducible run to run.

const ANCHOR = new Date(2026, 8, 8); // 2026-09-08, the anchor these were authored against

function seeded(seed) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const daysAgo = (n) => { const d = new Date(ANCHOR); d.setDate(d.getDate() - n); return d; };

const SPEND = [
  { category: 'food', titles: ['Whole Foods', 'Chipotle', 'Corner Deli', 'Trader Joe’s'], lo: 12, hi: 95 },
  { category: 'transport', titles: ['Shell', 'MTA', 'Uber'], lo: 8, hi: 70 },
  { category: 'shopping', titles: ['Amazon', 'Uniqlo', 'Best Buy'], lo: 20, hi: 240 },
  { category: 'entertainment', titles: ['Netflix', 'AMC Theatres', 'Spotify'], lo: 11, hi: 60 },
  { category: 'health', titles: ['CVS Pharmacy', 'Equinox'], lo: 15, hi: 180 },
  { category: 'housing', titles: ['Rent', 'Con Edison'], lo: 90, hi: 1850 },
  { category: 'education', titles: ['Coursera', 'Barnes & Noble'], lo: 18, hi: 120 },
];

// 14 months of history so Week / Month / 3M / 6M / a full year / All each
// land on a genuinely different range — the whole point of the drill-down
// check.
function buildTransactions() {
  const rand = seeded(20260908);
  const rows = [];
  let n = 0;
  for (let day = 0; day < 430; day++) {
    const date = iso(daysAgo(day));
    const count = 1 + Math.floor(rand() * 3);
    for (let i = 0; i < count; i++) {
      const g = SPEND[Math.floor(rand() * SPEND.length)];
      rows.push({
        id: `tx-${n++}`,
        title: g.titles[Math.floor(rand() * g.titles.length)],
        amount: Math.round((g.lo + rand() * (g.hi - g.lo)) * 100) / 100,
        type: 'expense',
        category: g.category,
        date,
        created_date: date,
        exclude_from_budget: false,
      });
    }
    // Salary on the 1st and 15th
    const d = daysAgo(day);
    if (d.getDate() === 1 || d.getDate() === 15) {
      rows.push({ id: `tx-${n++}`, title: 'Paycheck', amount: 3200, type: 'income', category: 'other', date, created_date: date, exclude_from_budget: false });
    }
  }
  return rows;
}

// Only three of the seven spending categories carry a limit, so the
// "spent in budgets" figure is deliberately a long way short of everything
// that actually left the account — exactly the state the budget labels
// have to be honest about.
const BUDGETS = [
  { id: 'b-food', category: 'food', monthly_limit: 700, month: '2026-09' },
  { id: 'b-transport', category: 'transport', monthly_limit: 300, month: '2026-09' },
  { id: 'b-entertainment', category: 'entertainment', monthly_limit: 120, month: '2026-09' },
];

const BILLS = [
  { id: 'bill-1', name: 'Con Edison', amount: 142.18, due_date: '2026-08-28', category: 'housing', is_paid: false, is_recurring: true },
  { id: 'bill-2', name: 'Verizon Fios', amount: 89.99, due_date: '2026-09-02', category: 'housing', is_paid: false, is_recurring: true },
  { id: 'bill-3', name: 'Renters Insurance', amount: 21.5, due_date: '2026-09-19', category: 'housing', is_paid: false, is_recurring: true },
  { id: 'bill-4', name: 'Gym', amount: 45, due_date: '2026-09-01', category: 'health', is_paid: true, is_recurring: true },
];

const base = {
  transactions: buildTransactions(),
  budgets: BUDGETS,
  bills: BILLS,
  savings_goals: [
    { id: 'g-1', name: 'Emergency Fund', target_amount: 12000, current_amount: 4300, target_date: '2027-06-01', category: 'emergency' },
  ],
  net_worth_entries: [
    { id: 'nw-1', date: '2026-09-01', assets: 48200, liabilities: 12400, created_date: '2026-09-01' },
  ],
  ai_insight_caches: [],
  notifications: [],
  connected_accounts: [],
  investment_holdings: [],
  notes: [],
  goals: [],
  subscriptions: [],
};

export const SCENARIOS = {
  default: base,
  starter: { ...base, budgets: [] },
  // No overdue bills, so Home's recommendation falls through to the
  // spending tip and its own destination.
  nooverdue: { ...base, bills: BILLS.map(b => ({ ...b, is_paid: true })) },
  // Every category budgeted: the unbudgeted-spending disclosure must
  // disappear entirely rather than render a $0 line.
  fullybudgeted: {
    ...base,
    budgets: SPEND.map((g, i) => ({ id: `b-full-${i}`, category: g.category, monthly_limit: 2500, month: '2026-09' })),
  },
  // Nothing at all — the empty states.
  empty: { ...base, transactions: [], budgets: [], bills: [], savings_goals: [], net_worth_entries: [] },
};
