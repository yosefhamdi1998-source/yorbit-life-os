import { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { toast } from '@/components/ui/use-toast';
import { Brain, CheckCircle, AlertCircle, Target, Calendar, RefreshCw, Loader2, Sparkles, Clock, MessageCircle, Lock, Zap } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useProStatus } from '@/hooks/useProStatus';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import PageHeader from '@/components/PageHeader';
import AdvisorChat from '@/components/finance/AdvisorChat';
import { format } from 'date-fns';
import AiConsentGate from '@/components/AiConsentGate';
// Both of these were USED in this file and imported in none of it. The page
// threw ReferenceError on render and every user who opened the AI Coach - the
// feature the Go Pro button sells - got the error boundary instead. `npm run
// lint` reported zero problems the whole time, because the flat config's
// `rules` key was overwriting the recommended set and switching off no-undef.
// See the note in eslint.config.js.
import { savingsRate as computeSavingsRate, savingsRateLabel } from '@/lib/periods';

const TODAY = format(new Date(), 'yyyy-MM-dd');
const MIN_TRANSACTIONS = 3;

export default function Coach() {
  const [transactions, setTransactions] = useState([]);
  const [budgets, setBudgets] = useState([]);
  const [goals, setGoals] = useState([]);
  const [advice, setAdvice] = useState(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const [cacheId, setCacheId] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const autoGenRef = useRef(false);
  const { isPro, loading: proStatusLoading } = useProStatus();

  const thisMonth = format(new Date(), 'yyyy-MM');

  useEffect(() => {
    Promise.all([
      base44.entities.Transaction.list('-date', 200),
      base44.entities.Budget.list(),
      base44.entities.SavingsGoal.list(),
      base44.entities.AIInsightCache.filter({ type: 'coach', date: TODAY }, '-created_date', 1),
    ]).then(([tx, b, g, cache]) => {
      setTransactions(tx);
      setBudgets(b);
      setGoals(g);
      if (cache.length > 0) {
        setAdvice(cache[0].content);
        setCacheId(cache[0].id);
        setLastUpdated(cache[0].created_date);
      }
      setLoading(false);
    }).catch(() => {
      setLoading(false);
      toast({ title: "Couldn't load your data", description: 'Please try again in a moment.', variant: 'destructive' });
    });
  }, []);

  const monthTx = transactions.filter(t => t.date?.startsWith(thisMonth));
  const monthExpenses = monthTx.filter(t => t.type === 'expense').reduce((s, t) => s + (t.amount || 0), 0);
  const monthIncome = monthTx.filter(t => t.type === 'income').reduce((s, t) => s + (t.amount || 0), 0);
  // >= 1 not > 0: a fraction-of-a-cent "income" row shouldn't blow this up
  // into a five-figure percentage.
  const savingsRate = computeSavingsRate(monthIncome, monthExpenses);

  const EXPENSE_CATS = ['housing', 'food', 'transport', 'entertainment', 'health', 'shopping', 'education', 'other'];
  const catData = EXPENSE_CATS.map(cat => ({
    name: cat,
    spent: monthTx.filter(t => t.type === 'expense' && t.category === cat).reduce((s, t) => s + (t.amount || 0), 0),
  })).filter(d => d.spent > 0);

  const hasEnoughData = transactions.length >= MIN_TRANSACTIONS;

  // Auto-generate today's plan once everything has loaded and there's no cached
  // insight yet. (The previous version read `isPro` inside the mount effect,
  // where it was still false while the Pro check was in flight — so the plan
  // never auto-generated for Pro users.)
  useEffect(() => {
    if (loading || proStatusLoading || !isPro) return;
    if (advice || generating || !hasEnoughData || autoGenRef.current) return;
    autoGenRef.current = true;
    getAdvice();
  }, [loading, proStatusLoading, isPro, advice, generating, hasEnoughData]);

  const getAdvice = async () => {
    if (!isPro || !hasEnoughData) return;
    setGenerating(true);
    setError('');
    const budgetStatus = catData.map(c => {
      const b = budgets.find(b => b.category === c.name && b.month === thisMonth);
      return b
        ? `${c.name}: $${c.spent.toFixed(0)} of $${b.monthly_limit} (${Math.round((c.spent / b.monthly_limit) * 100)}%)`
        : `${c.name}: $${c.spent.toFixed(0)} (no budget set)`;
    }).join(', ');

    try {
      const result = await base44.integrations.Core.InvokeLLM({
        prompt: `You are a friendly personal finance coach helping a regular person manage their money. Respond ONLY with valid JSON — no markdown, no code blocks.

User finances:
- Regular income this month: $${monthIncome.toFixed(0)}
- Total spending this month: $${monthExpenses.toFixed(0)}
- Savings rate: ${savingsRate === null ? "unknown (recorded income is too small to compute one)" : savingsRate + "%"}
- Spending by category: ${budgetStatus || 'no data yet'}
- Savings goals: ${goals?.filter(g => g.target_amount > 0).map(g => `${g.name}: ${Math.round(((g.current_amount || 0) / g.target_amount) * 100)}%`).join(', ') || 'none set'}

Return exactly this JSON (each item max 18 words, reference real numbers):
{
  "going_well": ["item 1", "item 2"],
  "needs_attention": ["item 1", "item 2"],
  "next_move": "One specific action with a dollar amount",
  "weekly_plan": ["Mon-Tue", "Wed-Thu", "Fri-Sun"]
}`,
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
      const now = new Date().toISOString();
      setLastUpdated(now);

      if (cacheId) {
        await base44.entities.AIInsightCache.update(cacheId, { content: result, date: TODAY });
      } else {
        const saved = await base44.entities.AIInsightCache.create({ type: 'coach', date: TODAY, content: result });
        setCacheId(saved.id);
      }
    } catch (err) {
      // Was a hardcoded generic message regardless of cause — including
      // when the reason was the monthly spend cap, where "Try again"
      // is actively misleading (it won't work again until next month).
      // invokeFunction already extracts a clean, user-safe message from
      // the edge function's response; use it when there is one.
      setError(err?.message || "Couldn't generate this insight. Try again.");
    }
    setGenerating(false);
  };

  if (loading || proStatusLoading) {
    return (
      <div className="py-4 space-y-3">
        {[1,2,3].map(i => <div key={i} className="h-24 rounded-2xl bg-secondary animate-pulse" />)}
      </div>
    );
  }

  if (!isPro) {
    return (
      <div className="py-4 pb-8">
        <PageHeader
          title="AI Coach"
          subtitle="Personalized financial guidance, powered by AI"
          icon={Brain}
          gradient="gradient-primary"
        />
        <div
          className="rounded-3xl p-6 text-center"
          style={{ background: 'linear-gradient(135deg, var(--hero-from) 0%, var(--hero-via) 50%, var(--hero-to) 100%)' }}
        >
          <div className="w-16 h-16 bg-white/20 rounded-3xl flex items-center justify-center mx-auto mb-4">
            <Lock className="w-8 h-8 text-white" strokeWidth={1.6} />
          </div>
          <h3 className="text-xl font-black text-white mb-2">Pro Feature</h3>
          <p className="text-white/70 text-sm mb-5 leading-relaxed">
            AI Coach, daily briefings, and personalized guidance are part of Yorbit Pro.
          </p>
          <Link to="/upgrade">
            <Button className="bg-white text-primary hover:bg-white/90 gap-2 font-bold h-11">
              <Zap className="w-4 h-4 text-yellow-500" /> Upgrade to Pro
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="py-4 pb-8">
      <PageHeader
        title="AI Coach"
        subtitle="Personalized financial guidance, powered by AI"
        icon={Brain}
        gradient="gradient-primary"
      />

      {/* Nothing below this line may reach Anthropic until the account
          holder has been told what is sent and has agreed. The edge function
          enforces the same rule server-side; this is the part that explains
          it and offers the choice. */}
      <AiConsentGate featureName="AI Coach">
      <Tabs defaultValue="advisor">
        <TabsList className="w-full grid grid-cols-2 mb-4">
          <TabsTrigger value="advisor" className="gap-1.5">
            <MessageCircle className="w-3.5 h-3.5" /> Advisor Chat
          </TabsTrigger>
          <TabsTrigger value="plan" className="gap-1.5">
            <Brain className="w-3.5 h-3.5" /> Coaching Plan
          </TabsTrigger>
        </TabsList>

        {/* ── Advisor Chat Tab ─────────────────────────────────────── */}
        <TabsContent value="advisor">
          <AdvisorChat />
        </TabsContent>

        {/* ── Coaching Plan Tab ────────────────────────────────────── */}
        <TabsContent value="plan">
          {!hasEnoughData ? (
            <div className="space-y-4">
              <div
                className="rounded-3xl p-6 relative overflow-hidden"
                style={{ background: 'linear-gradient(135deg, var(--hero-from) 0%, var(--hero-to) 100%)' }}
              >
                <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-3xl">
                  <div className="aurora-blob aurora-sky2" style={{ opacity: 0.4 }} />
                </div>
                <div className="relative z-10 text-center">
                  <div className="w-16 h-16 bg-white/20 rounded-3xl flex items-center justify-center mx-auto mb-4">
                    <Brain className="w-8 h-8 text-white" strokeWidth={1.6} />
                  </div>
                  <h3 className="text-xl font-black text-white mb-2">Your AI Coach is Ready</h3>
                  <p className="text-white/70 text-sm mb-5 leading-relaxed">Add at least 3 transactions and come back for a personalized coaching plan built around your real numbers.</p>
                  <div className="space-y-2">
                    {['Add 3+ transactions', 'Optionally set a budget', 'Come back here'].map((step, i) => (
                      <div key={i} className="flex items-center gap-3 rounded-xl px-4 py-2.5 text-left" style={{ background: 'rgba(255,255,255,0.15)' }}>
                        <div className="w-6 h-6 rounded-full flex items-center justify-center shrink-0" style={{ background: 'rgba(255,255,255,0.2)' }}>
                          <span className="text-xs font-black text-white">{i + 1}</span>
                        </div>
                        <span className="text-sm text-white font-medium">{step}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <div className="sky-card rounded-2xl p-4">
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">What you'll get</p>
                {[
                  { icon: '✅', text: "What's working in your finances" },
                  { icon: '⚠️', text: 'What needs your attention right now' },
                  { icon: '🎯', text: 'A specific next step with a dollar amount' },
                  { icon: '📅', text: 'A weekly action plan tailored to you' },
                ].map(({ icon, text }) => (
                  <div key={text} className="flex items-center gap-2.5 py-2 border-b border-border/50 last:border-0">
                    <span className="text-base">{icon}</span>
                    <span className="text-sm text-foreground">{text}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Stats snapshot */}
              <div className="grid grid-cols-3 gap-3">
                <div className="sky-card rounded-2xl p-3 text-center">
                  <p className="text-lg font-black text-emerald-500">${monthIncome > 0 ? (monthIncome / 1000).toFixed(1) : '0'}k</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">Income</p>
                </div>
                <div className="sky-card rounded-2xl p-3 text-center">
                  <p className="text-lg font-black text-red-500">${monthExpenses > 0 ? (monthExpenses / 1000).toFixed(1) : '0'}k</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">Spending</p>
                </div>
                <div className="sky-card rounded-2xl p-3 text-center">
                  <p className={`text-lg font-black ${savingsRate === null ? 'text-muted-foreground' : savingsRate >= 20 ? 'text-emerald-500' : 'text-amber-500'}`}>{savingsRateLabel(savingsRate)}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">Savings Rate</p>
                </div>
              </div>

              {!advice && !generating && !error && (
                <div className="bg-gradient-to-br from-primary/10 to-card border border-primary/20 rounded-2xl p-5 text-center">
                  <div className="w-12 h-12 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-3">
                    <Sparkles className="w-6 h-6 text-primary" />
                  </div>
                  <p className="font-bold text-sm mb-1">Get your coaching plan</p>
                  <p className="text-xs text-muted-foreground mb-4">Based on your real spending, budgets, and goals.</p>
                  <Button onClick={getAdvice} disabled={generating} className="bg-primary hover:bg-primary/90 text-primary-foreground border-0 gap-2">
                    <Brain className="w-4 h-4" /> Generate Plan
                  </Button>
                </div>
              )}

              {generating && (
                <div className="sky-card rounded-2xl p-6 flex items-center gap-3">
                  <Loader2 className="w-5 h-5 text-primary animate-spin shrink-0" />
                  <p className="text-sm text-muted-foreground">Building your personalized coaching plan…</p>
                </div>
              )}

              {error && !generating && (
                <div className="bg-red-50 border border-red-200 rounded-2xl p-4">
                  <p className="text-sm text-red-600 mb-2">{error}</p>
                  <button onClick={getAdvice} disabled={generating} className="text-xs font-semibold text-red-600 flex items-center gap-1">
                    <RefreshCw className="w-3 h-3" /> Try again
                  </button>
                </div>
              )}

              {advice && !generating && (
                <div className="space-y-3">
                  {lastUpdated && (
                    <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                      <Clock className="w-3 h-3" />
                      Last updated {format(new Date(lastUpdated), 'MMM d, h:mm a')} · cached today
                    </div>
                  )}

                  {advice.going_well?.length > 0 && (
                    <div className="rounded-2xl overflow-hidden" style={{ background: 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)', border: '1px solid #bbf7d0' }}>
                      <div className="px-4 py-3 border-b border-emerald-100">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 bg-emerald-500 rounded-full flex items-center justify-center">
                            <CheckCircle className="w-3.5 h-3.5 text-white" />
                          </div>
                          <p className="text-xs font-bold text-emerald-700 uppercase tracking-wider">What's Working 🎉</p>
                        </div>
                      </div>
                      <div className="p-4 space-y-2.5">
                        {advice.going_well.map((item, i) => (
                          <div key={i} className="flex items-start gap-2.5">
                            <span className="text-emerald-500 shrink-0 mt-0.5">✓</span>
                            <p className="text-sm text-gray-800 leading-snug">{item}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {advice.needs_attention?.length > 0 && (
                    <div className="rounded-2xl overflow-hidden" style={{ background: 'linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)', border: '1px solid #fde68a' }}>
                      <div className="px-4 py-3 border-b border-amber-100">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 bg-amber-500 rounded-full flex items-center justify-center">
                            <AlertCircle className="w-3.5 h-3.5 text-white" />
                          </div>
                          <p className="text-xs font-bold text-amber-700 uppercase tracking-wider">Needs Your Attention ⚠️</p>
                        </div>
                      </div>
                      <div className="p-4 space-y-2.5">
                        {advice.needs_attention.map((item, i) => (
                          <div key={i} className="flex items-start gap-2.5">
                            <span className="text-amber-500 shrink-0 mt-0.5">!</span>
                            <p className="text-sm text-gray-800 leading-snug">{item}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {advice.next_move && (
                    <div className="rounded-2xl p-4" style={{ background: 'linear-gradient(135deg, var(--hero-from) 0%, var(--hero-to) 100%)' }}>
                      <div className="flex items-center gap-2 mb-2">
                        <Target className="w-4 h-4 text-white/80" />
                        <p className="text-xs font-bold text-white/80 uppercase tracking-wider">Your #1 Next Move 🎯</p>
                      </div>
                      <p className="text-base text-white font-bold leading-snug">{advice.next_move}</p>
                    </div>
                  )}

                  {advice.weekly_plan?.length > 0 && (
                    <div className="rounded-2xl p-4" style={{ background: '#f8faff', border: '1px solid #e2e8f0' }}>
                      <div className="flex items-center gap-2 mb-3">
                        <Calendar className="w-4 h-4 text-primary" />
                        <p className="text-xs font-bold text-gray-800 uppercase tracking-wider">This Week's Action Plan 📅</p>
                      </div>
                      <div className="space-y-2.5">
                        {advice.weekly_plan.map((step, i) => (
                          <div key={i} className="flex items-start gap-3">
                            <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                              <span className="text-xs font-black text-primary">{i + 1}</span>
                            </div>
                            <p className="text-sm text-gray-800 leading-snug">{step}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <button
                    onClick={getAdvice}
                    disabled={generating}
                    className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
                  >
                    <RefreshCw className="w-3 h-3" /> Refresh Insight
                  </button>
                </div>
              )}
            </div>
          )}
        </TabsContent>
      </Tabs>
      </AiConsentGate>
    </div>
  );
}