// Run this BEFORE switching src/api/base44Client.js to the Supabase version —
// it needs the real @base44/sdk and your existing Base44 app credentials.
//
// Usage:
//   BASE44_APP_ID=xxx BASE44_ACCESS_TOKEN=xxx node scripts/1-export-from-base44.mjs
//
// BASE44_ACCESS_TOKEN: an admin/service token for your app (Base44 dashboard ->
// Settings -> API, or reuse a logged-in admin user's token from browser localStorage
// key `base44_access_token`).
//
// Output: ./migration-export/<EntityName>.json for each of the 15 entities, plus
// ./migration-export/_users.json (id, email, role) built from the created_by fields
// seen across all records (Base44's REST API doesn't expose a full user list to
// non-admin tokens, so this reconstructs the user set from data ownership instead —
// if you have direct database/admin export access to Base44, prefer that for _users.json).

import { createClient } from '@base44/sdk';
import { writeFile, mkdir } from 'node:fs/promises';

const ENTITIES = [
  'Transaction', 'Bill', 'Budget', 'Goal', 'SavingsGoal', 'NetWorthEntry',
  'Habit', 'Task', 'HealthLog', 'JournalEntry', 'Note', 'CustomForm',
  'CustomRecord', 'AIInsightCache', 'Notification', 'ConnectedAccount',
  'BankSyncLog', 'Subscription',
];

const PAGE_SIZE = 500;

async function exportEntity(base44, name) {
  console.log(`Exporting ${name}...`);
  const all = [];
  let offset = 0;
  // Adjust this loop if your @base44/sdk version's .list() takes (sort, limit, offset)
  // in a different order — check node_modules/@base44/sdk's README/types if this errors.
  while (true) {
    const batch = await base44.entities[name].list('-created_date', PAGE_SIZE, offset);
    if (!batch || batch.length === 0) break;
    all.push(...batch);
    if (batch.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  console.log(`  -> ${all.length} records`);
  return all;
}

async function main() {
  const appId = process.env.BASE44_APP_ID;
  const token = process.env.BASE44_ACCESS_TOKEN;
  if (!appId || !token) {
    console.error('Set BASE44_APP_ID and BASE44_ACCESS_TOKEN env vars first.');
    process.exit(1);
  }

  const base44 = createClient({ appId, token, requiresAuth: false, serverUrl: '' });

  await mkdir('./migration-export', { recursive: true });

  const userIds = new Set();
  const userEmails = new Map(); // id -> email, when present on records

  for (const name of ENTITIES) {
    const records = await exportEntity(base44, name);
    for (const r of records) {
      if (r.created_by_id) userIds.add(r.created_by_id);
      if (r.created_by_id && r.created_by) userEmails.set(r.created_by_id, r.created_by);
    }
    await writeFile(`./migration-export/${name}.json`, JSON.stringify(records, null, 2));
  }

  const users = [...userIds].map((id) => ({
    base44_id: id,
    email: userEmails.get(id) || null,
  }));
  await writeFile('./migration-export/_users.json', JSON.stringify(users, null, 2));

  console.log(`\nDone. Found ${users.length} distinct users across all records.`);
  if (users.some((u) => !u.email)) {
    console.warn(
      'WARNING: some users have no email on file (no record carried created_by). ' +
      'Cross-check ./migration-export/_users.json against your Base44 admin user list ' +
      'before running the import — every row needs an email to map to a Supabase auth user.'
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
