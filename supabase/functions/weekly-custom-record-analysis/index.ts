import { handleOptions, jsonResponse } from '../_shared/cors.ts';
import { serviceClient } from '../_shared/supabase.ts';

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-sonnet-5';

const ADVISOR_INSTRUCTIONS = `You are a friendly, knowledgeable personal finance advisor for MoneyGlow users. Each week you review the user's custom form records and turn them into clear, actionable financial guidance.

Method:
1. Understand what each custom form tracks from its name, description, and field definitions.
2. Review the records logged this period — look for patterns, trends, outliers, and anything relevant to spending, saving, or financial goals.
3. Connect the custom data to the user's broader finances where possible.
4. Produce a concise weekly summary: a 1-2 sentence overview, 2-4 bullet observations, and 2-4 prioritized action items.
5. Be encouraging and non-judgmental. Keep it scannable. Never make up numbers — base everything on the actual records provided.`;

async function callAnthropic(prompt: string) {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) throw new Error('AI features are not configured yet (missing ANTHROPIC_API_KEY).');
  const res = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: MODEL, max_tokens: 1200, messages: [{ role: 'user', content: prompt }] }),
  });
  if (!res.ok) throw new Error(`Anthropic API error (${res.status}): ${await res.text()}`);
  const data = await res.json();
  return (data.content || []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('\n');
}

// Runs per-user across the whole system (service-role, triggered by pg_cron weekly).
Deno.serve(async (req) => {
  const opt = handleOptions(req);
  if (opt) return opt;

  try {
    const admin = serviceClient();

    const { data: forms } = await admin.from('custom_forms').select('*');
    const { data: records } = await admin
      .from('custom_records').select('*').order('created_date', { ascending: false }).limit(500);

    if (!records || records.length === 0) {
      console.log('No custom records to analyze this week.');
      return jsonResponse({ message: 'No custom records to analyze.', analyzed: 0 });
    }

    const formMap = new Map((forms || []).map((f) => [f.id, f]));

    // Group records per user so each user gets their own tailored analysis + notification
    const byUser = new Map<string, any[]>();
    for (const r of records) {
      const list = byUser.get(r.user_id) || [];
      list.push(r);
      byUser.set(r.user_id, list);
    }

    let analyzed = 0;
    for (const [userId, userRecords] of byUser.entries()) {
      const recordsContext = userRecords.map((r) => {
        const form = formMap.get(r.form_id);
        return {
          form: form ? form.name : 'Unknown form',
          fields: form ? (form.fields || []).map((f: any) => ({ label: f.label, type: f.type })) : [],
          data: r.data,
          notes: r.notes,
          created: r.created_date,
        };
      });

      const prompt = `${ADVISOR_INSTRUCTIONS}\n\nHere are the user's custom form records (JSON):\n${JSON.stringify(recordsContext, null, 2)}\n\nProvide the weekly analysis now.`;

      try {
        const analysisText = await callAnthropic(prompt);
        await admin.from('notifications').insert({
          user_id: userId,
          title: 'Weekly Custom Records Analysis',
          message: analysisText,
          type: 'info',
          related_type: 'CustomRecord',
          is_read: false,
          action_url: '/forms',
        });
        analyzed += userRecords.length;
      } catch (err) {
        console.error(`weekly analysis failed for user ${userId}:`, err.message);
      }
    }

    console.log(`Weekly analysis stored. Records analyzed: ${analyzed}`);
    return jsonResponse({ analyzed, stored: true });
  } catch (error) {
    console.error('weekly-custom-record-analysis error:', error);
    return jsonResponse({ error: "We couldn't generate this week's analysis. Please try again later." }, 500);
  }
});
