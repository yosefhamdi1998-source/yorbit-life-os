// Bank transaction descriptions are written for bank systems, not people:
//
//   PURCHASE 0710 APPLE.COM/BILL 866-712-7753 CA
//   BKOFAMERICA ATM 06/06 #XXXXX4627 DEPOSIT NEW GERMANTOWN
//   KEEPTHECHANGE CREDIT FROM ACCT8457 EFFECTIVE 08/31
//
// Showing those raw in a list makes an otherwise finished app look like a
// database dump. This turns them into something a person reads at a
// glance, WITHOUT touching the stored title — matching, dedup and
// subscription detection all still run against the original text.

// Well-known descriptors that deserve a real name rather than a cleanup.
const KNOWN = [
  [/keepthechange|keep the change/i, 'Keep the Change'],
  [/bkofamerica.*atm.*deposit|atm.*deposit/i, 'ATM Deposit'],
  [/bkofamerica.*atm.*withdrawal|atm.*withdrawal/i, 'ATM Withdrawal'],
  [/online banking transfer to/i, 'Transfer Out'],
  [/online banking transfer from/i, 'Transfer In'],
  [/monthly maintenance fee/i, 'Monthly Maintenance Fee'],
  [/overdraft/i, 'Overdraft Fee'],
  [/interest earned/i, 'Interest Earned'],
  [/apple\.com\/bill|apple\s*cash|apple\.com/i, 'Apple'],
  [/venmo/i, 'Venmo'],
  [/zelle/i, 'Zelle'],
  [/cash ?app/i, 'Cash App'],
  [/paypal/i, 'PayPal'],
  [/coinbase|coin\*/i, 'Coinbase'],
  [/amazon|amzn/i, 'Amazon'],
  [/wal-?mart/i, 'Walmart'],
  [/starbucks/i, 'Starbucks'],
  [/uber\s*eats/i, 'Uber Eats'],
  [/\buber\b/i, 'Uber'],
  [/\blyft\b/i, 'Lyft'],
  [/netflix/i, 'Netflix'],
  [/spotify/i, 'Spotify'],
];

// Leading words banks put in front of the actual merchant.
const LEADING_NOISE = /^(purchase|pmnt sent|pmnt rcvd|payment sent|payment received|recurring|checkcard|check card|debit card|credit card|pos|ach|des:|withdrawal|deposit|transfer|preauthorized|pending)\s+/i;

export function prettyMerchant(rawTitle) {
  const raw = (rawTitle || '').trim();
  if (!raw) return 'Transaction';

  for (const [pattern, name] of KNOWN) {
    if (pattern.test(raw)) return name;
  }

  let s = raw;
  // Masked account/card numbers, reference numbers, long digit runs
  s = s.replace(/#?X{2,}\d+/gi, ' ');
  // Store numbers welded to the name, e.g. "BP#8812345" -> "BP"
  s = s.replace(/#\s*\d+/g, ' ');
  s = s.replace(/\b\d{6,}\b/g, ' ');
  // Phone numbers
  s = s.replace(/\b\d{3}[-.\s]\d{3}[-.\s]\d{4}\b/g, ' ');
  // Dates in any common shape
  s = s.replace(/\b\d{1,2}[\/-]\d{1,2}([\/-]\d{2,4})?\b/g, ' ');
  // "EFFECTIVE 08/31", "CONF# 12345"
  s = s.replace(/\b(effective|conf|confirmation|ref|id|trace)\b#?\s*\S*/gi, ' ');

  // Strip leading bank verbs, possibly stacked ("PURCHASE 0710 ...")
  for (let i = 0; i < 3; i++) s = s.replace(LEADING_NOISE, '');
  // A stray 3–4 digit code left at the front after removing the verb
  s = s.replace(/^\s*\d{3,4}\s+/, '');

  // Trailing US state code
  s = s.replace(/\s+[A-Z]{2}\s*$/, '');
  s = s.replace(/[\s*#\-–,]+$/g, '');
  s = s.replace(/\s{2,}/g, ' ').trim();

  if (s.length < 3) return raw;

  // SCREAMING BANK TEXT -> Title Case, but leave names that already have
  // sensible mixed case alone.
  const letters = s.replace(/[^A-Za-z]/g, '');
  const mostlyCaps = letters.length > 0 && (letters.replace(/[^A-Z]/g, '').length / letters.length) > 0.7;
  if (mostlyCaps) {
    s = s.toLowerCase().replace(/\b[a-z]/g, c => c.toUpperCase());
  }

  return s;
}
