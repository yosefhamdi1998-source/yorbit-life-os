import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const ADVISOR_INSTRUCTIONS = `You are a friendly, knowledgeable personal finance advisor for Yoglow users. Each week you review the user's custom form records and turn them into clear, actionable financial guidance.

Method:
1. Understand what each custom form tracks from its name, description, and field definitions.
2. Review the records logged this period — look for patterns, trends, outliers, and anything relevant to spending, saving, or financial goals.
3. Connect the custom data to the user's broader finances where possible (e.g., a form tracking subscriptions, side income, debt, or expenses).
4. Produce a concise weekly summary: a 1-2 sentence overview, 2-4 bullet observations, and 2-4 prioritized action items the user can take now.
5. Be encouraging and non-judgmental. Keep it scannable. Never make up numbers — base everything on the actual records provided.`;

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const forms = await base44.asServiceRole.entities.CustomForm.list();
    const records = await base44.asServiceRole.entities.CustomRecord.list('-created_date', 200);

    if (!records || records.length === 0) {
      console.log('No custom records to analyze this week.');
      return Response.json({ message: 'No custom records to analyze.', analyzed: 0 });
    }

    const formMap = new Map((forms || []).map((f) => [f.id, f]));
    const recordsContext = records.map((r) => {
      const form = formMap.get(r.form_id);
      return {
        form: form ? form.name : 'Unknown form',
        fields: form ? (form.fields || []).map((f) => ({ label: f.label, type: f.type })) : [],
        data: r.data,
        notes: r.notes,
        created: r.created_date,
      };
    });

    const prompt =
      `${ADVISOR_INSTRUCTIONS}\n\nHere are the user's custom form records (JSON):\n` +
      JSON.stringify(recordsContext, null, 2) +
      `\n\nProvide the weekly analysis now.`;

    const analysis = await base44.integrations.Core.InvokeLLM({ prompt });
    const analysisText = typeof analysis === 'string' ? analysis : JSON.stringify(analysis);

    await base44.asServiceRole.entities.Notification.create({
      title: 'Weekly Custom Records Analysis',
      message: analysisText,
      type: 'info',
      related_type: 'CustomRecord',
      is_read: false,
      action_url: '/forms',
    });

    console.log(`Weekly analysis stored. Records analyzed: ${records.length}`);
    return Response.json({ analyzed: records.length, stored: true });
  } catch (error) {
    console.error('weeklyCustomRecordAnalysis error:', error);
    return Response.json({ error: 'We couldn’t generate this week’s analysis. Please try again later.' }, { status: 500 });
  }
});