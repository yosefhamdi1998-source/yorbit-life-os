import { statementRowKey } from './csv.js';

// Decides which rows of a statement import are new.
//
// COUNT-BASED, not existence-based. This is load-bearing and easy to "simplify"
// into a bug, so the reasoning lives here:
//
// Skipping any row whose date|title|amount already exists protects against
// overlapping statement files, which is a real case — but it silently destroys
// legitimate repeats. This ledger contains Coinbase trades and transfers made
// ten to twenty times a day, frequently for identical amounts. Under
// existence-based dedup a file holding twenty identical same-day rows imported
// exactly ONE of them, and nothing reported the other nineteen as missing.
//
// Comparing COUNTS keeps both properties: re-importing the same file adds
// nothing, because the database already holds as many of that key as the file
// has, while a file genuinely containing twenty identical trades imports all
// twenty the first time.
//
// `collected` accumulates across every file in one import session, so two files
// that overlap are reconciled here too: the shared rows are counted once
// against the database, and only the surplus is imported.
//
// Extracted from CSVImport so it can be tested directly. It is pure: same
// inputs, same answer, no clock and no network.

/**
 * @param {Array} existingRows  rows already stored. MUST be the complete set
 *   for the keys being imported — see assertCompleteSnapshot below for why a
 *   truncated list silently produces duplicates rather than an error.
 * @param {Array} collectedRows normalized rows from the statement file(s)
 * @returns {{toImport: Array, skipped: number}}
 */
export function planImport(existingRows, collectedRows) {
  const existingCounts = new Map();
  for (const t of existingRows) {
    const k = statementRowKey(t);
    existingCounts.set(k, (existingCounts.get(k) || 0) + 1);
  }

  // How many of each key genuinely happened, per the files themselves.
  //
  // Across files this is the MAX, not the sum. Statement exports overlap all
  // the time — a Jan-Feb file and a Feb-Mar file both contain February — and
  // the shared rows are the SAME transactions seen twice, not twice as many
  // transactions. Summing imported every overlapping row a second time: two
  // files each listing one Gym charge produced two Gym charges.
  //
  // Within a single file the count stands as written, because that is the case
  // max must not break: a file holding twenty identical same-day trades is
  // reporting twenty real trades.
  const wantedPerKey = new Map();
  const perFile = new Map();
  for (const r of collectedRows) {
    const file = r.__sourceFile ?? '';
    if (!perFile.has(file)) perFile.set(file, new Map());
    const counts = perFile.get(file);
    const key = statementRowKey(r);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  for (const counts of perFile.values()) {
    for (const [key, n] of counts) {
      wantedPerKey.set(key, Math.max(wantedPerKey.get(key) || 0, n));
    }
  }

  const takenSoFar = new Map();
  const toImport = [];
  let skipped = 0;

  for (const r of collectedRows) {
    const key = statementRowKey(r);
    const already = existingCounts.get(key) || 0;
    const wanted = wantedPerKey.get(key) || 0;
    const taken = takenSoFar.get(key) || 0;
    // Import only while the ledger holds fewer of this key than actually
    // happened, and only up to that number — the surplus occurrences of an
    // overlapping row are the same transaction reported again.
    if (taken < already || taken >= wanted) {
      takenSoFar.set(key, taken + 1);
      skipped++;
      continue;
    }
    takenSoFar.set(key, taken + 1);
    toImport.push(r);
  }

  return { toImport, skipped };
}

/**
 * Was the snapshot handed to planImport actually complete?
 *
 * The dedup check used to read the ledger with a hard cap of 50,000 rows,
 * newest first. Past that the OLDEST rows fall out of the snapshot, so
 * re-importing an old statement finds no match and writes the whole file again
 * — silently, because a short read is indistinguishable from a small ledger.
 * This account was at 34,257 rows when that was found: not broken, but 68% of
 * the way there, and one Coinbase-sized import from crossing it.
 *
 * The fetch is now unbounded, so this exists to make a regression loud rather
 * than silent if a cap is ever reintroduced.
 *
 * @returns {string|null} an operator-facing reason, or null when trustworthy
 */
export function snapshotTruncationReason(existingRows, requestedLimit) {
  if (!requestedLimit) return null;
  if (existingRows.length >= requestedLimit) {
    return `Read ${existingRows.length} existing transactions against a limit of ${requestedLimit}, so older rows may be missing and duplicates could be written.`;
  }
  return null;
}
