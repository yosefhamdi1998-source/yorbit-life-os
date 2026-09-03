import { parseISO, addMonths } from 'date-fns';

// Bank statement boilerplate that says nothing about WHO was paid. The
// same Apple subscription arrives as "Apple" from a bank sync and as
// "PURCHASE 0710 APPLE.COM/BILL 866-712-7753 CA" from a PDF statement —
// stripping this noise makes both reduce to "apple" so they're recognised
// as one subscription instead of two.
const NOISE_WORDS = new Set([
  'purchase', 'pmnt', 'payment', 'sent', 'recurring', 'debit', 'credit', 'card',
  'checkcard', 'pos', 'ach', 'des', 'indn', 'ref', 'conf', 'confirmation', 'id',
  'transaction', 'online', 'banking', 'com', 'inc', 'llc', 'ltd', 'co', 'the',
  'of', 'and', 'to', 'from', 'on', 'at', 'for', 'www', 'http', 'https',
]);
const US_STATES = new Set([
  'al','ak','az','ar','ca','co','ct','de','fl','ga','hi','id','il','in','ia','ks',
  'ky','la','me','md','ma','mi','mn','ms','mo','mt','ne','nv','nh','nj','nm','ny',
  'nc','nd','oh','ok','or','pa','ri','sc','sd','tn','tx','ut','vt','va','wa','wv','wi','wy',
]);

function normalizeTitle(title) {
  const words = (title || '')
    .toLowerCase()
    .replace(/[0-9]/g, ' ')
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .filter(w => w.length > 1 && !NOISE_WORDS.has(w) && !US_STATES.has(w));
  return words.join(' ').trim();
}

// For display, prefer the cleanest title a merchant appears under — the
// short human one ("Apple") over the raw bank string.
function bestDisplayName(rows) {
  return rows
    .map(r => r.title || '')
    .filter(Boolean)
    .sort((a, b) => a.length - b.length)[0] || 'Subscription';
}

// Merchants whose repeat charges are never a subscription — money moving
// to your own accounts, P2P sends, and crypto purchases all repeat at
// similar amounts without being a bill anyone needs reminding about.
const NOT_SUBSCRIPTIONS = [
  /coinbase/i, /venmo/i, /zelle/i, /cash ?app/i, /paypal/i, /litecoin/i, /bitcoin/i,
  /transfer/i, /keep the change/i, /atm/i, /withdrawal/i, /deposit/i, /pmnt sent/i,
];

function median(nums) {
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function monthKey(dateStr) {
  return (dateStr || '').slice(0, 7); // YYYY-MM
}

// Real statement data doesn't look like a textbook: a subscription shows up
// as the same merchant charging the same amount once a month, but the exact
// day drifts, a month occasionally gets two charges, and the day-to-day gap
// between rows is meaningless because unrelated purchases from the same
// merchant land in between. So rather than measuring gaps between
// consecutive rows, this asks the question that actually identifies a
// subscription: does this merchant charge this amount in several separate
// months?
export function detectRecurring(transactions, existingBillNames = []) {
  const expenses = (transactions || []).filter(t => t.type === 'expense' && t.date && t.title);
  const existing = existingBillNames.map(normalizeTitle).filter(Boolean);

  // merchant -> amount bucket -> set of months
  const merchants = new Map();
  for (const t of expenses) {
    const key = normalizeTitle(t.title);
    if (!key || key.length < 3) continue;
    if (NOT_SUBSCRIPTIONS.some(re => re.test(key))) continue;
    if (existing.some(n => n === key || key.includes(n) || n.includes(key))) continue;

    if (!merchants.has(key)) merchants.set(key, new Map());
    const buckets = merchants.get(key);

    // Bucket by amount so a merchant you also make one-off purchases from
    // (Apple: a $10.29 subscription plus random app purchases) still has
    // its subscription found instead of being averaged into noise.
    // Cents-exact, then near-matches merged below.
    const bucketKey = (t.amount || 0).toFixed(2);
    if (!buckets.has(bucketKey)) buckets.set(bucketKey, []);
    buckets.get(bucketKey).push(t);
  }

  const results = [];
  for (const [key, buckets] of merchants) {
    // Merge amount buckets within 5% of each other — a subscription whose
    // price nudges (tax changes, a small increase) is still one thing.
    const merged = [];
    for (const [amtStr, rows] of [...buckets.entries()].sort((a, b) => Number(b[0]) - Number(a[0]))) {
      const amt = Number(amtStr);
      const target = merged.find(m => Math.abs(m.amount - amt) / Math.max(m.amount, amt) <= 0.05);
      if (target) { target.rows.push(...rows); target.amount = median(target.rows.map(r => r.amount)); }
      else merged.push({ amount: amt, rows: [...rows] });
    }

    for (const group of merged) {
      const months = [...new Set(group.rows.map(r => monthKey(r.date)))].sort();
      // Three separate months of the same charge is a strong signal and
      // holds up on only a few months of history; two is too easy to hit
      // by coincidence.
      if (months.length < 3) continue;

      // Months should be roughly consecutive — three charges spread over
      // two years isn't a live subscription.
      const first = parseISO(months[0] + '-01');
      const last = parseISO(months[months.length - 1] + '-01');
      const spanMonths = (last.getFullYear() - first.getFullYear()) * 12 + (last.getMonth() - first.getMonth()) + 1;
      if (months.length / spanMonths < 0.6) continue;

      const sorted = [...group.rows].sort((a, b) => a.date.localeCompare(b.date));
      const last3 = sorted[sorted.length - 1];
      const amount = Math.round(median(group.rows.map(r => r.amount)) * 100) / 100;
      if (amount <= 0) continue;

      results.push({
        key: `${key}-${amount}`,
        name: bestDisplayName(group.rows),
        amount,
        category: last3.category || 'other',
        interval: 'monthly',
        intervalLabel: 'Monthly',
        occurrences: months.length,
        lastDate: last3.date,
        nextDate: addMonths(parseISO(last3.date), 1).toISOString().slice(0, 10),
        monthlyEquivalent: amount,
      });
    }
  }

  return results.sort((a, b) => b.monthlyEquivalent - a.monthlyEquivalent);
}
