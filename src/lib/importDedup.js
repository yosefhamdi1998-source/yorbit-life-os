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

  // ACROSS FILES, DO NOT GUESS.
  //
  // An earlier version took the MAX per key across files, reasoning that a
  // Jan-Feb export and a Feb-Mar export share February and those rows are the
  // same transactions seen twice. That is true for re-exports of ONE account —
  // and wrong for two different accounts, which routinely produce identical
  // rows: the same Netflix charge on the same day for the same amount on a
  // Chase card and an Amex card is two real charges, not one. Nothing in a CSV
  // identifies the account, so the two cases are indistinguishable here.
  //
  // Between a visible duplicate and a silent omission, a ledger must choose the
  // duplicate. An extra row inflates spending where the owner can see it and
  // delete it; a dropped row understates spending and may never be noticed. So
  // every occurrence the files report is honoured, and the ambiguity is
  // surfaced to the person importing instead — see crossFileRepeats, which the
  // review step shows before anything is written.

  const takenSoFar = new Map();
  const toImport = [];
  let skipped = 0;

  for (const r of collectedRows) {
    const key = statementRowKey(r);
    const already = existingCounts.get(key) || 0;
    const taken = takenSoFar.get(key) || 0;
    // Import this occurrence only if the files hold more of this key than the
    // database already does.
    if (taken < already) {
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

/**
 * Keys that appear in more than one of the uploaded files.
 *
 * planImport deliberately imports every occurrence, because it cannot tell a
 * re-export of one account from two different accounts that happen to match.
 * This lets the review step say so plainly before anything is written, turning
 * a silent guess into the owner's decision.
 *
 * @returns {Array<{key: string, files: string[], occurrences: number}>}
 */
export function crossFileRepeats(collectedRows) {
  const seen = new Map();
  for (const r of collectedRows) {
    const key = statementRowKey(r);
    const file = r.__sourceFile ?? '';
    if (!seen.has(key)) seen.set(key, { files: new Set(), occurrences: 0 });
    const entry = seen.get(key);
    entry.files.add(file);
    entry.occurrences += 1;
  }
  return [...seen.entries()]
    .filter(([, v]) => v.files.size > 1)
    .map(([key, v]) => ({ key, files: [...v.files], occurrences: v.occurrences }));
}
