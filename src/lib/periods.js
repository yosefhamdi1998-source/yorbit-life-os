import { format, parseISO, startOfDay, subDays, startOfMonth, subMonths } from 'date-fns';

// Single source of truth for the Week/Month/3-Month/6-Month/Year/Last Year/
// All period model used across Home, Goals, and Save More. Anchors "recent"
// windows (week, 3-month, 6-month) to the newest transaction on record
// rather than the literal calendar date — imported/historical data can
// trail today's real date by weeks, and a window counted from "right now"
// would silently show $0 for anyone whose last transaction isn't from
// today (the bug fixed on the Money page's Weekly/Bi-Weekly, generalized
// here).
export const PERIODS = [
  { key: 'week', label: 'Week' },
  { key: 'month', label: 'Month' },
  { key: 'year', label: 'Year' },
  { key: 'lastyear', label: 'Last Year' },
];

// Rolling N-calendar-month windows (3-month/6-month) anchor to the *month*
// of the latest transaction, not just the last N*30 days — so "3 Months"
// always reads as 3 whole calendar months of data, matching how a person
// would describe "the last quarter."
function monthsBackStart(anchor, months) {
  return startOfMonth(subMonths(anchor, months - 1));
}

export function getLatestTransactionDate(transactions) {
  let latest = null;
  for (const t of transactions) {
    if (t.date && (!latest || t.date > latest)) latest = t.date;
  }
  return latest ? parseISO(latest) : new Date();
}

// A specific calendar year, e.g. "year-2023" — not just "this year"/"last
// year". Any consumer that wants a year picker (not just the two fixed
// chips) passes this instead of the 'year'/'lastyear' keys.
export function isSpecificYearPeriod(period) {
  return typeof period === 'string' && period.startsWith('year-');
}

export function filterByPeriod(transactions, period, latestTxDate) {
  const anchor = latestTxDate || getLatestTransactionDate(transactions);
  // Anchored to the latest transaction's own year, not the literal
  // calendar year — same reasoning as week/3-month/6-month above. Someone
  // who just bulk-imported statements that stop in a past month/year (a
  // new user, or a fresh CSV/PDF import) would otherwise see "This Month"
  // and "This Year" come back empty, since literal today has nothing in
  // it yet, while Week (already anchored) correctly showed real data —
  // exactly the "week looks right, month looks wrong" bug.
  const anchorYear = anchor.getFullYear();
  if (period === 'all') return transactions;
  if (period === 'week') {
    const cutoff = startOfDay(subDays(anchor, 6));
    return transactions.filter(t => t.date && parseISO(t.date) >= cutoff);
  }
  if (period === '3month' || period === '6month') {
    const months = period === '3month' ? 3 : 6;
    const cutoff = format(monthsBackStart(anchor, months), 'yyyy-MM-dd');
    return transactions.filter(t => t.date && t.date >= cutoff);
  }
  if (isSpecificYearPeriod(period)) return transactions.filter(t => t.date?.startsWith(period.slice(5)));
  if (period === 'year') return transactions.filter(t => t.date?.startsWith(String(anchorYear)));
  if (period === 'lastyear') return transactions.filter(t => t.date?.startsWith(String(anchorYear - 1)));
  // month (default) — trailing 30 days, NOT the calendar month. "Week" is
  // already a trailing 7 days, so a calendar month sitting next to it was
  // inconsistent, and on the 1st or 2nd of a month it showed one or two
  // days of data: a hero reading "$0 income" purely because the month had
  // just started. A trailing window always answers the question people
  // actually mean by "this month".
  const cutoff = startOfDay(subDays(anchor, 29));
  return transactions.filter(t => t.date && parseISO(t.date) >= cutoff);
}

// The immediately-preceding window of the same length, for "vs last
// period" comparisons (Savings Progress, Save More).
export function filterByPreviousPeriod(transactions, period, latestTxDate) {
  const anchor = latestTxDate || getLatestTransactionDate(transactions);
  const anchorYear = anchor.getFullYear();
  if (period === 'all') return []; // no "previous" window for all-time
  if (period === 'week') {
    const end = startOfDay(subDays(anchor, 7));
    const start = startOfDay(subDays(anchor, 13));
    return transactions.filter(t => {
      if (!t.date) return false;
      const d = parseISO(t.date);
      return d >= start && d <= end;
    });
  }
  if (period === '3month' || period === '6month') {
    const months = period === '3month' ? 3 : 6;
    const end = format(subDays(monthsBackStart(anchor, months), 1), 'yyyy-MM-dd');
    const start = format(monthsBackStart(anchor, months * 2), 'yyyy-MM-dd');
    return transactions.filter(t => t.date && t.date >= start && t.date <= end);
  }
  if (isSpecificYearPeriod(period)) return transactions.filter(t => t.date?.startsWith(String(parseInt(period.slice(5), 10) - 1)));
  if (period === 'year') return transactions.filter(t => t.date?.startsWith(String(anchorYear - 1)));
  if (period === 'lastyear') return transactions.filter(t => t.date?.startsWith(String(anchorYear - 2)));
  // month: the 30 days before this trailing 30-day window
  const end = startOfDay(subDays(anchor, 30));
  const start = startOfDay(subDays(anchor, 59));
  return transactions.filter(t => {
    if (!t.date) return false;
    const d = parseISO(t.date);
    return d >= start && d <= end;
  });
}

// `anchor` should be the same latest-transaction-date passed to
// filterByPeriod — otherwise the label can say "September 2026" over data
// that's actually August's, which is its own confusing bug even once the
// filter itself is anchored correctly. Defaults to literal today so
// existing callers that never pass it keep their old behavior.
export function getPeriodLabel(period, anchor = new Date()) {
  const anchorYear = anchor.getFullYear();
  if (period === 'all') return 'All Time';
  if (period === 'week') return 'Last 7 Days';
  if (period === '3month') return 'Last 3 Months';
  if (period === '6month') return 'Last 6 Months';
  if (isSpecificYearPeriod(period)) return period.slice(5);
  if (period === 'year') return String(anchorYear);
  if (period === 'lastyear') return String(anchorYear - 1);
  return 'Last 30 Days';
}

export function getPeriodPhrase(period, anchor = new Date()) {
  const anchorYear = anchor.getFullYear();
  if (period === 'all') return 'all time';
  if (period === 'week') return 'this week';
  if (period === '3month') return 'in the last 3 months';
  if (period === '6month') return 'in the last 6 months';
  if (isSpecificYearPeriod(period)) {
    const y = period.slice(5);
    return y === String(anchorYear) ? 'this year' : `in ${y}`;
  }
  if (period === 'year') return 'this year';
  if (period === 'lastyear') return 'last year';
  return 'in the last 30 days';
}

export function sumByType(transactions) {
  const income = transactions.filter(t => t.type === 'income').reduce((s, t) => s + (t.amount || 0), 0);
  const expenses = transactions.filter(t => t.type === 'expense').reduce((s, t) => s + (t.amount || 0), 0);
  return { income, expenses, net: income - expenses };
}
