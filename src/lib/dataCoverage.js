// How much of a period Yorbit actually has data for.
//
// WHY THIS EXISTS
//
// The app summed whatever rows fell inside the selected window and printed
// the result as the period's total. For 2025 that meant adding up 29
// transactions - the entire non-crypto history for that year - and rendering
// "$215 spent" in the same typeface, at the same size, with the same
// confidence as a real figure.
//
// It was not a calculation error. Every one of those 29 rows is correct. The
// error is presenting a total over a window the data does not cover, which is
// the same failure as the 400-row crypto fallback that reported "$9,000
// bought" for an account that had moved $1.33M: a number derived from a
// fraction of the data, indistinguishable from a complete one.
//
// Measured coverage on this account when written:
//   Plaid (Bank of America)   659 rows   2026-06-04 -> 2026-09-01
//   Venmo CSV                 394 rows   2026-06-05 -> 2026-09-04
//   earlier import            424 rows   2025-12-17 -> 2026-08-31
//   2025 non-crypto rows:     29, for the whole year
//
// Crypto rows are deliberately ignored here. There are 17,274 of them going
// back to 2018, and counting them would report "full coverage since 2018"
// for spending and income figures that no crypto row contributes to.

import { parseISO, differenceInCalendarDays } from 'date-fns';

// Below this, a period total is more misleading than useful.
const THIN_DAYS = 21;
// A month with fewer than this many rows is almost certainly partial rather
// than a genuinely quiet month.
const SPARSE_ROWS_PER_MONTH = 5;

function isSpendableRow(t) {
  // A crypto trade is not bank activity. crypto_quantity is the structured
  // marker; it is null on every fiat row.
  return t && t.crypto_quantity == null;
}

/**
 * @param {Array} transactions rows in scope (already user-filtered)
 * @param {Date|string} periodStart
 * @param {Date|string} periodEnd
 * @returns {{covered:boolean, firstDataDate:string|null, rows:number,
 *            coveredDays:number, periodDays:number, reason:string|null}}
 */
export function assessCoverage(transactions = [], periodStart, periodEnd) {
  const start = typeof periodStart === 'string' ? parseISO(periodStart) : periodStart;
  const end = typeof periodEnd === 'string' ? parseISO(periodEnd) : periodEnd;

  const rows = (transactions || []).filter(isSpendableRow);
  const dates = rows.map(t => t.date).filter(Boolean).sort();
  const firstDataDate = dates[0] || null;

  const periodDays = Math.max(1, differenceInCalendarDays(end, start) + 1);

  if (!firstDataDate) {
    return {
      covered: false, firstDataDate: null, rows: 0,
      coveredDays: 0, periodDays,
      reason: 'none',
    };
  }

  // Where does real data actually begin inside this window?
  const firstInPeriod = parseISO(firstDataDate) > start ? parseISO(firstDataDate) : start;
  const coveredDays = Math.max(0, differenceInCalendarDays(end, firstInPeriod) + 1);

  // Two independent ways a period can be untrustworthy, because they catch
  // different failures: a window that data only reaches the tail of, and a
  // window nominally covered but with far too few rows in it.
  const monthsInPeriod = Math.max(1, periodDays / 30.44);
  const rowsPerMonth = rows.length / monthsInPeriod;

  if (coveredDays < THIN_DAYS && periodDays > THIN_DAYS) {
    return { covered: false, firstDataDate, rows: rows.length, coveredDays, periodDays, reason: 'partial' };
  }
  if (rowsPerMonth < SPARSE_ROWS_PER_MONTH) {
    return { covered: false, firstDataDate, rows: rows.length, coveredDays, periodDays, reason: 'sparse' };
  }
  // Data starts meaningfully after the window opens: covered, but say so.
  if (coveredDays < periodDays * 0.75) {
    return { covered: true, firstDataDate, rows: rows.length, coveredDays, periodDays, reason: 'late-start' };
  }

  return { covered: true, firstDataDate, rows: rows.length, coveredDays, periodDays, reason: null };
}

// Plain sentence for the UI. Says what is missing and what to do, never just
// "incomplete data" - a warning nobody can act on is only slightly better
// than a wrong number.
export function coverageMessage(c, periodLabel = 'this period') {
  if (!c || c.reason === null) return null;
  // getPeriodPhrase already returns a prepositional phrase - "in 2025",
  // "this month" - so prefixing "for" produced "for in 2025". Use the label
  // as-is where it already reads as one, and only add "for" when it does not.
  const phrase = /^(in|this|last|over|during)\b/i.test(periodLabel)
    ? periodLabel
    : `for ${periodLabel}`;
  if (c.reason === 'none') {
    return `Yorbit has no bank or card transactions ${phrase}, so these totals are empty rather than low.`;
  }
  if (c.reason === 'partial') {
    return `Yorbit only has ${c.rows} transaction${c.rows === 1 ? '' : 's'} ${phrase}. These totals cover a few days, not the whole period.`;
  }
  if (c.reason === 'sparse') {
    return `Only ${c.rows} transaction${c.rows === 1 ? '' : 's'} on record ${phrase}. That is far too few to be a full picture, so treat these totals as partial.`;
  }
  if (c.reason === 'late-start') {
    return `Your transaction history starts ${c.firstDataDate}. Anything before that is missing, so this total is counted only from then on.`;
  }
  return null;
}
