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
const INTENTIONALLY_KEPT = {
  subscriptions: 'Billing entitlement. The account survives this action, so Pro must survive with it.',
  connected_accounts: 'Bank links are re-usable after a data wipe; removing them would force a full re-connect.',
  bank_sync_logs: 'Audit trail of syncs, kept for support and debugging.',
  notifications: 'Transient and self-expiring; not financial records.',
  custom_forms: 'The form definition is a user-built tool, not data captured by it.',
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
  fail(`${table} is user-owned but is neither cleared nor listed in INTENTIONALLY_KEPT`);
}

// A stale exclusion is its own bug: it reads as a reviewed decision about a
// table that no longer exists, or one that is now being cleared anyway.
for (const table of Object.keys(INTENTIONALLY_KEPT)) {
  if (!owned.includes(table)) fail(`INTENTIONALLY_KEPT lists ${table}, which is not a user-owned table`);
  else if (cleared.includes(table)) fail(`INTENTIONALLY_KEPT lists ${table}, but it IS cleared — the note is wrong`);
}

console.log(`\n  ${owned.length} user-owned tables: ${cleared.length} cleared, ` +
            `${Object.keys(INTENTIONALLY_KEPT).length} deliberately kept.`);

if (failures) {
  console.log(`\n${failures} table(s) unaccounted for. Either clear them in the RPC or ` +
              `add them to INTENTIONALLY_KEPT with the reason.`);
  process.exit(1);
}
console.log('\nEvery user-owned table is accounted for.');
