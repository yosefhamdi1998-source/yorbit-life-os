import { handleOptions, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { getUser, serviceClient } from '../_shared/supabase.ts';

// CHANGED FROM BASE44: the original function deleted a hardcoded list of ~33 Bill
// IDs and ~13 Budget IDs — Base44's Mongo-style ObjectIds from one specific past
// incident. Those IDs cannot exist in the new Postgres tables (fresh UUIDs), so
// porting them verbatim would be a no-op. This version replaces that with generic
// duplicate-detection: it finds bills that share the same user_id + name + due_date
// + amount, and budgets that share the same user_id + category + month, and deletes
// all but the oldest row in each group. Run it once after migration, then discard —
// same one-time-cleanup role the original had.

Deno.serve(async (req) => {
  const opt = handleOptions(req);
  if (opt) return opt;

  try {
    const user = await getUser(req);
    if (!user) return jsonResponse({ error: 'Unauthorized' }, 401, {}, req);

    const { data: profile } = await serviceClient()
      .from('profiles').select('role').eq('id', user.id).single();
    if (profile?.role !== 'admin') return jsonResponse({ error: 'Forbidden' }, 403, {}, req);

    const admin = serviceClient();
    const errors: unknown[] = [];
    let bills_deleted = 0;
    let budgets_deleted = 0;

    const { data: bills } = await admin
      .from('bills')
      .select('id, user_id, name, due_date, amount, created_date')
      .order('created_date', { ascending: true });

    const billGroups = new Map<string, string[]>();
    for (const b of bills || []) {
      const key = `${b.user_id}|${b.name}|${b.due_date}|${b.amount}`;
      const ids = billGroups.get(key) || [];
      ids.push(b.id);
      billGroups.set(key, ids);
    }
    for (const ids of billGroups.values()) {
      if (ids.length <= 1) continue;
      const [, ...dupes] = ids; // keep the first (oldest, since sorted ascending)
      for (const id of dupes) {
        const { error } = await admin.from('bills').delete().eq('id', id);
        if (error) errors.push({ entity: 'Bill', id, error: error.message });
        else bills_deleted++;
      }
    }

    const { data: budgets } = await admin
      .from('budgets')
      .select('id, user_id, category, month, created_date')
      .order('created_date', { ascending: true });

    const budgetGroups = new Map<string, string[]>();
    for (const b of budgets || []) {
      const key = `${b.user_id}|${b.category}|${b.month}`;
      const ids = budgetGroups.get(key) || [];
      ids.push(b.id);
      budgetGroups.set(key, ids);
    }
    for (const ids of budgetGroups.values()) {
      if (ids.length <= 1) continue;
      const [, ...dupes] = ids;
      for (const id of dupes) {
        const { error } = await admin.from('budgets').delete().eq('id', id);
        if (error) errors.push({ entity: 'Budget', id, error: error.message });
        else budgets_deleted++;
      }
    }

    return jsonResponse({ bills_deleted, budgets_deleted, errors }, 200, {}, req);
  } catch (error) {
    return errorResponse("Something went wrong on our end. Please try again, and if it keeps happening send us this code.", 500, { internal: error, fn: 'cleanup-duplicate-records', req });
  }
});
