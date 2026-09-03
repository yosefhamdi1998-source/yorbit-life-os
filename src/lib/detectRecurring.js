import { parseISO, differenceInCalendarDays, addDays } from 'date-fns';

function normalizeTitle(title) {
  return (title || '')
    .toLowerCase()
    .replace(/[0-9]/g, '')
    .replace(/[^a-z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const INTERVALS = [
  { key: 'weekly', label: 'Weekly', days: 7, tolerance: 2, minOccurrences: 3 },
  { key: 'biweekly', label: 'Bi-Weekly', days: 14, tolerance: 3, minOccurrences: 3 },
  { key: 'monthly', label: 'Monthly', days: 30, tolerance: 5, minOccurrences: 2 },
  { key: 'quarterly', label: 'Quarterly', days: 91, tolerance: 10, minOccurrences: 2 },
  { key: 'yearly', label: 'Yearly', days: 365, tolerance: 20, minOccurrences: 2 },
];

function median(nums) {
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

// Scans real expense history for a merchant charged repeatedly at a
// consistent amount and a regular interval — a real subscription or bill,
// found from what actually happened instead of requiring someone to type
// it in by hand before the app can track it.
export function detectRecurring(transactions, existingBillNames = []) {
  const expenses = (transactions || []).filter(t => t.type === 'expense' && t.date && t.title);
  const groups = new Map();
  for (const t of expenses) {
    const key = normalizeTitle(t.title);
    if (!key || key.length < 3) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(t);
  }

  const existingNormalized = existingBillNames.map(normalizeTitle).filter(Boolean);

  const results = [];
  for (const [key, txs] of groups) {
    if (txs.length < 2) continue;
    // Skip anything that (loosely) matches a bill already being tracked —
    // this is for surfacing what's NOT tracked yet, not duplicating it.
    if (existingNormalized.some(n => n === key || key.includes(n) || n.includes(key))) continue;

    const sorted = txs.slice().sort((a, b) => a.date.localeCompare(b.date));
    const amounts = sorted.map(t => t.amount || 0);
    const med = median(amounts);
    if (med <= 0) continue;
    // Every occurrence within 15% of the median — a real subscription
    // repeats at the same price; unrelated one-off purchases from the
    // same merchant (two different Amazon orders, say) won't cluster
    // this tightly.
    const consistentAmount = amounts.every(a => Math.abs(a - med) / med <= 0.15);
    if (!consistentAmount) continue;

    const gaps = [];
    for (let i = 1; i < sorted.length; i++) {
      gaps.push(differenceInCalendarDays(parseISO(sorted[i].date), parseISO(sorted[i - 1].date)));
    }

    for (const interval of INTERVALS) {
      if (sorted.length < interval.minOccurrences) continue;
      const matchingGaps = gaps.filter(g => Math.abs(g - interval.days) <= interval.tolerance);
      // Most of the gaps have to land on this interval — one late or
      // skipped payment shouldn't disqualify an otherwise-clear pattern,
      // but a scatter of unrelated gaps should.
      if (matchingGaps.length / gaps.length >= 0.6) {
        const last = sorted[sorted.length - 1];
        const monthlyEquivalent =
          interval.key === 'weekly' ? med * 4.33 :
          interval.key === 'biweekly' ? med * 2.17 :
          interval.key === 'monthly' ? med :
          interval.key === 'quarterly' ? med / 3 :
          med / 12;
        results.push({
          key,
          name: last.title,
          amount: Math.round(med * 100) / 100,
          category: last.category || 'other',
          interval: interval.key,
          intervalLabel: interval.label,
          occurrences: sorted.length,
          lastDate: last.date,
          nextDate: addDays(parseISO(last.date), interval.days).toISOString().slice(0, 10),
          monthlyEquivalent,
        });
        break; // shortest matching interval wins (a monthly charge that
               // also technically satisfies "yearly" tolerance shouldn't
               // get filed as yearly)
      }
    }
  }

  return results.sort((a, b) => b.monthlyEquivalent - a.monthlyEquivalent);
}
