import { handleOptions, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { getUser, serviceClient } from '../_shared/supabase.ts';

import { enforceRateLimit, identityFromRequest, RULES } from '../_shared/rateLimit.ts';

// Bump when the consent wording materially changes. Consent to the old text
// is not consent to new processing, so raising this re-asks everyone rather
// than silently carrying a stale agreement forward. Must match
// AI_CONSENT_VERSION in src/lib/aiConsent.js.
const AI_CONSENT_VERSION = 1;


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
// PRICING: verified against claude.com/pricing on 2026-09-04 for Sonnet 5,
// the model MODEL above actually calls. Published rates per million tokens:
//   input $2  |  output $10  |  cache read $0.20  |  cache write $2.50
// which is what the per-1K constants below encode.
//
// The previous values ($0.003 / $0.015) were an unverified guess and were
// 1.5x too high across all four rates. That erred toward overstating cost,
// which is the safe direction for a budget cap, but it meant the ceiling
// tripped ~33% earlier than it should have and every tier calculation was
// wrong. If the model in MODEL changes, these must change with it.
const DAILY_REQUEST_LIMIT_PER_USER = 40;
const MONTHLY_BUDGET_USD = 15;
const COST_PER_1K_INPUT_TOKENS = 0.002;
const COST_PER_1K_OUTPUT_TOKENS = 0.010;
// Cached input is billed at a large discount on reads and a premium on the
// initial write. Kept as separate constants so the estimate stays honest
// rather than pretending a cache read costs the same as a fresh one.
const COST_PER_1K_CACHE_READ_TOKENS = 0.0002;
const COST_PER_1K_CACHE_WRITE_TOKENS = 0.0025;

// --- per-user ceilings --------------------------------------------------
// The shared monthly cap above protects the bill but not the product: the
// first heavy user consumes it and every later user meets a dead feature.
// With strangers that is the normal case, not the edge case. These are the
// per-user allowances that decide what a signup actually costs.
//
// Measured against real data: a full advisor turn was ~25,100 input tokens
// because 200 complete transaction rows were serialised into every single
// message. After trimming (below) a turn is ~950 input tokens, which at
// verified Sonnet 5 rates is about $0.009 per message, or $0.007 once the
// system block is a cache read.
//
// So the free tier's 15 messages cost roughly $0.14/user/month. The dollar
// ceilings sit deliberately above that: the request count is what should
// bind in normal use, and the dollar figure is the backstop for a
// pathological case (an enormous conversation, or a pricing change nobody
// noticed) rather than the everyday limit.
const TIER_MONTHLY_USD: Record<string, number> = {
  free: 0.40,
  pro: 6.00,
  unlimited: 100.00,
};
const TIER_MONTHLY_REQUESTS: Record<string, number> = {
  free: 15,
  pro: 300,
  unlimited: 5000,
};

function monthKeyUTC(d = new Date()) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

async function checkSpendLimits(admin: ReturnType<typeof serviceClient>, userId: string) {
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  const month = monthKeyUTC();

  const [{ count: dailyCount }, { data: monthRows }, { data: profile }, { data: budgetRow }] =
    await Promise.all([
      admin.from('ai_usage_log').select('id', { count: 'exact', head: true })
        .eq('user_id', userId).gte('created_at', dayAgo),
      admin.from('ai_usage_log').select('estimated_cost_usd')
        .gte('created_at', monthStart.toISOString()),
      admin.from('profiles').select('ai_tier').eq('id', userId).single(),
      admin.from('ai_user_budgets').select('requests, spend_usd')
        .eq('user_id', userId).eq('month', month).maybeSingle(),
    ]);

  if ((dailyCount ?? 0) >= DAILY_REQUEST_LIMIT_PER_USER) {
    return "You've reached today's AI Coach limit. It resets in a few hours — try again later.";
  }

  // Per-user ceiling, checked BEFORE the shared one so a user who has
  // exhausted their own allowance gets a message about their allowance
  // rather than a confusing global outage notice.
  const tier = profile?.ai_tier || 'free';
  const userSpend = Number(budgetRow?.spend_usd ?? 0);
  const userRequests = Number(budgetRow?.requests ?? 0);
  const tierUsd = TIER_MONTHLY_USD[tier] ?? TIER_MONTHLY_USD.free;
  const tierRequests = TIER_MONTHLY_REQUESTS[tier] ?? TIER_MONTHLY_REQUESTS.free;

  if (userRequests >= tierRequests || userSpend >= tierUsd) {
    return tier === 'free'
      ? `You've used all ${tierRequests} of this month's free AI Coach messages. They reset on the 1st.`
      : "You've reached your AI Coach limit for this month. It resets on the 1st.";
  }

  const monthSpend = (monthRows || []).reduce((s, r) => s + (r.estimated_cost_usd || 0), 0);
  if (monthSpend >= MONTHLY_BUDGET_USD) {
    return "AI Coach has reached this month's usage budget. It'll reset next month.";
  }

  return null; // not blocked
}

// The $15 cap is deliberately SHARED, not per-user: one Anthropic API key
// pays for the whole family, so that's the number that actually protects
// against a surprise bill. The tradeoff is real — one person's heavy usage
// can use up everyone's budget — so a silent cutoff isn't acceptable. This
// warns every real account once the shared total crosses 80%, before
// anyone actually gets blocked, and only once per month (tracked in
// ai_usage_alerts) so it doesn't re-fire on every request past the
// threshold.
const WARNING_THRESHOLD_FRACTION = 0.8;

async function maybeSendBudgetWarning(admin: ReturnType<typeof serviceClient>, monthKey: string, monthSpend: number) {
  if (monthSpend < MONTHLY_BUDGET_USD * WARNING_THRESHOLD_FRACTION) return;
  try {
    const { error: insertAlertError } = await admin
      .from('ai_usage_alerts')
      .insert({ month: monthKey }); // primary key on month — fails harmlessly if already sent
    if (insertAlertError) return; // already sent this month (or a real error — either way, don't spam)

    const { data: users } = await admin.from('profiles').select('id');
    const pctUsed = Math.round((monthSpend / MONTHLY_BUDGET_USD) * 100);
    const notifications = (users || []).map(u => ({
      user_id: u.id,
      title: 'AI Coach nearing its monthly limit',
      message: `AI Coach has used ${pctUsed}% of this month's shared usage budget. Once it's reached, Coach will pause for everyone until next month.`,
    }));
    if (notifications.length) await admin.from('notifications').insert(notifications);
  } catch (err) {
    console.error('ai-coach budget warning failed (non-fatal):', err.message);
  }
}

async function logUsage(
  admin: ReturnType<typeof serviceClient>,
  userId: string,
  usage: {
    input_tokens?: number;
    output_tokens?: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  },
) {
  const input_tokens = usage?.input_tokens || 0;
  const output_tokens = usage?.output_tokens || 0;
  const cache_write = usage?.cache_creation_input_tokens || 0;
  const cache_read = usage?.cache_read_input_tokens || 0;

  // Cache reads and writes are billed differently from fresh input. Rolling
  // them all into the plain input rate would overstate cost by roughly 10x
  // on cached turns and make the budget trip far too early.
  const estimated_cost_usd =
    (input_tokens / 1000) * COST_PER_1K_INPUT_TOKENS +
    (output_tokens / 1000) * COST_PER_1K_OUTPUT_TOKENS +
    (cache_write / 1000) * COST_PER_1K_CACHE_WRITE_TOKENS +
    (cache_read / 1000) * COST_PER_1K_CACHE_READ_TOKENS;

  // Best-effort — a logging failure should never break the actual response
  // the user is waiting on.
  try {
    const monthKey = monthKeyUTC();

    await admin.from('ai_usage_log').insert({
      user_id: userId, input_tokens, output_tokens, estimated_cost_usd,
    });

    // Atomic per-user accumulation. Doing this as read-then-write would let
    // two concurrent requests both read the same total and both write
    // base+cost, losing one — the same race that made goal contributions
    // silently vanish.
    await admin.rpc('record_ai_usage', {
      p_user_id: userId,
      p_month: monthKey,
      p_spend: estimated_cost_usd,
    });

    const monthStart = new Date();
    monthStart.setUTCDate(1);
    monthStart.setUTCHours(0, 0, 0, 0);
    const { data: monthRows } = await admin.from('ai_usage_log')
      .select('estimated_cost_usd').gte('created_at', monthStart.toISOString());
    const monthSpend = (monthRows || []).reduce((s, r) => s + (r.estimated_cost_usd || 0), 0);
    await maybeSendBudgetWarning(admin, monthKey, monthSpend);
  } catch (err) {
    console.error('ai-coach usage logging failed (non-fatal):', err.message);
  }
}

const ADVISOR_INSTRUCTIONS = `You are a friendly, knowledgeable personal finance advisor for Yorbit users. Your job is to review the user's budget limits and actual spending, their upcoming bills, AND their custom form records, then offer clear, actionable advice.

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

const MAX_HISTORY_MESSAGES = 20;
const RECENT_TX_DETAIL = 40;

// Builds the model's view of the user's finances.
//
// This previously serialised 200 complete transaction rows straight into
// the prompt. Measured against real data that was 89,059 characters —
// roughly 26,000 tokens — per message, and most of it was UUIDs, ISO
// timestamps and created/updated columns the model cannot use. At ~$0.003
// per 1K input tokens that was about 8 cents of pure overhead on every
// turn, re-billed in full each time.
//
// What the model actually needs to give advice: totals per category, how
// that compares to budget, and enough recent line items to name specific
// merchants. So: aggregate everything, then include only the most recent
// few dozen transactions in detail, stripped to the fields that matter.
function buildContext(d: {
  budgets: any[] | null;
  transactions: any[] | null;
  bills: any[] | null;
  forms: any[] | null;
  records: any[] | null;
}) {
  const txs = d.transactions || [];

  const byCategory = new Map<string, { spent: number; count: number }>();
  let totalSpend = 0;
  let totalIncome = 0;
  for (const t of txs) {
    const amt = Number(t.amount) || 0;
    if (t.type === 'income') { totalIncome += amt; continue; }
    totalSpend += amt;
    const cur = byCategory.get(t.category) || { spent: 0, count: 0 };
    cur.spent += amt;
    cur.count += 1;
    byCategory.set(t.category, cur);
  }

  const budgetByCat = new Map(
    (d.budgets || []).map((b: any) => [b.category, Number(b.monthly_limit) || 0]),
  );

  const categoryLines = [...byCategory.entries()]
    .sort((a, b) => b[1].spent - a[1].spent)
    .map(([cat, v]) => {
      const limit = budgetByCat.get(cat);
      const limitPart = limit ? ` of $${limit} budget` : ' (no budget set)';
      return `- ${cat}: $${v.spent.toFixed(2)}${limitPart} across ${v.count} transactions`;
    });

  // Only the fields that carry meaning. Dropping ids and timestamps is
  // most of the saving.
  const recent = txs.slice(0, RECENT_TX_DETAIL).map((t: any) =>
    `${t.date} ${t.type === 'income' ? '+' : '-'}$${Number(t.amount).toFixed(2)} ${t.category} "${t.title}"`,
  );

  const billLines = (d.bills || []).map((b: any) =>
    `- ${b.name}: $${b.amount} due ${b.due_date}${b.is_paid ? ' (paid)' : ''}`,
  );

  const recordLines = (d.records || []).slice(0, 20).map((r: any) =>
    `- ${r.form_id}: ${JSON.stringify(r.data)}`,
  );

  return [
    `Spending summary (${txs.length} transactions):`,
    `Total spent: $${totalSpend.toFixed(2)} | Total income: $${totalIncome.toFixed(2)}`,
    '',
    'By category:',
    ...(categoryLines.length ? categoryLines : ['- no spending recorded']),
    '',
    `Most recent ${recent.length} transactions:`,
    ...(recent.length ? recent : ['- none']),
    '',
    'Bills:',
    ...(billLines.length ? billLines : ['- none']),
    '',
    'Custom forms:',
    ...((d.forms || []).map((f: any) => `- ${f.name}`)),
    ...(recordLines.length ? ['', 'Recent custom records:', ...recordLines] : []),
  ].join('\n');
}

async function callAnthropic(
  messages: { role: string; content: string }[],
  system?: string,
  cacheSystem = false,
) {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) throw new Error('AI features are not configured yet (missing ANTHROPIC_API_KEY).');

  // The system block holds the instructions plus the user's financial
  // context, and is identical for every turn of a conversation. Without a
  // cache breakpoint it was re-billed at full input price on every single
  // message. Marking it ephemeral makes turn 2 onward a cache read.
  const systemPayload = system
    ? (cacheSystem
        ? [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }]
        : system)
    : undefined;

  const res = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({ model: MODEL, max_tokens: 1500, system: systemPayload, messages }),
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
    // exclude_from_budget filter matters here: the Coach was reading the
    // raw table with a service-role client, so it saw crypto trading,
    // self-transfers, P2P sends and ATM withdrawals as if they were
    // ordinary spending — and then gave advice based on numbers no other
    // screen in the app agreed with. Every user-facing surface filters
    // these out; this one has to as well or the advice contradicts the app.
    admin.from('transactions').select('*').eq('user_id', userId).eq('exclude_from_budget', false).order('date', { ascending: false }).limit(200),
    admin.from('bills').select('*').eq('user_id', userId),
    admin.from('custom_forms').select('*').eq('user_id', userId),
    admin.from('custom_records').select('*').eq('user_id', userId).order('created_date', { ascending: false }).limit(100),
  ]);

  const context = buildContext({ budgets, transactions, bills, forms, records });

  // History is bounded. It was previously fetched with no limit, so every
  // turn re-sent the entire conversation and cost grew quadratically with
  // its length. The last 20 messages is ample for continuity; anything
  // older is not worth paying for on every subsequent message.
  const { data: history } = await admin
    .from('advisor_messages').select('role, content')
    .eq('conversation_id', conversation_id)
    .order('created_date', { ascending: false })
    .limit(MAX_HISTORY_MESSAGES);

  const messages = (history || [])
    .slice()
    .reverse()
    .map((m) => ({ role: m.role, content: m.content }));
  const system = `${ADVISOR_INSTRUCTIONS}\n\n${context}`;

  // Cache the system block: it is byte-identical across turns of the same
  // conversation, which is exactly what a cache breakpoint is for.
  const { text: replyText, usage } = await callAnthropic(messages, system, true);
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
    if (!user) return jsonResponse({ error: 'Unauthorized' }, 401, {}, req);

    const admin = serviceClient();

    // Burst protection, distinct from the monthly budget below. The budget
    // stops the bill; this stops a script issuing hundreds of requests a
    // minute, which the budget would only notice after the money was gone.
    const limited = await enforceRateLimit(
      'ai', identityFromRequest(req, user.id), RULES.ai,
      'You are sending messages faster than AI Coach can keep up. Try again shortly.',
      req,
    );
    if (limited) return limited;

    // Checked before either mode ever calls Anthropic — a blocked request
    // costs nothing, and the caller gets a plain-English reason instead of
    // whatever Anthropic itself would have returned (or a raw 500, the way
    // running out of credits looked before this existed).
    const blockedReason = await checkSpendLimits(admin, user.id);
    if (blockedReason) return jsonResponse({ error: blockedReason }, 429, {}, req);

    // CONSENT GATE. This function builds its prompt from the user's real
    // records - individual transactions including the merchant or payee in
    // the title, budgets, bills - and posts them to Anthropic. That must not
    // happen until the account holder has been told and has agreed.
    //
    // The check lives here rather than in the UI on purpose. A screen in the
    // browser is a suggestion; anything holding a session token can call this
    // endpoint directly. The gate belongs on the same side of the wire as the
    // data it protects.
    //
    // 403 with a machine-readable code, not a generic error: the client needs
    // to tell "you haven't agreed yet" apart from "something broke" so it can
    // show the consent screen instead of an error toast.
    const { data: consentOk, error: consentErr } = await admin
      .rpc('has_ai_consent', { p_user_id: user.id, p_min_version: AI_CONSENT_VERSION });
    if (consentErr) {
      // Fail CLOSED. If we cannot confirm consent we do not send the data.
      console.error('consent check failed', consentErr.message);
      return jsonResponse({ error: 'Could not verify your AI settings. Please try again.', code: 'consent_check_failed' }, 503, {}, req);
    }
    if (!consentOk) {
      return jsonResponse({
        error: 'AI features need your permission before Yorbit can send your financial data to be analysed.',
        code: 'ai_consent_required',
      }, 403, {}, req);
    }

    const body = await req.json();
    const mode = body.mode || 'invoke';

    if (mode === 'invoke') {
      const result = await handleInvoke(body, admin, user.id);
      return jsonResponse({ result }, 200, {}, req);
    }
    if (mode === 'advisor_chat') {
      const result = await handleAdvisorChat(body, user.id, admin);
      return jsonResponse(result, 200, {}, req);
    }
    return jsonResponse({ error: 'Unknown mode' }, 400, {}, req);
  } catch (error) {
    console.error('ai-coach error:', error.message);
    return errorResponse("Something went wrong on our end. Please try again, and if it keeps happening send us this code.", 500, { internal: error, fn: 'ai-coach', req });
  }
});
