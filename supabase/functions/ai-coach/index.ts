import { handleOptions, jsonResponse } from '../_shared/cors.ts';
import { getUser, serviceClient } from '../_shared/supabase.ts';

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-sonnet-5'; // update as newer models become available

// --- spend controls -----------------------------------------------------
// Without these, one person (or a bug causing retries) can run the
// Anthropic bill up with no ceiling — exactly what happened once already
// this session (the account ran out of credits with no warning to anyone).
// Two independent limits, checked BEFORE calling Anthropic so a blocked
// request never costs anything:
//   - a per-user daily request count, to stop one account from hammering it
//   - a global monthly dollar budget shared across every user, which is
//     the one that actually protects against a surprise bill
// PRICING NOTE: these per-token rates are an estimate for this model tier —
// check https://www.anthropic.com/pricing and adjust if it's off; being
// slightly conservative (rounding the cap down) is the safe direction.
const DAILY_REQUEST_LIMIT_PER_USER = 40;
const MONTHLY_BUDGET_USD = 15;
const COST_PER_1K_INPUT_TOKENS = 0.003;
const COST_PER_1K_OUTPUT_TOKENS = 0.015;

async function checkSpendLimits(admin: ReturnType<typeof serviceClient>, userId: string) {
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);

  const [{ count: dailyCount }, { data: monthRows }] = await Promise.all([
    admin.from('ai_usage_log').select('id', { count: 'exact', head: true })
      .eq('user_id', userId).gte('created_at', dayAgo),
    admin.from('ai_usage_log').select('estimated_cost_usd')
      .gte('created_at', monthStart.toISOString()),
  ]);

  if ((dailyCount ?? 0) >= DAILY_REQUEST_LIMIT_PER_USER) {
    return "You've reached today's AI Coach limit. It resets in a few hours — try again later.";
  }

  const monthSpend = (monthRows || []).reduce((s, r) => s + (r.estimated_cost_usd || 0), 0);
  if (monthSpend >= MONTHLY_BUDGET_USD) {
    return "AI Coach has reached this month's usage budget. It'll reset next month.";
  }

  return null; // not blocked
}

async function logUsage(admin: ReturnType<typeof serviceClient>, userId: string, usage: { input_tokens?: number; output_tokens?: number }) {
  const input_tokens = usage?.input_tokens || 0;
  const output_tokens = usage?.output_tokens || 0;
  const estimated_cost_usd =
    (input_tokens / 1000) * COST_PER_1K_INPUT_TOKENS +
    (output_tokens / 1000) * COST_PER_1K_OUTPUT_TOKENS;
  // Best-effort — a logging failure should never break the actual response
  // the user is waiting on.
  try {
    await admin.from('ai_usage_log').insert({ user_id: userId, input_tokens, output_tokens, estimated_cost_usd });
  } catch (err) {
    console.error('ai-coach usage logging failed (non-fatal):', err.message);
  }
}

const ADVISOR_INSTRUCTIONS = `You are a friendly, knowledgeable personal finance advisor for MoneyGlow users. Your job is to review the user's budget limits and actual spending, their upcoming bills, AND their custom form records, then offer clear, actionable advice.

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
  const text = (data.content || []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('\n');
  return { text, usage: data.usage || {} };
}

// --- mode: "invoke" — replaces base44.integrations.Core.InvokeLLM ------------
async function handleInvoke(body: any, admin: ReturnType<typeof serviceClient>, userId: string) {
  const { prompt, response_json_schema } = body;
  if (!prompt) throw new Error('prompt is required');

  let finalPrompt = prompt;
  if (response_json_schema) {
    finalPrompt += `\n\nRespond with ONLY raw JSON matching this schema, no markdown or code fences:\n${JSON.stringify(response_json_schema)}`;
  }

  const { text, usage } = await callAnthropic([{ role: 'user', content: finalPrompt }]);
  await logUsage(admin, userId, usage);

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
async function handleAdvisorChat(body: any, userId: string, admin: ReturnType<typeof serviceClient>) {
  const { conversation_id } = body;
  if (!conversation_id) throw new Error('conversation_id is required');

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

  const { text: replyText, usage } = await callAnthropic(messages, system);
  await logUsage(admin, userId, usage);

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

    const admin = serviceClient();

    // Checked before either mode ever calls Anthropic — a blocked request
    // costs nothing, and the caller gets a plain-English reason instead of
    // whatever Anthropic itself would have returned (or a raw 500, the way
    // running out of credits looked before this existed).
    const blockedReason = await checkSpendLimits(admin, user.id);
    if (blockedReason) return jsonResponse({ error: blockedReason }, 429);

    const body = await req.json();
    const mode = body.mode || 'invoke';

    if (mode === 'invoke') {
      const result = await handleInvoke(body, admin, user.id);
      return jsonResponse({ result });
    }
    if (mode === 'advisor_chat') {
      const result = await handleAdvisorChat(body, user.id, admin);
      return jsonResponse(result);
    }
    return jsonResponse({ error: 'Unknown mode' }, 400);
  } catch (error) {
    console.error('ai-coach error:', error.message);
    return jsonResponse({ error: error.message }, 500);
  }
});
