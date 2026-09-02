import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import PullToRefreshIndicator from '@/components/PullToRefreshIndicator';
import { format, differenceInDays, parseISO, startOfDay } from 'date-fns';
import { filterByPeriod, filterByPreviousPeriod, sumByType, getPeriodLabel, getPeriodPhrase } from '@/lib/periods';
import { computeHealthScore } from '@/lib/financialHealth';
import FinancialHealthScore from '@/components/dashboard/FinancialHealthScore';
import WhatsNextCard from '@/components/dashboard/WhatsNextCard';
import { DollarSign, Plus, ChevronRight, ChevronDown, ArrowRight, Receipt, Zap, TrendingUp, TrendingDown, Sparkles, Repeat } from 'lucide-react';
import BudgetSummaryCard from '@/components/dashboard/BudgetSummaryCard';
import CategoryBreakdownCard from '@/components/dashboard/CategoryBreakdownCard';
import QuickAddTransactionSheet from '@/components/dashboard/QuickAddTransactionSheet';
import useAutoOpenForm from '@/hooks/useAutoOpenForm';
import Sparkline from '@/components/Sparkline';
import AnimatedNumber from '@/components/AnimatedNumber';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';

const CAT_ICONS = { housing: '🏠', food: '🍔', transport: '🚗', entertainment: '🎬', health: '💊', shopping: '🛍️', education: '📚', savings: '💰', salary: '💵', freelance: '💻', investment: '📈', other: '💸' };
const CAT_BILL_ICONS = { housing: '🏠', utilities: '💡', phone: '📱', insurance: '🛡️', subscription: '📺', credit_card: '💳', loan: '🏦', other: '💸' };
// Tinted icon chips instead of uniform gray — a small thing that reads as
// considerably less flat across a whole list of rows.
const CAT_TINT = {
  housing: 'bg-violet-500/12 text-violet-600 dark:text-violet-400',
  food: 'bg-orange-500/12 text-orange-600 dark:text-orange-400',
  transport: 'bg-blue-500/12 text-blue-600 dark:text-blue-400',
  entertainment: 'bg-pink-500/12 text-pink-600 dark:text-pink-400',
  health: 'bg-red-500/12 text-red-600 dark:text-red-400',
  shopping: 'bg-amber-500/12 text-amber-600 dark:text-amber-400',
  education: 'bg-emerald-500/12 text-emerald-600 dark:text-emerald-400',
  savings: 'bg-emerald-500/12 text-emerald-600 dark:text-emerald-400',
  salary: 'bg-emerald-500/12 text-emerald-600 dark:text-emerald-400',
  freelance: 'bg-indigo-500/12 text-indigo-600 dark:text-indigo-400',
  investment: 'bg-sky-500/12 text-sky-600 dark:text-sky-400',
  utilities: 'bg-amber-500/12 text-amber-600 dark:text-amber-400',
  phone: 'bg-sky-500/12 text-sky-600 dark:text-sky-400',
  insurance: 'bg-blue-500/12 text-blue-600 dark:text-blue-400',
  subscription: 'bg-pink-500/12 text-pink-600 dark:text-pink-400',
  credit_card: 'bg-red-500/12 text-red-600 dark:text-red-400',
  loan: 'bg-orange-500/12 text-orange-600 dark:text-orange-400',
  other: 'bg-slate-500/12 text-slate-600 dark:text-slate-400',
};

function fmt(n) {
  return (n || 0).toLocaleString('en-US', { maximumFractionDigits: 0 });
}

const HEALTH_SCORE_CATS = ['housing', 'food', 'transport', 'entertainment', 'health', 'shopping', 'education', 'savings', 'investment', 'other'];

export default function Dashboard() {
  const [transactions, setTransactions] = useState([]);
  const [budgets, setBudgets] = useState([]);
  const [savingsGoals, setSavingsGoals] = useState([]);
  const [bills, setBills] = useState([]);
  const [netWorthEntries, setNetWorthEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [cashFlowPeriod, setCashFlowPeriod] = useState('month'); // 'week' | 'month' | `year-${YYYY}`
  const navigate = useNavigate();

  const thisMonth = format(new Date(), 'yyyy-MM');

  const loadData = useCallback(async () => {
    try {
      const [tr, b, sg, bl, nw] = await Promise.all([
        base44.entities.Transaction.list('-date', 1000),
        base44.entities.Budget.list(),
        base44.entities.SavingsGoal.list(),
        base44.entities.Bill.list('due_date', 20),
        base44.entities.NetWorthEntry.list(),
      ]);
      setTransactions(tr); setBudgets(b); setSavingsGoals(sg); setBills(bl); setNetWorthEntries(nw);
      return { tr, b, sg, bl, nw };
    } catch {
      toast({ title: "Couldn't load your data", description: "Please try again in a moment.", variant: 'destructive' });
      return null; // null = load failed (distinct from "user has no data")
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!localStorage.getItem('onboarding_done')) {
      loadData().then((result) => {
        if (!result) return; // network error — don't mistake it for a brand-new user
        const { tr, b, sg, bl } = result;
        const hasData = tr.length > 0 || b.length > 0 || sg.length > 0 || bl.length > 0;
        if (!hasData) navigate('/onboarding', { replace: true });
      });
    } else {
      loadData();
    }
  }, [loadData]);

  const { pullY, refreshing, threshold } = usePullToRefresh(loadData);
  useAutoOpenForm(() => setQuickAddOpen(true));

  const handleQuickAdd = async (data) => {
    try {
      await base44.entities.Transaction.create(data);
      toast({ title: 'Transaction added', description: `$${data.amount} · ${data.category}` });
      await loadData();
    } catch {
      toast({ title: "Couldn't save transaction", description: "Please try again in a moment.", variant: 'destructive' });
      throw new Error('save failed');
    }
  };

  const monthTx = transactions.filter(t => t.date?.startsWith(thisMonth));
  const monthExpenses = monthTx.filter(t => t.type === 'expense').reduce((s, t) => s + (t.amount || 0), 0);
  const monthIncome = monthTx.filter(t => t.type === 'income').reduce((s, t) => s + (t.amount || 0), 0);
  const netSaved = monthIncome - monthExpenses;
  const savingsRate = monthIncome > 0 ? Math.round((netSaved / monthIncome) * 100) : 0;
  const totalAssets = netWorthEntries.filter(e => e.type === 'asset').reduce((s, e) => s + (e.value || 0), 0);
  const totalLiabilities = netWorthEntries.filter(e => e.type === 'liability').reduce((s, e) => s + (e.value || 0), 0);
  const netWorth = totalAssets - totalLiabilities;

  const isNewUser = transactions.length === 0 && budgets.length === 0 && savingsGoals.length === 0;

  // Anchor "recent" windows to the newest transaction on record, not the
  // literal calendar date — imported/historical data can trail today's
  // real date by weeks, and a trailing window counted from "right now"
  // would show a flat $0 for anyone whose last transaction isn't from
  // the last few days (same bug fixed on the Money page's Weekly/Bi-Weekly).
  const latestTxDate = (() => {
    let latest = null;
    for (const t of transactions) {
      if (t.date && (!latest || t.date > latest)) latest = t.date;
    }
    return latest ? parseISO(latest) : new Date();
  })();


  // The hero figures (net saved / income / expenses / savings rate) follow
  // the same period switcher as the chart below it, instead of always
  // being locked to the literal calendar month — a fresh month with no
  // transactions yet used to make the whole hero read as "$0, broken."
  // Uses the shared periods.js module — the one canonical Week/Month/
  // Year/Last Year implementation, also used by Goals and Save More.
  const heroTx = filterByPeriod(transactions, cashFlowPeriod, latestTxDate);
  const { income: heroIncome, expenses: heroExpenses, net: heroNetSaved } = sumByType(heroTx);
  const heroSavingsRate = heroIncome > 0 ? Math.round((heroNetSaved / heroIncome) * 100) : 0;
  const heroPeriodLabel = getPeriodLabel(cashFlowPeriod);
  const heroPeriodPhrase = getPeriodPhrase(cashFlowPeriod);
  const isYearPeriod = cashFlowPeriod.startsWith('year-');
  // Same trailing-4-years list as the Yearly picker on Money, so the two
  // don't quietly offer a different range of history.
  const thisYearNum = new Date().getFullYear();
  const YEAR_OPTIONS = [thisYearNum, thisYearNum - 1, thisYearNum - 2, thisYearNum - 3];

  // Same period, one step back — powers the Savings Progress comparison
  // and the Financial Health Score's "why it changed" explanation.
  const prevTx = filterByPreviousPeriod(transactions, cashFlowPeriod, latestTxDate);
  const prevSums = sumByType(prevTx);

  // Budget adherence input for the Health Score — same "only count
  // categories that actually have a limit" rule as BudgetSummaryCard.
  const budgetedRows = HEALTH_SCORE_CATS
    .map(cat => ({
      cat,
      spent: monthTx.filter(t => t.type === 'expense' && t.category === cat).reduce((s, t) => s + (t.amount || 0), 0),
      limit: budgets.find(b => b.category === cat && b.month === thisMonth)?.monthly_limit || 0,
    }))
    .filter(r => r.limit > 0);

  const overdueBillCount = bills.filter(b => !b.is_paid && b.due_date && new Date(b.due_date) < new Date()).length;

  const healthScore = computeHealthScore({
    heroIncome, heroExpenses, prevIncome: prevSums.income, prevExpenses: prevSums.expenses, prevTxCount: prevTx.length, budgetedRows, bills,
  });

  // Cheapest possible "what's driving spend" signal for the What's Next
  // fallback — the full breakdown lives on the new Save More page.
  const spendByCat = {};
  for (const t of heroTx) {
    if (t.type === 'expense') spendByCat[t.category || 'other'] = (spendByCat[t.category || 'other'] || 0) + (t.amount || 0);
  }
  const topSaveMoreCategory = Object.entries(spendByCat)
    .map(([cat, spent]) => ({ cat, spent }))
    .sort((a, b) => b.spent - a.spent)[0] || null;

  // Net worth as it was actually recorded over time: entries in the order
  // they were added, accumulated. Not a projection — every point is a real
  // state the account was in. Needs 2+ points to say anything, so it stays
  // hidden until then.
  const netWorthTrend = (() => {
    if (netWorthEntries.length < 2) return [];
    const sorted = [...netWorthEntries]
      .filter(e => e.created_date)
      .sort((a, b) => new Date(a.created_date) - new Date(b.created_date));
    if (sorted.length < 2) return [];
    let running = 0;
    return sorted.map(e => {
      running += e.type === 'liability' ? -(e.value || 0) : (e.value || 0);
      return running;
    });
  })();

  // Local midnight, so "Due in Nd" counts calendar days (a bill due tomorrow
  // showed "Due in 0d" when compared against the current time of day).
  const today = startOfDay(new Date());
  const upcomingBills = bills
    .filter(b => !b.is_paid && b.due_date)
    .filter(b => {
      try { const diff = differenceInDays(parseISO(b.due_date), today); return diff >= -1 && diff <= 14; }
      catch { return false; }
    })
    .sort((a, b) => new Date(a.due_date) - new Date(b.due_date))
    .slice(0, 3);

  if (loading) {
    return (
      <div className="pt-4 space-y-4">
        <div className="h-40 rounded-2xl bg-gradient-to-br from-blue-200/60 to-purple-200/60 animate-pulse" />
        <div className="h-24 rounded-2xl bg-secondary/60 animate-pulse" />
        <div className="h-32 rounded-2xl bg-secondary/60 animate-pulse" />
      </div>
    );
  }

  return (
    <div className="pb-8 overflow-x-hidden">
      <PullToRefreshIndicator pullY={pullY} refreshing={refreshing} threshold={threshold} />

      {/* Opened from the shared quick-action button in the layout. This page
          used to render its own floating button at the identical position,
          where the layout's button covered it completely and swallowed every
          tap. */}
      <QuickAddTransactionSheet open={quickAddOpen} onClose={() => setQuickAddOpen(false)} onSave={handleQuickAdd} />

      {/* ── Hero ──────────────────────────────────────────────────────
          A flat stat row read as sterile on its own — this is the one
          moment on the page that gets real color, everything below stays
          calm so the gradient has somewhere to land. */}
      <div
        className="mt-5 mb-5 rounded-3xl overflow-hidden relative"
        style={{
          background: 'linear-gradient(135deg, var(--hero-from) 0%, var(--hero-via) 55%, var(--hero-to) 100%)',
          // Some themes' gradient runs bright at one end (gold, sand) — a
          // flat white number stays crisp at the dark end but washes out
          // against those. A soft dark shadow (inherited by every white
          // text node below) keeps it legible across all 9 themes without
          // trading away contrast on the dark end, the way switching to a
          // fixed dark-gray would.
          textShadow: '0 1px 10px rgba(0,0,0,0.35)',
        }}
      >
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div className="aurora-blob aurora-sky1" style={{ opacity: 0.45 }} />
          <div className="aurora-blob aurora-sky2" style={{ opacity: 0.35 }} />
        </div>
        <div className="relative px-5 pt-5 pb-5 lg:px-8 lg:pt-7 lg:pb-7">
          <div className="flex items-center justify-between mb-4">
            <p className="text-white/60 text-[11px] font-semibold uppercase tracking-widest">
              {heroPeriodLabel}
            </p>
            <Link to="/upgrade">
              <div className="flex items-center gap-1.5 bg-white/15 hover:bg-white/25 transition-colors rounded-full px-3 py-1.5">
                <Zap className="w-3.5 h-3.5 text-yellow-300" />
                <span className="text-white text-xs font-bold">Go Pro</span>
              </div>
            </Link>
          </div>

          {/* Period switcher lives right in the hero — same idea as the
              date-range switcher on Money, so the top of Home isn't just
              a static snapshot with nowhere to go. Yearly is a dropdown
              (not just "Year"/"Last Year" chips) so any past year is one
              tap away, same as the Yearly picker on Money. */}
          <div className="flex gap-1.5 mb-4 overflow-x-auto">
            {[{ key: 'week', label: 'Week' }, { key: 'month', label: 'Month' }].map(p => (
              <button
                key={p.key}
                onClick={() => setCashFlowPeriod(p.key)}
                className={`shrink-0 text-[11px] font-semibold px-2.5 py-1 rounded-full border transition-all ${cashFlowPeriod === p.key ? 'bg-white text-primary border-white' : 'bg-white/10 border-white/20 text-white/70 hover:bg-white/15'}`}
              >
                {p.label}
              </button>
            ))}
            <div className="relative shrink-0">
              <select
                value={isYearPeriod ? cashFlowPeriod : ''}
                onChange={e => setCashFlowPeriod(e.target.value)}
                className={`appearance-none text-[11px] font-semibold pl-2.5 pr-6 py-1 rounded-full border transition-all cursor-pointer ${isYearPeriod ? 'bg-white text-primary border-white' : 'bg-white/10 border-white/20 text-white/70'}`}
                style={{ WebkitTapHighlightColor: 'transparent' }}
              >
                <option value="" disabled>Yearly</option>
                {YEAR_OPTIONS.map(y => <option key={y} value={`year-${y}`}>{y}</option>)}
              </select>
              <ChevronDown className={`absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 pointer-events-none ${isYearPeriod ? 'text-primary' : 'text-white/70'}`} />
            </div>
          </div>

          <p className="text-white/55 text-xs font-medium mb-1">Net saved {heroPeriodPhrase}</p>
          <p className="font-numeric text-white text-4xl lg:text-6xl font-black tracking-tight leading-none mb-1.5 tabular-nums">
            {heroNetSaved >= 0 ? '+' : '−'}<AnimatedNumber prefix="$" value={Math.abs(heroNetSaved)} />
          </p>
          <p className="text-white/70 text-xs font-semibold mb-5 h-4">
            {prevTx.length > 0 && Math.abs(heroNetSaved - prevSums.net) >= 1 &&
              `${heroNetSaved - prevSums.net >= 0 ? '+' : '−'}$${fmt(Math.abs(heroNetSaved - prevSums.net))} vs. last period`}
          </p>

          <div className="grid grid-cols-3 gap-2.5">
            <div className="bg-white/10 rounded-xl px-3 py-2.5">
              <p className="text-white/55 text-[10px] font-semibold uppercase tracking-wide mb-0.5">Income</p>
              <p className="text-white font-black text-base leading-tight tabular-nums truncate">
                <AnimatedNumber prefix="$" value={heroIncome} />
              </p>
            </div>
            <div className="bg-white/10 rounded-xl px-3 py-2.5">
              <p className="text-white/55 text-[10px] font-semibold uppercase tracking-wide mb-0.5">Expenses</p>
              <p className="text-white font-black text-base leading-tight tabular-nums truncate">
                <AnimatedNumber prefix="$" value={heroExpenses} />
              </p>
            </div>
            <div className="bg-white/10 rounded-xl px-3 py-2.5">
              <p className="text-white/55 text-[10px] font-semibold uppercase tracking-wide mb-0.5">Savings rate</p>
              <p className="text-white font-black text-base leading-tight tabular-nums truncate">{heroSavingsRate}%</p>
            </div>
          </div>
        </div>
      </div>

      {/* Health Score + What's Next, one card instead of two — the "vs
          last period" comparison that used to be its own card now lives
          as a line under the hero number above instead of a 3rd section. */}
      <div className="sky-card rounded-2xl p-4 lg:p-5 mb-5 divide-y divide-border/50">
        {(heroTx.length > 0 || budgetedRows.length > 0) && (
          <div className="pb-4">
            <FinancialHealthScore score={healthScore.score} label={healthScore.label} explanation={healthScore.explanation} bare />
          </div>
        )}
        <div className={(heroTx.length > 0 || budgetedRows.length > 0) ? 'pt-4' : ''}>
          <WhatsNextCard
            overdueBillCount={overdueBillCount}
            heroNetSaved={heroNetSaved}
            fallbackTip={topSaveMoreCategory ? `You spent the most on ${topSaveMoreCategory.cat} this period ($${fmt(topSaveMoreCategory.spent)}) — see Save More for ideas.` : null}
            bare
          />
        </div>
      </div>

      {/* Cash flow chart removed — it was directly redundant with the hero
          above it (same period, same "how did money move" question, just
          drawn instead of numbered), and the deeper daily/weekly view now
          lives on Money > Spending anyway. */}

      {/* Net Worth — same left-aligned label-then-number pattern as the "Net
          saved" hero above it, so the two cards read as one family instead
          of one centered and one edge-pinned. */}
      {netWorthEntries.length > 0 && (
        <div className="mb-5 sky-card rounded-2xl p-4 lg:p-5">
          <div className="flex items-center justify-between mb-1">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Net Worth</p>
            {netWorthTrend.length > 1 && (
              <Sparkline values={netWorthTrend} tone={netWorth >= 0 ? 'positive' : 'negative'} width={72} height={26} />
            )}
          </div>
          <p className={`font-numeric text-3xl lg:text-4xl font-black tabular-nums leading-none mb-4 ${netWorth >= 0 ? 'text-foreground' : 'text-red-500'}`}>
            ${fmt(netWorth)}
          </p>
          <div className="grid grid-cols-2 gap-2.5 pt-4 border-t border-border/50">
            <div className="bg-emerald-500/10 rounded-xl px-3 py-2.5 flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-emerald-500/15 flex items-center justify-center shrink-0">
                <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase text-muted-foreground leading-none mb-1">Assets</p>
                <p className="text-sm lg:text-base font-bold text-emerald-500 tabular-nums leading-none truncate">${fmt(totalAssets)}</p>
              </div>
            </div>
            <div className="bg-red-500/10 rounded-xl px-3 py-2.5 flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-red-500/15 flex items-center justify-center shrink-0">
                <TrendingDown className="w-3.5 h-3.5 text-red-500" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase text-muted-foreground leading-none mb-1">Liabilities</p>
                <p className="text-sm lg:text-base font-bold text-red-500 tabular-nums leading-none truncate">${fmt(totalLiabilities)}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Content sections ──────────────────────────────────────────
          One column on phone; two side-by-side columns from lg up, so
          cards stay a readable width instead of stretching into bands. */}
      <div className="space-y-5 lg:grid lg:grid-cols-2 lg:gap-5 lg:space-y-0 lg:auto-rows-fr [&>*]:lg:h-full">

        {/* Onboarding CTA */}
        {isNewUser && (
          <div className="rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50 to-purple-50 p-4">
            <p className="font-bold text-sm text-foreground mb-0.5">Build your money picture</p>
            <p className="text-xs text-muted-foreground mb-3">Add a transaction to unlock insights.</p>
            <div className="flex gap-2 flex-wrap">
              <Link to="/finance" className="flex-1 min-w-0">
                <Button className="w-full bg-primary text-white gap-1 h-9 text-sm">
                  <Plus className="w-3.5 h-3.5" /> Add Transaction
                </Button>
              </Link>
              <Link to="/budget">
                <Button variant="outline" className="h-9 px-3 text-sm">Budget</Button>
              </Link>
              <Link to="/goals">
                <Button variant="outline" className="h-9 px-3 text-sm">Goals</Button>
              </Link>
            </div>
          </div>
        )}

        {/* Save More / Recurring — quick links to the two new sections,
            same tile size/weight so they read as part of the app, not
            bolted on. */}
        <div className="grid grid-cols-2 gap-3">
          <Link to="/save-more" className="sky-card rounded-2xl p-4 hover:border-primary/40 transition-colors">
            <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center mb-3">
              <Sparkles className="w-4 h-4 text-primary" />
            </div>
            <p className="text-sm font-bold text-foreground mb-0.5">Save More</p>
            <p className="text-xs text-muted-foreground">Where to cut back</p>
          </Link>
          <Link to="/recurring" className="sky-card rounded-2xl p-4 hover:border-primary/40 transition-colors">
            <div className="w-9 h-9 rounded-xl bg-amber-500/10 flex items-center justify-center mb-3">
              <Repeat className="w-4 h-4 text-amber-500" />
            </div>
            <p className="text-sm font-bold text-foreground mb-0.5">Recurring</p>
            <p className="text-xs text-muted-foreground">Subscriptions & bills</p>
          </Link>
        </div>

        {/* Budget Summary */}
        <BudgetSummaryCard transactions={transactions} budgets={budgets} thisMonth={thisMonth} />

        {/* Category Breakdown — where the money actually went this month,
            including categories (investment, savings) budgets don't track */}
        <CategoryBreakdownCard transactions={transactions} thisMonth={thisMonth} />

        {/* Goal Progress */}
        {savingsGoals.length > 0 && (
          <div className="sky-card rounded-2xl overflow-hidden">
            <div className="flex items-center justify-between px-4 pt-4 pb-3">
              <p className="font-bold text-sm">Goal Progress</p>
              <Link to="/goals" className="text-xs text-primary font-semibold flex items-center gap-0.5">
                See All <ChevronRight className="w-3 h-3" />
              </Link>
            </div>
            <div className="px-4 pb-4 space-y-4">
              {savingsGoals.slice(0, 2).map(goal => {
                const pct = goal.target_amount > 0
                  ? Math.min(100, Math.round(((goal.current_amount || 0) / goal.target_amount) * 100))
                  : 0;
                return (
                  <div key={goal.id}>
                    <div className="flex justify-between mb-1.5">
                      <span className="text-sm font-semibold text-foreground">{goal.icon || '🎯'} {goal.name}</span>
                      <span className="text-sm font-bold text-muted-foreground">{pct}%</span>
                    </div>
                    <div className="h-2 bg-secondary rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: 'linear-gradient(90deg, var(--hero-from), var(--hero-to))' }} />
                    </div>
                    <div className="flex justify-between mt-1">
                      <span className="text-xs text-muted-foreground">${fmt(goal.current_amount || 0)} saved</span>
                      <span className="text-xs text-muted-foreground">of ${fmt(goal.target_amount)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Upcoming Bills */}
        {upcomingBills.length > 0 && (
          <div className="sky-card rounded-2xl overflow-hidden">
            <div className="flex items-center justify-between px-4 pt-4 pb-3">
              <div className="flex items-center gap-2">
                <Receipt className="w-4 h-4 text-muted-foreground" />
                <p className="font-bold text-sm">Upcoming Bills</p>
              </div>
              <Link to="/bills" className="text-xs text-primary font-semibold flex items-center gap-0.5">
                All <ChevronRight className="w-3 h-3" />
              </Link>
            </div>
            <div className="px-4 pb-4 space-y-4">
              {upcomingBills.map(bill => {
                const daysUntil = differenceInDays(parseISO(bill.due_date), today);
                const isOverdue = daysUntil < 0;
                const isDueSoon = daysUntil >= 0 && daysUntil <= 3;
                return (
                  <div key={bill.id} className="flex items-center gap-3">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-base shrink-0 ${CAT_TINT[bill.category] || CAT_TINT.other}`}>
                      {CAT_BILL_ICONS[bill.category] || '💸'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate">{bill.name}</p>
                      <p className={`text-xs font-medium ${isOverdue ? 'text-red-500' : isDueSoon ? 'text-amber-500' : 'text-muted-foreground'}`}>
                        {isOverdue ? `Overdue by ${Math.abs(daysUntil)}d` : daysUntil === 0 ? 'Due today' : `Due in ${daysUntil}d`}
                      </p>
                    </div>
                    <span className="text-sm font-bold shrink-0 text-foreground">${bill.amount?.toFixed(0)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Recent Transactions */}
        {transactions.length > 0 ? (
          <div className="sky-card rounded-2xl overflow-hidden">
            <div className="flex items-center justify-between px-4 pt-4 pb-3">
              <p className="font-bold text-sm">Recent Transactions</p>
              <Link to="/finance" className="text-xs text-primary font-semibold flex items-center gap-0.5">
                View All <ChevronRight className="w-3 h-3" />
              </Link>
            </div>
            <div className="divide-y divide-border/40">
              {transactions.slice(0, 5).map(tx => (
                <div key={tx.id} className="flex items-center gap-3 px-4 py-3.5">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-base shrink-0 ${CAT_TINT[tx.category] || CAT_TINT.other}`}>
                    {CAT_ICONS[tx.category] || '💸'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate">{tx.title}</p>
                    <p className="text-xs text-muted-foreground capitalize truncate">{tx.category} · {tx.date}</p>
                  </div>
                  <span className={`text-sm font-bold shrink-0 ${tx.type === 'income' ? 'text-emerald-500' : 'text-foreground'}`}>
                    {tx.type === 'income' ? '+' : '−'}${tx.amount?.toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
            <div className="px-4 py-3 border-t border-border/40">
              <Link to="/finance" className="flex items-center justify-center gap-1 text-xs text-primary font-semibold">
                View all transactions <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>
        ) : (
          !isNewUser && (
            <div className="sky-card rounded-2xl p-6 text-center border border-dashed border-border">
              <DollarSign className="w-9 h-9 text-primary/30 mx-auto mb-3" />
              <p className="text-sm font-semibold mb-1 text-foreground">No transactions yet</p>
              <p className="text-xs text-muted-foreground mb-4">Add your first to start tracking.</p>
              <Link to="/finance">
                <Button size="sm" className="gap-1 bg-primary text-white">
                  <Plus className="w-3.5 h-3.5" /> Add Transaction
                </Button>
              </Link>
            </div>
          )
        )}

      </div>
    </div>
  );
}