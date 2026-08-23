import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { id, name, amount, due_date, category, is_recurring, is_paid, notes } = body;

    if (!name || amount == null || !due_date) {
      return Response.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const payload = {
      name,
      amount: Number(amount),
      due_date,
      category: category || 'other',
      is_recurring: is_recurring ?? true,
    };
    // Only include is_paid / notes when explicitly provided so updates don't reset them
    if (is_paid !== undefined) payload.is_paid = is_paid;
    if (notes !== undefined) payload.notes = notes;

    let result;
    if (id) {
      result = await base44.asServiceRole.entities.Bill.update(id, payload);
    } else {
      result = await base44.asServiceRole.entities.Bill.create({ ...payload, is_paid: payload.is_paid ?? false });
    }
    return Response.json(result);
  } catch (error) {
    console.error('saveBill error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});