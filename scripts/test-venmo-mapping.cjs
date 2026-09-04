// Tests the Venmo CSV mapping against Venmo's real export header shape.
// Mirrors the logic in CSVImport.jsx so it can be exercised without a browser.

const headers = [
  'ID', 'Datetime', 'Type', 'Status', 'Note', 'From', 'To',
  'Amount (total)', 'Amount (tip)', 'Amount (fee)', 'Funding Source',
  'Destination', 'Beginning Balance', 'Ending Balance',
  'Statement Period Venmo Fees', 'Terminal Location', 'Year to Date Venmo Fees', 'Disclaimer',
];

// Account owner is Yosef. Row 1 he pays Al, row 2 Sandra pays him,
// row 3 he pays Mike with no note.
const rows = [
  { Datetime: '2026-08-31T10:02:00', Type: 'Payment', Note: '🍕', From: 'Yosef Hamdi', To: 'Al Hamdi', 'Amount (total)': '- $36.85' },
  { Datetime: '2026-08-28T18:40:00', Type: 'Payment', Note: 'thanks', From: 'Sandra Hamdi', To: 'Yosef Hamdi', 'Amount (total)': '+ $50.00' },
  { Datetime: '2026-08-20T09:15:00', Type: 'Payment', Note: '', From: 'Yosef Hamdi', To: 'Mike R', 'Amount (total)': '- $15.00' },
];

const guess = (keywords) => headers.find(hh => keywords.some(k => hh.toLowerCase().includes(k))) || '';
const guessExact = (names) => headers.find(hh => names.includes(hh.trim().toLowerCase())) || '';

function detectP2PFormat(hdrs) {
  const h = hdrs.map(x => x.trim().toLowerCase());
  const has = (n) => h.includes(n);
  if (has('from') && has('to') && (has('note') || has('type'))) return 'venmo';
  if (h.some(x => x.includes('sender')) || h.some(x => x.includes('receiver'))) return 'cashapp';
  return null;
}

function resolveP2PTitle(row, mapping, amountRaw) {
  const outgoing = String(amountRaw ?? '').trim().startsWith('-');
  const to = (row[mapping.p2pTo] || '').trim();
  const from = (row[mapping.p2pFrom] || '').trim();
  const primary = outgoing ? (to || from) : (from || to);
  const note = (row[mapping.p2pNote] || '').trim();
  if (primary && note) return primary + ' — ' + note;
  return primary || note || '';
}

const p2pFormat = detectP2PFormat(headers);
const mapping = {
  date: guess(['date', 'time', 'posted']),
  description:
    guessExact(['payee', 'merchant', 'merchant name', 'description', 'counterparty', 'name'])
    || guess(['desc', 'merchant', 'payee', 'narration'])
    || guess(['memo', 'note']),
  amount: guess(['amount', 'debit', 'credit', 'value']),
};
if (p2pFormat) {
  mapping.p2pTo = guessExact(['to', 'destination']);
  mapping.p2pFrom = guessExact(['from', 'source']);
  mapping.p2pNote = guess(['note', 'memo']);
  mapping.description = mapping.p2pTo || mapping.p2pFrom || mapping.description;
}

console.log('detected format :', p2pFormat);
console.log('date column     :', mapping.date);
console.log('amount column   :', mapping.amount);
console.log('desc column     :', mapping.description, '(picked "Note" before the fix)');
console.log('');

const expected = ['Al Hamdi — 🍕', 'Sandra Hamdi — thanks', 'Mike R'];
let pass = true;
rows.forEach((r, i) => {
  const title = resolveP2PTitle(r, mapping, r['Amount (total)']);
  const ok = title === expected[i];
  if (!ok) pass = false;
  console.log('  ' + r['Amount (total)'].padEnd(10) + ' -> "' + title + '"');
  console.log('       expected: "' + expected[i] + '"  ' + (ok ? 'OK' : '<-- WRONG'));
});
console.log('');
console.log(pass ? 'PASS - every row titled with the correct counterparty, p2p flagged from format.'
                 : 'FAIL - a row resolved to the wrong person.');
process.exit(pass ? 0 : 1);
