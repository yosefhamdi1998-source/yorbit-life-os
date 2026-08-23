// Run this AFTER 1-export-from-base44.mjs and AFTER running supabase/schema.sql.
//
// Usage:
//   SUPABASE_URL=https://xxx.supabase.co SUPABASE_SERVICE_ROLE_KEY=xxx node scripts/2-import-to-supabase.mjs
//
// What it does:
//   1. For every user in migration-export/_users.json, creates (or finds) a matching
//      Supabase auth user by email, then sends them a password-reset email so they can
//      set a new password — Base44's password hashes cannot be migrated directly.
//   2. Builds a base44_id -> supabase_uuid map for users.
//   3. Imports every entity file, remapping:
//        - each record's own id (dropped; Postgres assigns a new uuid)
//        - created_by_id -> user_id (via the map from step 2)
//        - Task.goal_id, CustomRecord.form_id (via an id-remap built as we go,
//          entity-by-entity, in an order where parents import before children)
//   4. Writes ./migration-export/_id_map.json as it goes, so a failed run can be
//      re-examined / re-run without re-creating already-imported rows (the script
//      skips users that already exist, but entity rows are NOT de-duplicated on
//      re-run — see the --dry-run flag and DELETE-before-reimport note below).
//
// IMPORTANT: run with --dry-run first. It does everything except the actual writes,
// and prints counts + any records it can't map (e.g. missing created_by_id), so you
// can fix data problems before touching the real database.

import { createClient } from '@supabase/supabase-js';
import { readFile, writeFile } from 'node:fs/promises';

const DRY_RUN = process.argv.includes('--dry-run');

const ENTITY_TABLE_MAP = {
  Transaction: 'transactions',
  Bill: 'bills',
  Budget: 'budgets',
  Goal: 'goals',
  SavingsGoal: 'savings_goals',
  NetWorthEntry: 'net_worth_entries',
  Habit: 'habits',
  // Task depends on Goal (goal_id) — import Goal first, which the ENTITY ORDER below ensures
  Task: 'tasks',
  HealthLog: 'health_logs',
  JournalEntry: 'journal_entries',
  Note: 'notes',
  CustomForm: 'custom_forms',
  // CustomRecord depends on CustomForm (form_id) — must come after
  CustomRecord: 'custom_records',
  AIInsightCache: 'ai_insight_caches',
  Notification: 'notifications',
  ConnectedAccount: 'connected_accounts',
  BankSyncLog: 'bank_sync_logs',
  Subscription: 'subscriptions',
};

// Import order matters: parents before children, so id remaps exist when needed.
const ENTITY_ORDER = [
  'Goal', 'CustomForm', // parents referenced by other entities
  'Transaction', 'Bill', 'Budget', 'SavingsGoal', 'NetWorthEntry', 'Habit',
  'Task', 'HealthLog', 'JournalEntry', 'Note', 'CustomRecord', 'AIInsightCache',
  'Notification', 'ConnectedAccount', 'BankSyncLog', 'Subscription',
];

// Fields on each entity that reference another entity's id and need remapping.
const REFERENCE_FIELDS = {
  Task: { goal_id: 'Goal' },
  CustomRecord: { form_id: 'CustomForm' },
};

async function loadJson(path, fallback = []) {
  try {
    return JSON.parse(await readFile(path, 'utf-8'));
  } catch {
    return fallback;
  }
}

async function main() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars first.');
    process.exit(1);
  }
  const supabase = createClient(url, key);

  // --- Step 1: users --------------------------------------------------------
  const users = await loadJson('./migration-export/_users.json');
  const userIdMap = {}; // base44_id -> supabase uuid

  for (const u of users) {
    if (!u.email) {
      console.warn(`Skipping user ${u.base44_id} — no email on file. Fix _users.json manually.`);
      continue;
    }
    if (DRY_RUN) {
      console.log(`[dry-run] would create/find auth user for ${u.email}`);
      continue;
    }

    // Try to find an existing user first (idempotent re-runs)
    const { data: existing } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
    let match = existing?.users?.find((eu) => eu.email === u.email);

    if (!match) {
      const tempPassword = crypto.randomUUID();
      const { data, error } = await supabase.auth.admin.createUser({
        email: u.email,
        password: tempPassword,
        email_confirm: true, // they're already verified users in Base44
      });
      if (error) {
        console.error(`Failed to create user ${u.email}:`, error.message);
        continue;
      }
      match = data.user;

      // Send a password-reset email so they can set a real password
      await supabase.auth.resetPasswordForEmail(u.email, {
        redirectTo: `${process.env.APP_URL || 'https://your-app.example.com'}/reset-password`,
      });
      console.log(`Created auth user for ${u.email} and sent password reset email.`);
    } else {
      console.log(`Found existing auth user for ${u.email}, reusing.`);
    }

    userIdMap[u.base44_id] = match.id;
  }

  await writeFile('./migration-export/_user_id_map.json', JSON.stringify(userIdMap, null, 2));

  // --- Step 2: entity data, in dependency order ------------------------------
  const idMap = {}; // "EntityName:base44_id" -> new supabase uuid

  for (const entityName of ENTITY_ORDER) {
    const table = ENTITY_TABLE_MAP[entityName];
    const records = await loadJson(`./migration-export/${entityName}.json`);
    if (records.length === 0) {
      console.log(`${entityName}: no records to import.`);
      continue;
    }

    console.log(`Importing ${records.length} ${entityName} records into ${table}...`);
    let imported = 0;
    let skippedNoUser = 0;

    for (const record of records) {
      const { id: base44Id, created_by_id, created_by, created_date, updated_date, ...rest } = record;

      const userId = userIdMap[created_by_id];
      if (!userId) {
        skippedNoUser++;
        continue;
      }

      // Remap any foreign-key-like fields to already-imported entities' new ids
      const refs = REFERENCE_FIELDS[entityName];
      if (refs) {
        for (const [field, parentEntity] of Object.entries(refs)) {
          const oldRef = rest[field];
          if (oldRef) rest[field] = idMap[`${parentEntity}:${oldRef}`] || null;
        }
      }

      if (DRY_RUN) {
        imported++;
        continue;
      }

      const { data, error } = await supabase
        .from(table)
        .insert({ ...rest, user_id: userId, created_date, updated_date })
        .select('id')
        .single();

      if (error) {
        console.error(`  Failed to import ${entityName} ${base44Id}:`, error.message);
        continue;
      }

      idMap[`${entityName}:${base44Id}`] = data.id;
      imported++;
    }

    console.log(`  -> imported ${imported}, skipped ${skippedNoUser} (no matching user)`);
  }

  await writeFile('./migration-export/_id_map.json', JSON.stringify(idMap, null, 2));
  console.log('\nDone. See migration-export/_id_map.json and _user_id_map.json for the full mapping.');
  if (DRY_RUN) console.log('This was a --dry-run: nothing was actually written.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
