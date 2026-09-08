import { BUDGET_CATEGORIES } from './enums.js';

export function buildStarterBudget(transactions, month) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return null;
  const [year, number] = month.split('-').map(Number);
  const months = [3, 2, 1].map(offset => {
    const date = new Date(Date.UTC(year, number - 1 - offset, 1));
    return date.toISOString().slice(0, 7);
  });
  const valid = transactions.filter(t => !t.exclude_from_budget && Number.isFinite(Number(t.amount)) && Number(t.amount) > 0);
  const firstMonth = valid.map(t => t.date?.slice(0, 7)).filter(Boolean).sort()[0];
  // Skip the earliest recorded month: it may start halfway through a statement.
  const covered = months.filter(m => firstMonth && m > firstMonth);
  if (!covered.length) return null;
  const history = valid.filter(t => covered.includes(t.date?.slice(0, 7)));
  const incomeMonths = covered.map(m => history.filter(t => t.type === 'income' && t.date.startsWith(m)).reduce((sum, t) => sum + Number(t.amount), 0));
  const sortedIncome = [...incomeMonths].sort((a,b) => a-b);
  const baseline = sortedIncome[Math.floor((sortedIncome.length - 1) / 2)];
  const rows = BUDGET_CATEGORIES.filter(category => category !== 'savings').map(category => {
    const total = history.filter(t => t.type === 'expense' && t.category === category).reduce((sum,t) => sum + Number(t.amount), 0);
    return { category, monthly_limit: Math.ceil(total / covered.length / 5) * 5 };
  }).filter(row => row.monthly_limit > 0).sort((a,b) => b.monthly_limit - a.monthly_limit);
  if (!rows.length) return null;
  return { rows, incomeBaseline: baseline, months: covered, total: rows.reduce((sum,row) => sum + row.monthly_limit, 0) };
}
