import { format, parseISO, startOfDay, subDays } from 'date-fns';

// Single source of truth for the Week/Month/Year/Last Year period model
// used across Home, Goals, and Save More. Anchors "recent" windows (week)
// to the newest transaction on record rather than the literal calendar
// date — imported/historical data can trail today's real date by weeks,
// and a window counted from "right now" would silently show $0 for
// anyone whose last transaction isn't from today (the bug fixed on the
// Money page's Weekly/Bi-Weekly, generalized here).
export const PERIODS = [
  { key: 'week', label: 'Week' },
  { key: 'month', label: 'Month' },
  { key: 'year', label: 'Year' },
  { key: 'lastyear', label: 'Last Year' },
];

export function getLatestTransactionDate(transactions) {
  let latest = null;
  for (const t of transactions) {
    if (t.date && (!latest || t.date > latest)) latest = t.date;
  }
  return latest ? parseISO(latest) : new Date();
}

export function filterByPeriod(transactions, period, latestTxDate) {
  const anchor = latestTxDate || getLatestTransactionDate(transactions);
  const thisYear = new Date().getFullYear();
  if (period === 'week') {
    const cutoff = startOfDay(subDays(anchor, 6));
    return transactions.filter(t => t.date && parseISO(t.date) >= cutoff);
  }
  if (period === 'year') return transactions.filter(t => t.date?.startsWith(String(thisYear)));
  if (period === 'lastyear') return transactions.filter(t => t.date?.startsWith(String(thisYear - 1)));
  // month (default)
  const thisMonth = format(new Date(), 'yyyy-MM');
  return transactions.filter(t => t.date?.startsWith(thisMonth));
}

// The immediately-preceding window of the same length, for "vs last
// period" comparisons (Savings Progress, Save More).
export function filterByPreviousPeriod(transactions, period, latestTxDate) {
  const anchor = latestTxDate || getLatestTransactionDate(transactions);
  const thisYear = new Date().getFullYear();
  if (period === 'week') {
    const end = startOfDay(subDays(anchor, 7));
    const start = startOfDay(subDays(anchor, 13));
    return transactions.filter(t => {
      if (!t.date) return false;
      const d = parseISO(t.date);
      return d >= start && d <= end;
    });
  }
  if (period === 'year') return transactions.filter(t => t.date?.startsWith(String(thisYear - 1)));
  if (period === 'lastyear') return transactions.filter(t => t.date?.startsWith(String(thisYear - 2)));
  // month: the calendar month before "this month"
  const d = new Date();
  d.setMonth(d.getMonth() - 1);
  const lastMonth = format(d, 'yyyy-MM');
  return transactions.filter(t => t.date?.startsWith(lastMonth));
}

export function getPeriodLabel(period) {
  const thisYear = new Date().getFullYear();
  if (period === 'week') return 'Last 7 Days';
  if (period === 'year') return String(thisYear);
  if (period === 'lastyear') return String(thisYear - 1);
  return format(new Date(), 'MMMM yyyy');
}

export function getPeriodPhrase(period) {
  if (period === 'week') return 'this week';
  if (period === 'year') return 'this year';
  if (period === 'lastyear') return 'last year';
  return 'this month';
}

export function sumByType(transactions) {
  const income = transactions.filter(t => t.type === 'income').reduce((s, t) => s + (t.amount || 0), 0);
  const expenses = transactions.filter(t => t.type === 'expense').reduce((s, t) => s + (t.amount || 0), 0);
  return { income, expenses, net: income - expenses };
}
