import { handleOptions, jsonResponse } from '../_shared/cors.ts';
import { getUser, serviceClient } from '../_shared/supabase.ts';

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-sonnet-4-6'; // update as newer models become available

const ADVISOR_INSTRUCTIONS = `You are a friendly, knowledgeable personal finance advisor for Yoglow users. Your job is to review the user's budget limits and actual spending, their upcoming bills, AND their custom form records, then offer clear, actionable advice.

1. Read their Budget data to understand monthly spending limits per category.
2. Read their Transaction data to see actual spending this month.
3. Read their Bill data to see upcoming and overdue bills.
4. Read their CustomForm definitions and CustomRecord entries.
5. Compare spending vs budget limits to identify over-budget or at-risk categories.
6. Flag overdue or upcoming bills (due within 7 days).
7. Analyze custom records for meaningful patterns, trends, or anomalies.
8. Give 2-4 specific, prioritized action items the user can take right now.
9. Be encouraging and non-judgmental. Keep responses concise and scannable.
10. Never make up numbers — always base advice on the actual data provided below.
11. If there is no data yet, encourage the user to add transactions, set budgets, add bills, or log custom records.`;

async function callAnthropic(messages: { role: string; content: string }[], system?: string) {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) throw new Error('AI features are not configured yet (missing ANTHROPIC_API_KEY).');

  const res = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({ model: MODEL, max_tokens: 1500, system, messages }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Anthropic API error (${res.status}): ${text}`);
  }
  const data = await res.json();
  return (data.content || []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('\n');
}

// --- mode: "invoke" — replaces base44.integrations.Core.InvokeLLM ------------
async function handleInvoke(body: any) {
  const { prompt, response_json_schema } = body;
  if (!prompt) throw new Error('prompt is required');

  let finalPrompt = prompt;
  if (response_json_schema) {
    finalPrompt += `\n\nRespond with ONLY raw JSON matching this schema, no markdown or code fences:\n${JSON.stringify(response_json_schema)}`;
  }

  const text = await callAnthropic([{ role: 'user', content: finalPrompt }]);

  if (response_json_schema) {
    const cleaned = text.trim().replace(/^```json\s*/i, '').replace(/```\s*$/, '');
    try {
      return JSON.parse(cleaned);
    } catch (_) {
      throw new Error('AI response was not valid JSON');
    }
  }
  return text;
}

// --- mode: "advisor_chat" — replaces base44.agents.* for AdvisorChat.jsx -----
async function handleAdvisorChat(body: any, userId: string) {
  const { conversation_id } = body;
  if (!conversation_id) throw new Error('conversation_id is required');
  const admin = serviceClient();

  // Verify the conversation belongs to this user
  const { data: conv } = await admin
    .from('advisor_conversations').select('*').eq('id', conversation_id).eq('user_id', userId).single();
  if (!conv) throw new Error('Conversation not found');

  // Pull the user's financial context (read-only), scoped to this user
  const [{ data: budgets }, { data: transactions }, { data: bills }, { data: forms }, { data: records }] = await Promise.all([
    admin.from('budgets').select('*').eq('user_id', userId),
    admin.from('transactions').select('*').eq('user_id', userId).order('date', { ascending: false }).limit(200),
    admin.from('bills').select('*').eq('user_id', userId),
    admin.from('custom_forms').select('*').eq('user_id', userId),
    admin.from('custom_records').select('*').eq('user_id', userId).order('created_date', { ascending: false }).limit(100),
  ]);

  const context = `User's financial data (JSON):\nBudgets: ${JSON.stringify(budgets)}\nRecent transactions: ${JSON.stringify(transactions)}\nBills: ${JSON.stringify(bills)}\nCustom forms: ${JSON.stringify(forms)}\nCustom records: ${JSON.stringify(records)}`;

  // Full message history for this conversation
  const { data: history } = await admin
    .from('advisor_messages').select('role, content').eq('conversation_id', conversation_id).order('created_date', { ascending: true });

  const messages = (history || []).map((m) => ({ role: m.role, content: m.content }));
  const system = `${ADVISOR_INSTRUCTIONS}\n\n${context}`;

  const replyText = await callAnthropic(messages, system);

  await admin.from('advisor_messages').insert({
    conversation_id, user_id: userId, role: 'assistant', content: replyText,
  });

  return { success: true };
}

Deno.serve(async (req) => {
  const opt = handleOptions(req);
  if (opt) return opt;

  try {
    const user = await getUser(req);
    if (!user) return jsonResponse({ error: 'Unauthorized' }, 401);

    const body = await req.json();
    const mode = body.mode || 'invoke';

    if (mode === 'invoke') {
      const result = await handleInvoke(body);
      return jsonResponse({ result });
    }
    if (mode === 'advisor_chat') {
      const result = await handleAdvisorChat(body, user.id);
      return jsonResponse(result);
    }
    return jsonResponse({ error: 'Unknown mode' }, 400);
  } catch (error) {
    console.error('ai-coach error:', error.message);
    return jsonResponse({ error: error.message }, 500);
  }
});
