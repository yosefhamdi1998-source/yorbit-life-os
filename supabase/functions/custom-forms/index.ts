import { handleOptions, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { getUser, serviceClient } from '../_shared/supabase.ts';
import { enforceRateLimit, identityFromRequest, RULES } from '../_shared/rateLimit.ts';

Deno.serve(async (req) => {
  const opt = handleOptions(req);
  if (opt) return opt;

  try {
    const user = await getUser(req);
    if (!user) return jsonResponse({ error: 'Unauthorized' }, 401, {}, req);

    const limited = await enforceRateLimit(
      'forms', identityFromRequest(req, user.id), RULES.write,
      req,
    );
    if (limited) return limited;

    const admin = serviceClient();
    const body = await req.json();
    const { op } = body;

    if (op === 'save_form') {
      const { id, name, icon, description, fields, is_favorite } = body;
      if (!name) return jsonResponse({ error: 'Name is required' }, 400, {}, req);
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
      if (error) return errorResponse("Something went wrong on our end. Please try again, and if it keeps happening send us this code.", 500, { internal: error, fn: 'custom-forms', req });
      return jsonResponse(data, 200, {}, req);
    }

    if (op === 'delete_form') {
      const { id } = body;
      if (!id) return jsonResponse({ error: 'id is required' }, 400, {}, req);
      await admin.from('custom_records').delete().eq('form_id', id).eq('user_id', user.id);
      const { error } = await admin.from('custom_forms').delete().eq('id', id).eq('user_id', user.id);
      if (error) return errorResponse("Something went wrong on our end. Please try again, and if it keeps happening send us this code.", 500, { internal: error, fn: 'custom-forms', req });
      return jsonResponse({ success: true }, 200, {}, req);
    }

    if (op === 'save_record') {
      const { id, form_id, data: recordData, notes } = body;
      if (!form_id) return jsonResponse({ error: 'form_id is required' }, 400, {}, req);
      const payload = { form_id, data: recordData || {}, notes: notes || '' };
      const query = id
        ? admin.from('custom_records').update(payload).eq('id', id).eq('user_id', user.id)
        : admin.from('custom_records').insert({ ...payload, user_id: user.id });
      const { data, error } = await query.select().single();
      if (error) return errorResponse("Something went wrong on our end. Please try again, and if it keeps happening send us this code.", 500, { internal: error, fn: 'custom-forms', req });
      return jsonResponse(data, 200, {}, req);
    }

    if (op === 'delete_record') {
      const { id } = body;
      if (!id) return jsonResponse({ error: 'id is required' }, 400, {}, req);
      const { error } = await admin.from('custom_records').delete().eq('id', id).eq('user_id', user.id);
      if (error) return errorResponse("Something went wrong on our end. Please try again, and if it keeps happening send us this code.", 500, { internal: error, fn: 'custom-forms', req });
      return jsonResponse({ success: true }, 200, {}, req);
    }

    return jsonResponse({ error: 'Unknown op' }, 400, {}, req);
  } catch (error) {
    console.error('custom-forms error:', error.message);
    return errorResponse("Something went wrong on our end. Please try again, and if it keeps happening send us this code.", 500, { internal: error, fn: 'custom-forms', req });
  }
});
