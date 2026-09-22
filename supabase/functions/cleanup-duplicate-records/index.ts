import { handleOptions, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { getUser, serviceClient } from '../_shared/supabase.ts';

// Retired migration-only operation. Identical bill/budget fields do not
// establish a duplicate, and cross-user bulk deletion has no review step.
// Keep the endpoint authenticated, but never read or delete financial rows.
Deno.serve(async (req) => {
  const opt = handleOptions(req);
  if (opt) return opt;

  try {
    const user = await getUser(req);
    if (!user) return jsonResponse({ error: 'Unauthorized' }, 401, {}, req);

    const { data: profile } = await serviceClient()
      .from('profiles').select('role').eq('id', user.id).single();
    if (profile?.role !== 'admin') return jsonResponse({ error: 'Forbidden' }, 403, {}, req);

    return jsonResponse({
      error: 'Automatic bulk cleanup is disabled. Review records in the relevant account before deleting them.',
      code: 'BULK_CLEANUP_DISABLED',
    }, 410, {}, req);
  } catch (error) {
    return errorResponse("Something went wrong on our end. Please try again, and if it keeps happening send us this code.", 500, { internal: error, fn: 'cleanup-duplicate-records', req });
  }
});
