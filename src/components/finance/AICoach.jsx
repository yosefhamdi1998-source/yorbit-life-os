import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Brain, ChevronDown, Loader2, CheckCircle, AlertCircle, Target, Calendar, RefreshCw } from 'lucide-react';
import { FEATURES } from '@/lib/features';

export default function AICoach({ monthIncome, monthExpenses, catData, budgets, goals, thisMonth }) {
  const [advice, setAdvice] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState(false);

  if (!FEATURES.aiCoach) return null;

  const getAdvice = async () => {
    setLoading(true);
    setError('');
    setExpanded(true);
    const savingsRate = monthIncome > 0 ? ((1 - monthExpenses / monthIncome) * 100).toFixed(0) : 0;
    const budgetStatus = catData.map(c => {
      const b = budgets.find(b => b.category === c.name && b.month === thisMonth);
      return b
        ? `${c.name}: $${c.spent.toFixed(0)} of $${b.monthly_limit} (${Math.round((c.spent / b.monthly_limit) * 100)}%)`
        : `${c.name}: $${c.spent.toFixed(0)} (no budget)`;
    }).join(', ');

    try {
      const result = await base44.integrations.Core.InvokeLLM({
        prompt: `You are a professional personal finance coach. Respond ONLY with valid JSON — no markdown, no code blocks.

User finances:
- Income: $${monthIncome.toFixed(0)}/mo
- Spending: $${monthExpenses.toFixed(0)}/mo
- Savings rate: ${savingsRate}%
- Budget status: ${budgetStatus || 'no data'}
- Goals: ${goals?.map(g => `${g.name}: ${Math.round(((g.current_amount || 0) / g.target_amount) * 100)}%`).join(', ') || 'none'}

Return exactly:
{
  "going_well": ["1 thing (max 15 words)", "1 more thing (max 15 words)"],
  "needs_attention": ["1 issue with dollar amount (max 15 words)", "1 more if real"],
  "next_move": "One specific action with a dollar amount (max 20 words)",
  "weekly_plan": ["Mon-Tue action", "Wed-Thu action", "Fri-Sun action"]
}

Be specific and direct. Reference their real numbers.`,
        response_json_schema: {
          type: 'object',
          properties: {
            going_well: { type: 'array', items: { type: 'string' } },
            needs_attention: { type: 'array', items: { type: 'string' } },
            next_move: { type: 'string' },
            weekly_plan: { type: 'array', items: { type: 'string' } },
          }
        }
      });
      setAdvice(result);
    } catch {
      setError("Couldn't generate your coaching plan. Try again.");
    }
    setLoading(false);
  };

  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden">
      <button
        onClick={() => {
          if (!advice && !loading) getAdvice();
          else setExpanded(!expanded);
        }}
        className="w-full flex items-center gap-3 px-4 py-4 hover:bg-secondary/40 transition-colors active:opacity-80"
      >
        <div className="w-9 h-9 bg-purple-500/10 rounded-xl flex items-center justify-center shrink-0">
          <Brain className="w-5 h-5 text-purple-500" />
        </div>
        <div className="text-left flex-1 min-w-0">
          <p className="text-sm font-bold text-foreground">Financial Coach</p>
          <p className="text-xs text-muted-foreground">
            {advice ? 'Personalized coaching plan ready' : 'Get a personalized spending & savings plan'}
          </p>
        </div>
        {loading ? (
          <Loader2 className="w-4 h-4 text-muted-foreground animate-spin shrink-0" />
        ) : (
          <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform shrink-0 ${expanded ? 'rotate-180' : ''}`} />
        )}
      </button>

      {loading && (
        <div className="px-4 pb-4 border-t border-border pt-3 flex items-center gap-2">
          <div className="w-4 h-4 border-2 border-purple-500 border-t-transparent rounded-full animate-spin shrink-0" />
          <p className="text-sm text-muted-foreground">Building your coaching plan…</p>
        </div>
      )}

      {error && !loading && (
        <div className="px-4 pb-4 border-t border-border pt-3">
          <p className="text-sm text-muted-foreground">{error}</p>
          <button onClick={getAdvice} className="mt-2 flex items-center gap-1 text-xs font-semibold text-primary">
            <RefreshCw className="w-3 h-3" /> Try again
          </button>
        </div>
      )}

      {expanded && advice && !loading && (
        <div className="px-4 pb-5 border-t border-border pt-4 space-y-4">
          {advice.going_well?.length > 0 && (
            <div>
              <p className="text-xs font-bold text-emerald-600 uppercase tracking-wider mb-2">What's Working</p>
              <div className="space-y-1.5">
                {advice.going_well.map((item, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <CheckCircle className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                    <p className="text-sm text-foreground leading-snug">{item}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {advice.needs_attention?.length > 0 && (
            <div>
              <p className="text-xs font-bold text-amber-600 uppercase tracking-wider mb-2">Needs Attention</p>
              <div className="space-y-1.5">
                {advice.needs_attention.map((item, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <AlertCircle className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
                    <p className="text-sm text-foreground leading-snug">{item}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {advice.next_move && (
            <div className="bg-purple-50 border border-purple-200 rounded-xl p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <Target className="w-3.5 h-3.5 text-purple-600" />
                <p className="text-xs font-bold text-purple-600 uppercase tracking-wider">Recommended Next Move</p>
              </div>
              <p className="text-sm text-foreground leading-snug">{advice.next_move}</p>
            </div>
          )}

          {advice.weekly_plan?.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 mb-2">
                <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Weekly Action Plan</p>
              </div>
              <div className="space-y-1.5">
                {advice.weekly_plan.map((step, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <span className="text-xs font-bold text-muted-foreground w-4 shrink-0 mt-0.5">{i + 1}.</span>
                    <p className="text-sm text-muted-foreground leading-snug">{step}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          <button
            onClick={getAdvice}
            className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors mt-1"
          >
            <RefreshCw className="w-3 h-3" /> Regenerate
          </button>
        </div>
      )}
    </div>
  );
}