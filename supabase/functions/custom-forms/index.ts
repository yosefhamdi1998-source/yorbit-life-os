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
      'forms', identityFromRequest(req, user.id), RULES.write,
    );
    if (limited) return limited;

    const admin = serviceClient();
    const body = await req.json();
    const { op } = body;

    if (op === 'save_form') {
      const { id, name, icon, description, fields, is_favorite } = body;
      if (!name) return jsonResponse({ error: 'Name is required' }, 400);
      const payload = {
        name,
        icon: icon || '📋',
        description: description || '',
        fields: fields || [],
        is_favorite: is_favorite || false,
      };
      const query = id
        ? admin.from('custom_forms').update(payload).eq('id', id).eq('user_id', user.id)
        : admin.from('custom_forms').insert({ ...payload, user_id: user.id });
      const { data, error } = await query.select().single();
      if (error) return jsonResponse({ error: error.message }, 500);
      return jsonResponse(data);
    }

    if (op === 'delete_form') {
      const { id } = body;
      if (!id) return jsonResponse({ error: 'id is required' }, 400);
      await admin.from('custom_records').delete().eq('form_id', id).eq('user_id', user.id);
      const { error } = await admin.from('custom_forms').delete().eq('id', id).eq('user_id', user.id);
      if (error) return jsonResponse({ error: error.message }, 500);
      return jsonResponse({ success: true });
    }

    if (op === 'save_record') {
      const { id, form_id, data: recordData, notes } = body;
      if (!form_id) return jsonResponse({ error: 'form_id is required' }, 400);
      const payload = { form_id, data: recordData || {}, notes: notes || '' };
      const query = id
        ? admin.from('custom_records').update(payload).eq('id', id).eq('user_id', user.id)
        : admin.from('custom_records').insert({ ...payload, user_id: user.id });
      const { data, error } = await query.select().single();
      if (error) return jsonResponse({ error: error.message }, 500);
      return jsonResponse(data);
    }

    if (op === 'delete_record') {
      const { id } = body;
      if (!id) return jsonResponse({ error: 'id is required' }, 400);
      const { error } = await admin.from('custom_records').delete().eq('id', id).eq('user_id', user.id);
      if (error) return jsonResponse({ error: error.message }, 500);
      return jsonResponse({ success: true });
    }

    return jsonResponse({ error: 'Unknown op' }, 400);
  } catch (error) {
    console.error('custom-forms error:', error.message);
    return jsonResponse({ error: error.message }, 500);
  }
});
