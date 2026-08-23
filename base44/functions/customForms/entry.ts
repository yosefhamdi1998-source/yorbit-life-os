import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { op } = body;

    if (op === 'save_form') {
      const { id, name, icon, description, fields, is_favorite } = body;
      if (!name) return Response.json({ error: 'Name is required' }, { status: 400 });
      const payload = {
        name,
        icon: icon || '📋',
        description: description || '',
        fields: fields || [],
        is_favorite: is_favorite || false,
      };
      const result = id
        ? await base44.asServiceRole.entities.CustomForm.update(id, payload)
        : await base44.asServiceRole.entities.CustomForm.create(payload);
      return Response.json(result);
    }

    if (op === 'delete_form') {
      const { id } = body;
      if (!id) return Response.json({ error: 'id is required' }, { status: 400 });
      await base44.asServiceRole.entities.CustomRecord.deleteMany({ form_id: id }).catch(() => {});
      await base44.asServiceRole.entities.CustomForm.delete(id);
      return Response.json({ success: true });
    }

    if (op === 'save_record') {
      const { id, form_id, data, notes } = body;
      if (!form_id) return Response.json({ error: 'form_id is required' }, { status: 400 });
      const payload = { form_id, data: data || {}, notes: notes || '' };
      const result = id
        ? await base44.asServiceRole.entities.CustomRecord.update(id, payload)
        : await base44.asServiceRole.entities.CustomRecord.create(payload);
      return Response.json(result);
    }

    if (op === 'delete_record') {
      const { id } = body;
      if (!id) return Response.json({ error: 'id is required' }, { status: 400 });
      await base44.asServiceRole.entities.CustomRecord.delete(id);
      return Response.json({ success: true });
    }

    return Response.json({ error: 'Unknown op' }, { status: 400 });
  } catch (error) {
    console.error('customForms error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});