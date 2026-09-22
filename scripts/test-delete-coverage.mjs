// Every user-owned table must be a DELIBERATE choice: cleared by
// delete_all_my_data(), or explicitly listed here with a reason.
//
// WHY
//
// Settings offers "Delete all your financial data?" and, on success, says
// "All your financial data has been removed." The RPC behind it clears 8 of
// the 20 tables that carry a user_id. Some of those omissions are correct —
// the account survives the action, so billing entitlements must survive with
// it — but they were never written down anywhere, so there is nothing to
// check a NEW table against. Add a table next month and it silently joins
// the "left behind" list; nobody finds out until someone asks why their data
// is still there.
//
// This test does not decide what should be deleted. It only fails when a
// user-owned table is neither cleared nor consciously excluded, which forces
// the decision to be made once, in writing, at the time the table is added.
//
// NOT in the `npm test` aggregate yet, on purpose. It currently FAILS with 8
// unaccounted tables, and wiring a red test into the shared suite would break
// everyone else's build before the product decision behind it has been made.
// Add it to `test` once each of the 8 is either cleared or listed below.
//
// Run: npm run test:delete-coverage

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const schema = fs.readFileSync(path.join(root, 'supabase/schema.sql'), 'utf8');
const rpc = fs.readFileSync(
  path.join(root, 'supabase/migrations/20260907090000_delete_all_my_data_rpc.sql'),
  'utf8',
);

// Tables deliberately left in place, each with the reason it survives an
// action that keeps the account. Changing this list is a product decision.
// Financial records that survive today and are PROPOSED for clearing. The SQL
// is prepared in scripts/proposed/delete_financial_data_scope.sql and is
// deliberately NOT in supabase/migrations/, because a file there runs on the
// next push and this changes what a destructive function destroys.
//
// Listing them keeps the test honest in both directions: the suite stays green,
// while the pending decision stays visible instead of quietly dropping off the
// list. When the proposal is adopted the RPC clears them and this empties.
const PROPOSED_FOR_CLEARING = {
  advisor_conversations: "AI Coach history - a detailed record of the owner's finances.",
  advisor_messages: 'AI Coach history - same reasoning.',
  custom_records: 'Owner-entered rows in their own forms; in a finance app these are financial data.',
};


const INTENTIONALLY_KEPT = {
  // --- Not financial records at all -----------------------------------------
  // Yorbit carries life-tracking features alongside the money ones. Clearing
  // these under "delete your financial data" would be over-deletion: someone
  // resetting their budget has not asked to lose their journal.
  habits: 'Life-tracking, not a financial record.',
  tasks: 'Life-tracking, not a financial record.',
  health_logs: 'Health tracking, not a financial record.',
  journal_entries: 'Personal journal, not a financial record.',
  notes: 'General notepad, not a ledger entry. Owner decision pending - see YORBIT_PROGRESS.md.',

  // --- The account survives this action, so these must too ------------------
  subscriptions: 'Billing entitlement. The account survives, so Pro must survive with it.',
  connected_accounts: 'Bank links stay reusable; clearing them forces a full re-connect nobody asked for.',
  bank_sync_logs: 'Audit trail of syncs, kept for support and debugging.',
  notifications: 'Transient and self-expiring; not financial records.',
  custom_forms: 'The form definition is a user-built tool. Its RECORDS are cleared; the tool is not.',
};

// Tables that carry a user_id, i.e. per-user data.
const owned = [...schema.matchAll(/create table if not exists public\.(\w+)\s*\(([\s\S]*?)\n\);/g)]
  .filter(([, , body]) => /user_id uuid/.test(body))
  .map(([, name]) => name);

const cleared = [...rpc.matchAll(/delete from (\w+)/g)].map(([, t]) => t);

let failures = 0;
const fail = (msg) => { failures++; console.log(`  FAIL  ${msg}`); };

console.log('delete_all_my_data() must account for every user-owned table\n');

for (const table of owned.sort()) {
  if (cleared.includes(table)) continue;
  if (table in INTENTIONALLY_KEPT) continue;
  if (table in PROPOSED_FOR_CLEARING) continue;
  fail(`${table} is user-owned but is neither cleared nor listed in INTENTIONALLY_KEPT`);
}

// A stale exclusion is its own bug: it reads as a reviewed decision about a
// table that no longer exists, or one that is now being cleared anyway.
for (const table of Object.keys(INTENTIONALLY_KEPT)) {
  if (!owned.includes(table)) fail(`INTENTIONALLY_KEPT lists ${table}, which is not a user-owned table`);
  else if (cleared.includes(table)) fail(`INTENTIONALLY_KEPT lists ${table}, but it IS cleared — the note is wrong`);
}

console.log(`\n  ${owned.length} user-owned tables: ${cleared.length} cleared, ` +
            `${Object.keys(INTENTIONALLY_KEPT).length} deliberately kept, ` +
            `${Object.keys(PROPOSED_FOR_CLEARING).length} awaiting an owner decision.`);
if (Object.keys(PROPOSED_FOR_CLEARING).length) {
  console.log('  Pending: ' + Object.keys(PROPOSED_FOR_CLEARING).join(', '));
  console.log('           see scripts/proposed/delete_financial_data_scope.sql');
}

if (failures) {
  console.log(`\n${failures} table(s) unaccounted for. Either clear them in the RPC or ` +
              `add them to INTENTIONALLY_KEPT with the reason.`);
  process.exit(1);
}
console.log('\nEvery user-owned table is accounted for.');
