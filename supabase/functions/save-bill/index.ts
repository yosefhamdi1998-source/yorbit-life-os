import { handleOptions, jsonResponse } from '../_shared/cors.ts';
import { getUser, serviceClient } from '../_shared/supabase.ts';
import { enforceRateLimit, identityFromRequest, RULES } from '../_shared/rateLimit.ts';

Deno.serve(async (req) => {
  const opt = handleOptions(req);
  if (opt) return opt;

  try {
    const user = await getUser(req);
    if (!user) return jsonResponse({ error: 'Unauthorized' }, 401);

    const limited = await enforceRateLimit(
      'write', identityFromRequest(req, user.id), RULES.write,
    );
    if (limited) return limited;

    const admin = serviceClient();
    const body = await req.json();
    const { id, name, amount, due_date, category, is_recurring, is_paid, notes } = body;

    if (!name || amount == null || !due_date) {
      return jsonResponse({ error: 'Missing required fields' }, 400);
    }

    const payload: Record<string, unknown> = {
      name,
      amount: Number(amount),
      due_date,
      category: category || 'other',
      is_recurring: is_recurring ?? true,
    };
    // Only include is_paid / notes when explicitly provided so updates don't reset them
    if (is_paid !== undefined) payload.is_paid = is_paid;
    if (notes !== undefined) payload.notes = notes;

    const query = id
      ? admin.from('bills').update(payload).eq('id', id).eq('user_id', user.id)
      : admin.from('bills').insert({ ...payload, is_paid: (payload.is_paid as boolean) ?? false, user_id: user.id });

    const { data, error } = await query.select().single();
    if (error) return jsonResponse({ error: error.message }, 500);
    return jsonResponse(data);
  } catch (error) {
    console.error('save-bill error:', error.message);
    return jsonResponse({ error: error.message }, 500);
  }
});
