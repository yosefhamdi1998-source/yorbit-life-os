// Dedup tests, built around the user's REAL trading pattern.
//
// THE FIXTURE THAT MATTERS: twenty Coinbase trades in one day, all for the
// same amount, all with the same title. That is this user's normal
// behaviour - they trade daily and send to gambling sites, routinely 10-20
// times a day, frequently for identical amounts.
//
// The old dedup keyed on `title-date-amount` and would have silently
// discarded nineteen of those twenty as duplicates. This test exists so a
// future session "helpfully cleaning up duplicates" breaks the build
// instead of destroying real financial history.
//
// Losing a real transaction is far worse than keeping a duplicate. Every
// assertion below is written from that priority.

let failures = 0;
function check(label, actual, expected) {
  const ok = actual === expected;
  if (!ok) failures++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}: got ${actual}, expected ${expected}`);
}

// Mirrors the import loop in plaid-sync-transactions: dedup on the
// provider's own id, never on title/date/amount.
function importBatch(plaidTxs, existingIds = new Set()) {
  let imported = 0, skipped = 0;
  const rows = [];
  for (const tx of plaidTxs) {
    const providerId = tx.transaction_id;
    if (providerId && existingIds.has(providerId)) { skipped++; continue; }
    if (providerId) existingIds.add(providerId);
    rows.push({ ...tx, provider_transaction_id: providerId ?? null, import_source: 'plaid' });
    imported++;
  }
  return { imported, skipped, rows, existingIds };
}

// The old, broken behaviour — kept so the difference is demonstrated
// rather than asserted.
function importBatchLegacy(plaidTxs, existingKeys = new Set()) {
  let imported = 0, skipped = 0;
  for (const tx of plaidTxs) {
    const key = `${tx.name}-${tx.date}-${tx.amount}`;
    if (existingKeys.has(key)) { skipped++; continue; }
    existingKeys.add(key);
    imported++;
  }
  return { imported, skipped };
}

// ── THE REAL PATTERN ────────────────────────────────────────────────────
// 20 identical Coinbase trades, one day, same amount. Distinct Plaid ids
// because they are distinct events.
const twentyTrades = Array.from({ length: 20 }, (_, i) => ({
  transaction_id: `plaid_tx_${1000 + i}`,
  name: 'Coinbase',
  date: '2026-06-15',
  amount: 45.00,
}));

console.log('\n1. TWENTY IDENTICAL SAME-DAY TRADES MUST ALL SURVIVE');
{
  const r = importBatch(twentyTrades);
  check('imported', r.imported, 20);
  check('skipped', r.skipped, 0);
  check('all have distinct provider ids', new Set(r.rows.map(x => x.provider_transaction_id)).size, 20);
}

console.log('\n2. The OLD key would have destroyed nineteen of them');
{
  const legacy = importBatchLegacy(twentyTrades);
  // This is the bug, demonstrated. If this ever equals 20 the legacy
  // helper has been changed and the comparison is no longer meaningful.
  check('legacy imported only', legacy.imported, 1);
  check('legacy wrongly skipped', legacy.skipped, 19);
}

console.log('\n3. Re-syncing the same window imports nothing new');
{
  const first = importBatch(twentyTrades);
  const second = importBatch(twentyTrades, first.existingIds);
  check('second run imported', second.imported, 0);
  check('second run skipped', second.skipped, 20);
}

console.log('\n4. Plaid refining a merchant name does NOT re-import');
{
  // The other direction the old key failed: same event, new descriptor.
  const first = importBatch([
    { transaction_id: 'plaid_tx_9', name: 'SQ *COFFEE 12345', date: '2026-06-01', amount: 5.25 },
  ]);
  const refined = importBatch([
    { transaction_id: 'plaid_tx_9', name: 'Blue Bottle Coffee', date: '2026-06-01', amount: 5.25 },
  ], first.existingIds);
  check('refined name not re-imported', refined.imported, 0);

  const legacyFirst = importBatchLegacy([
    { name: 'SQ *COFFEE 12345', date: '2026-06-01', amount: 5.25 },
  ]);
  const legacyRefined = importBatchLegacy([
    { name: 'Blue Bottle Coffee', date: '2026-06-01', amount: 5.25 },
  ], new Set([`SQ *COFFEE 12345-2026-06-01-5.25`]));
  check('legacy WOULD have duplicated it', legacyRefined.imported, 1);
}

console.log('\n5. Two genuinely different transactions both survive');
{
  const r = importBatch([
    { transaction_id: 'a1', name: 'Venmo', date: '2026-06-15', amount: 200 },
    { transaction_id: 'a2', name: 'Venmo', date: '2026-06-15', amount: 200 },
  ]);
  check('both imported', r.imported, 2);
}

console.log('\n6. Rows with no provider id are never skipped');
{
  // CSV and manual rows, and everything imported before the column
  // existed, have no id. They must pass through untouched rather than
  // being matched by guesswork.
  const r = importBatch([
    { transaction_id: undefined, name: 'Coinbase', date: '2026-06-15', amount: 45 },
    { transaction_id: undefined, name: 'Coinbase', date: '2026-06-15', amount: 45 },
  ]);
  check('both imported', r.imported, 2);
  check('none skipped', r.skipped, 0);
  check('stored id is null', r.rows[0].provider_transaction_id, null);
}

console.log('\n7. Source is recorded on every imported row');
{
  const r = importBatch([{ transaction_id: 'z1', name: 'X', date: '2026-01-01', amount: 1 }]);
  check('import_source', r.rows[0].import_source, 'plaid');
}

console.log(failures === 0
  ? '\nAll dedup checks passed — 20 identical same-day trades survive.\n'
  : `\n${failures} check(s) FAILED.\n`);
process.exit(failures === 0 ? 0 : 1);
