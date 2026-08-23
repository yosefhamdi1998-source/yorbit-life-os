import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Sparkles, RefreshCw, AlertTriangle, Lightbulb, TrendingUp, Zap, Clock } from 'lucide-react';
import { FEATURES } from '@/lib/features';
import { format } from 'date-fns';

const TODAY = format(new Date(), 'yyyy-MM-dd');
const MIN_TRANSACTIONS = 3;

export default function AIMoneyBriefing({ monthIncome, monthExpenses, catData, goals, lastMonthExpenses, transactionCount }) {
  const [briefing, setBriefing] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [cacheId, setCacheId] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [cacheChecked, setCacheChecked] = useState(false);

  // Load today's cache on mount
  useEffect(() => {
    base44.entities.AIInsightCache.filter({ type: 'briefing', date: TODAY }, '-created_date', 1)
      .then(results => {
        if (results.length > 0) {
          setBriefing(results[0].content);
          setCacheId(results[0].id);
          setLastUpdated(results[0].created_date);
        }
        setCacheChecked(true);
      })
      .catch(() => setCacheChecked(true));
  }, []);

  const hasEnoughData = (transactionCount || 0) >= MIN_TRANSACTIONS;

  const generate = async () => {
    if (!hasEnoughData) return;
    setLoading(true);
    setError('');
    const savingsRate = monthIncome > 0 ? ((1 - monthExpenses / monthIncome) * 100).toFixed(0) : 0;
    const topCats = [...catData].sort((a, b) => b.spent - a.spent).slice(0, 5).map(c => `${c.name}: $${c.spent.toFixed(0)}`).join(', ');
    const budgetWarnings = catData.filter(c => c.budget > 0 && c.spent > c.budget * 0.85).map(c => `${c.name} (${Math.round((c.spent / c.budget) * 100)}% used)`).join(', ');
    const goalSummary = goals?.length ? goals.map(g => `${g.name}: ${Math.round(((g.current_amount || 0) / g.target_amount) * 100)}% complete`).join(', ') : 'No goals set';
    const spendingChange = lastMonthExpenses > 0 ? (((monthExpenses - lastMonthExpenses) / lastMonthExpenses) * 100).toFixed(0) : null;

    try {
      const result = await base44.integrations.Core.InvokeLLM({
        prompt: `You are a precise personal finance coach. Analyze this user's finances and respond ONLY with valid JSON. No markdown, no code blocks, just raw JSON.

User data:
- Monthly income: $${monthIncome.toFixed(0)}
- Monthly spending: $${monthExpenses.toFixed(0)}
- Savings rate: ${savingsRate}%
- Spending vs last month: ${spendingChange !== null ? `${spendingChange > 0 ? '+' : ''}${spendingChange}%` : 'unknown'}
- Top spending categories: ${topCats || 'No data'}
- Budget warnings: ${budgetWarnings || 'None'}
- Savings goals: ${goalSummary}

Return exactly this JSON structure (keep all text under 20 words each):
{
  "summary": "1-sentence plain-English summary of their finances",
  "insights": ["insight 1", "insight 2", "insight 3"],
  "warning": "one specific warning if a real issue exists, otherwise null",
  "action": "one concrete action to take today"
}`,
        response_json_schema: {
          type: 'object',
          properties: {
            summary: { type: 'string' },
            insights: { type: 'array', items: { type: 'string' } },
            warning: { type: 'string' },
            action: { type: 'string' },
          }
        }
      });

      setBriefing(result);
      const now = new Date().toISOString();
      setLastUpdated(now);

      // Save/update cache
      if (cacheId) {
        await base44.entities.AIInsightCache.update(cacheId, { content: result, date: TODAY });
      } else {
        const saved = await base44.entities.AIInsightCache.create({ type: 'briefing', date: TODAY, content: result });
        setCacheId(saved.id);
      }
    } catch {
      setError("Couldn't generate this insight. Try again.");
    }
    setLoading(false);
  };

  if (!FEATURES.aiBriefing) return null;
  if (!cacheChecked) return null;

  return (
    <div className="bg-gradient-to-br from-primary/8 via-card to-card border border-primary/15 rounded-2xl p-4">
      <div className="flex items-center gap-2.5 mb-3">
        <div className="w-8 h-8 gradient-primary rounded-xl flex items-center justify-center shrink-0">
          <Sparkles className="w-4 h-4 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-foreground">AI Money Briefing</p>
          {lastUpdated && (
            <p className="text-[10px] text-muted-foreground flex items-center gap-1">
              <Clock className="w-2.5 h-2.5" /> Updated {format(new Date(lastUpdated), 'h:mm a')}
            </p>
          )}
        </div>
        {briefing && (
          <button onClick={generate} disabled={loading} className="text-muted-foreground hover:text-foreground transition-colors shrink-0 p-1 disabled:opacity-40">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        )}
      </div>

      {!hasEnoughData && (
        <div className="flex items-center gap-2 bg-secondary/60 rounded-xl p-3">
          <Sparkles className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          <p className="text-xs text-muted-foreground">Add a few transactions to unlock smarter insights.</p>
        </div>
      )}

      {hasEnoughData && error && (
        <div className="flex items-center gap-2 bg-destructive/10 border border-destructive/20 rounded-xl p-3 mb-2">
          <AlertTriangle className="w-3.5 h-3.5 text-destructive shrink-0" />
          <p className="text-xs text-destructive flex-1">{error}</p>
          <button onClick={generate} className="text-xs font-semibold text-destructive underline shrink-0">Retry</button>
        </div>
      )}

      {hasEnoughData && loading && (
        <div className="flex items-center gap-2 py-2">
          <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin shrink-0" />
          <p className="text-sm text-muted-foreground">Generating your AI briefing…</p>
        </div>
      )}

      {hasEnoughData && briefing && !loading && (
        <div className="space-y-3">
          <p className="text-sm leading-relaxed text-foreground font-medium">{briefing.summary}</p>
          {briefing.insights?.length > 0 && (
            <div className="space-y-1.5">
              {briefing.insights.slice(0, 3).map((insight, i) => (
                <div key={i} className="flex items-start gap-2">
                  <TrendingUp className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
                  <p className="text-xs text-foreground leading-relaxed">{insight}</p>
                </div>
              ))}
            </div>
          )}
          {briefing.warning && (
            <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl p-3">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-700 leading-relaxed">{briefing.warning}</p>
            </div>
          )}
          {briefing.action && (
            <div className="flex items-start gap-2 bg-emerald-50 border border-emerald-200 rounded-xl p-3">
              <Lightbulb className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
              <p className="text-xs text-emerald-700 font-medium leading-relaxed">Today's action: {briefing.action}</p>
            </div>
          )}
        </div>
      )}

      {hasEnoughData && !briefing && !loading && !error && (
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">Get a personalized summary of your finances.</p>
          <button
            onClick={generate}
            disabled={loading}
            className="shrink-0 flex items-center gap-1.5 bg-primary text-primary-foreground text-xs font-semibold px-4 py-2.5 rounded-xl active:opacity-70 transition-opacity disabled:opacity-40"
          >
            <Zap className="w-3.5 h-3.5" />
            Generate
          </button>
        </div>
      )}
    </div>
  );
}