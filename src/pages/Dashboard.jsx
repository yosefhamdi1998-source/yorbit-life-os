import DataLoadError from '@/components/DataLoadError';
import { billsDueThisWeek } from '@/lib/billWindow';
import { reportLink } from '@/lib/reportRange';
import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import PullToRefreshIndicator from '@/components/PullToRefreshIndicator';
import { format, differenceInDays, parseISO, startOfDay, subMonths, subDays } from 'date-fns';
import { composeNetWorth } from '@/lib/netWorth';
import { filterByPeriod, filterByPreviousPeriod, sumByType, getPeriodLabel, getPeriodPhrase, savingsRate as computeSavingsRate, savingsRateLabel, rangeLabel, getPeriodBounds } from '@/lib/periods';
import { computeHealthScore } from '@/lib/financialHealth';
import { fmtFull } from '@/lib/format';
import { getSimpleMode } from '@/lib/simpleMode';
import WhatsNextCard from '@/components/dashboard/WhatsNextCard';
import CashFlowTrendChart from '@/components/dashboard/CashFlowTrendChart';
import { DollarSign, Plus, ChevronRight, ArrowRight, Receipt } from 'lucide-react';
import BudgetSummaryCard from '@/components/dashboard/BudgetSummaryCard';
import CategoryBreakdownCard from '@/components/dashboard/CategoryBreakdownCard';
import CoverageNotice from '@/components/CoverageNotice';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';
import { prettyMerchant } from '@/lib/merchantName';

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

// "Today" / "Yesterday" / "Mon, Sep 1" — matches how the Money page reads
// so the same transaction doesn't look different depending on where you
// see it. Year appended once the date leaves the current year.
function friendlyDate(dateStr) {
  if (!dateStr) return '';
  try {
    const d = parseISO(dateStr);
    const now = startOfDay(new Date());
    const days = differenceInDays(now, startOfDay(d));
    if (days === 0) return 'Today';
    if (days === 1) return 'Yesterday';
    return format(d, d.getFullYear() === now.getFullYear() ? 'EEE, MMM d' : 'MMM d, yyyy');
  } catch {
    return dateStr;
  }
}

const HEALTH_SCORE_CATS = ['housing', 'food', 'transport', 'entertainment', 'health', 'shopping', 'education', 'savings', 'investment', 'other'];

export default function Dashboard() {
  const [transactions, setTransactions] = useState([]);
  const [budgets, setBudgets] = useState([]);
  const [savingsGoals, setSavingsGoals] = useState([]);
  const [bills, setBills] = useState([]);
  const [netWorthEntries, setNetWorthEntries] = useState([]);
  const [connectedAccounts, setConnectedAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [cashFlowPeriod, setCashFlowPeriod] = useState('month'); // 'week' | 'month' | `year-${YYYY}`
  const simpleMode = getSimpleMode();
  // Separate from cashFlowPeriod above (that one drives the hero's own
  // Week/Month/Year switcher) — this is just the Cash Flow Trend chart's
  // own window, '1m' | '3m' | '6m' | '1y' | '2y' | 'all'.
  const [trendPeriod, setTrendPeriod] = useState(() => (getSimpleMode() ? '1m' : '6m'));
  const navigate = useNavigate();

  // Anchored to the newest transaction on record, not the literal calendar
  // date — imported/historical data (a fresh CSV/PDF import especially)
  // can trail today's real date, and "this month" counted from literal
  // today would show Budget Summary/Category Breakdown/Health Score as
  // empty for anyone whose data doesn't reach into the current real month
  // yet — while Week (already anchored) correctly showed real data. Same
  // "week looks right, month looks wrong" bug already fixed in periods.js,
  // fixed here too since this file computes its own `thisMonth` for the
  // Budget Summary and Category Breakdown cards below.
  const latestTxDate = (() => {
    let latest = null;
    for (const t of transactions) {
      if (t.date && (!latest || t.date > latest)) latest = t.date;
    }
    return latest ? parseISO(latest) : new Date();
  })();
  const thisMonth = format(latestTxDate, 'yyyy-MM');

  const loadData = useCallback(async () => {
    setLoadFailed(false);
    try {
      const [tr, b, sg, bl, nw, accts] = await Promise.all([
        base44.entities.Transaction.list('-date', 50000),
        base44.entities.Budget.list(),
        base44.entities.SavingsGoal.list(),
        base44.entities.Bill.list('due_date', 5000),
        base44.entities.NetWorthEntry.list(),
        base44.entities.ConnectedAccount.list('-created_date', 50).catch(() => []),
      ]);
      setTransactions(tr); setBudgets(b); setSavingsGoals(sg); setBills(bl); setNetWorthEntries(nw); setConnectedAccounts(accts || []);
      return { tr, b, sg, bl, nw };
    } catch {
      setLoadFailed(true);
      toast({ title: "Couldn't load your data", description: "Please try again in a moment.", variant: 'destructive' });
      return null; // null = load failed (distinct from "user has no data")
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Two gates, and they are not interchangeable. localStorage stops the
    // redirect loop on THIS device even when offline; the profile column is
    // what stops a user who finished on their phone from being walked through
    // the whole tour again on their laptop. Either one counts as done.
    if (localStorage.getItem('onboarding_done')) { loadData(); return; }

    let cancelled = false;
    (async () => {
      let doneOnAccount = false;
      try {
        const me = await base44.auth.me();
        doneOnAccount = Boolean(me?.onboarding_completed_at);
      } catch {
        // Auth hiccup — fall through to the data check rather than either
        // trapping them in onboarding or skipping it outright.
      }
      if (cancelled) return;
      if (doneOnAccount) {
        try { localStorage.setItem('onboarding_done', '1'); } catch { /* private mode */ }
        loadData();
        return;
      }
      const result = await loadData();
      if (cancelled || !result) return; // null = load failed, not a new user
      const { tr, b, sg, bl } = result;
      const hasData = tr.length > 0 || b.length > 0 || sg.length > 0 || bl.length > 0;
      if (!hasData) navigate('/onboarding', { replace: true });
    })();
    return () => { cancelled = true; };
  }, [loadData, navigate]);

  const { pullY, refreshing, threshold } = usePullToRefresh(loadData);

  const monthTx = transactions.filter(t => t.date?.startsWith(thisMonth));
  const monthExpenses = monthTx.filter(t => t.type === 'expense').reduce((s, t) => s + (t.amount || 0), 0);
  const monthIncome = monthTx.filter(t => t.type === 'income').reduce((s, t) => s + (t.amount || 0), 0);
  const netSaved = monthIncome - monthExpenses;
  // A fraction-of-a-cent "income" row (a staking reward like $0.00007 is a
  // real example in this data) technically passes `> 0` but turns netSaved
  // divided by it into a meaningless five-figure percentage. Require at
  // least $1 of real income before a rate means anything.
  const savingsRate = computeSavingsRate(monthIncome, monthExpenses);
  const worth = composeNetWorth(connectedAccounts, netWorthEntries);
  const totalAssets = netWorthEntries.filter(e => e.type === 'asset').reduce((s, e) => s + (e.value || 0), 0);
  const totalLiabilities = netWorthEntries.filter(e => e.type === 'liability').reduce((s, e) => s + (e.value || 0), 0);
  const netWorth = totalAssets - totalLiabilities;

  const isNewUser = transactions.length === 0 && budgets.length === 0 && savingsGoals.length === 0;

  // latestTxDate is computed above, alongside thisMonth.

  // The hero figures (net saved / income / expenses / savings rate) follow
  // the same period switcher as the chart below it, instead of always
  // being locked to the literal calendar month — a fresh month with no
  // transactions yet used to make the whole hero read as "$0, broken."
  // Uses the shared periods.js module — the one canonical Week/Month/
  // Year/Last Year implementation, also used by Goals and Save More.
  const heroTx = filterByPeriod(transactions, cashFlowPeriod, latestTxDate);
  const { income: heroIncome, expenses: heroExpenses, net: heroNetSaved } = sumByType(heroTx);
  // Same fraction-of-a-cent guard as `savingsRate` above.
  const heroSavingsRate = computeSavingsRate(heroIncome, heroExpenses);
  const heroPeriodLabel = getPeriodLabel(cashFlowPeriod, latestTxDate);
  const heroPeriodPhrase = getPeriodPhrase(cashFlowPeriod, latestTxDate);
  // TRUE calendar bounds of the selected window, from the period definition
  // and not from the rows that landed in it. Deriving these from heroTx made
  // a year holding 29 December transactions look like a fully covered
  // two-week window - defeating the coverage check entirely.
  const { start: heroPeriodStart, end: heroPeriodEnd } =
    getPeriodBounds(cashFlowPeriod, latestTxDate, transactions);
  const isYearPeriod = cashFlowPeriod.startsWith('year-');
  // Same trailing-4-years list as the Yearly picker on Money, so the two
  // don't quietly offer a different range of history.
  const thisYearNum = new Date().getFullYear();
  // Only offer years that actually contain transactions. Listing the last
  // four years regardless meant picking 2023 or 2024 showed a completely
  // empty hero, which reads as the app being broken rather than as "you
  // have no data from then."
  const YEAR_OPTIONS = (() => {
    const years = [...new Set(transactions.map(t => t.date?.slice(0, 4)).filter(Boolean))]
      .map(Number)
      .sort((a, b) => b - a);
    return years.length ? years : [thisYearNum];
  })();

  // Months of real history on record — drives which trend ranges are worth
  // offering at all.
  const historyMonths = (() => {
    if (!transactions.length) return 0;
    let min = null;
    for (const t of transactions) if (t.date && (!min || t.date < min)) min = t.date;
    if (!min) return 0;
    const start = parseISO(min);
    return (latestTxDate.getFullYear() - start.getFullYear()) * 12
      + (latestTxDate.getMonth() - start.getMonth()) + 1;
  })();

  // Same period, one step back — powers the Savings Progress comparison
  // and the Financial Health Score's "why it changed" explanation.
  const prevTx = filterByPreviousPeriod(transactions, cashFlowPeriod, latestTxDate);
  const prevSums = sumByType(prevTx);

  // Cash Flow Trend chart's own window — independent of the hero period
  // switcher above (that answers "how am I doing in [this period]"; this
  // answers "what's the trend", which needs its own timescale entirely).
  // Anchored to the latest transaction's date/month, not literal today, so
  // historical/imported data doesn't show a run of empty buckets at the end.
  const cashFlowTrend = (() => {
    const anchor = startOfDay(latestTxDate);
    if (trendPeriod === '1m') {
      // Trailing 30 days ending at the anchor — the same "Month" definition
      // used everywhere else in the app (periods.js). This used to draw
      // every day of the anchor's calendar month, so 3 days into a new
      // month it plotted real data for a couple of bars and then ~27 empty,
      // flat, future-dated bars trailing off to nothing.
      const buckets = [];
      for (let i = 29; i >= 0; i--) {
        const d = subDays(anchor, i);
        const key = format(d, 'yyyy-MM-dd');
        const tx = transactions.filter(t => t.date === key);
        const { income, expenses } = sumByType(tx);
        buckets.push({ month: format(d, 'd'), label: format(d, 'MMM d, yyyy'), start: key, end: key, transactions: tx, income, expense: expenses, net: income - expenses });
      }
      return buckets;
    }
    if (trendPeriod === 'all') {
      // One bar per calendar year across the full history on record.
      const years = [...new Set(transactions.map(t => t.date?.slice(0, 4)).filter(Boolean))].sort();
      return years.map(y => {
        const tx = transactions.filter(t => t.date?.startsWith(y));
        const { income, expenses } = sumByType(tx);
        return { month: y, label: y, start: `${y}-01-01`, end: `${y}-12-31`, transactions: tx, income, expense: expenses, net: income - expenses };
      });
    }
    const monthsBack = { '3m': 3, '6m': 6, '1y': 12, '2y': 24, '3y': 36 }[trendPeriod] || 6;
    const buckets = [];
    for (let i = monthsBack - 1; i >= 0; i--) {
      const m = subMonths(anchor, i);
      const key = format(m, 'yyyy-MM');
      const tx = transactions.filter(t => t.date?.startsWith(key));
      const { income, expenses } = sumByType(tx);
      const label = monthsBack > 12 ? format(m, 'MMM yy') : format(m, 'MMM');
      buckets.push({ month: label, label: format(m, 'MMMM yyyy'), start: `${key}-01`, end: format(new Date(m.getFullYear(), m.getMonth() + 1, 0), 'yyyy-MM-dd'), transactions: tx, income, expense: expenses, net: income - expenses });
    }
    return buckets;
  })();

  // Budget adherence input for the Health Score — same "only count
  // categories that actually have a limit" rule as BudgetSummaryCard.
  const budgetedRows = HEALTH_SCORE_CATS
    .map(cat => ({
      cat,
      spent: monthTx.filter(t => t.type === 'expense' && t.category === cat).reduce((s, t) => s + (t.amount || 0), 0),
      limit: budgets.find(b => b.category === cat && b.month === thisMonth)?.monthly_limit || 0,
    }))
    .filter(r => r.limit > 0);

  const overdueBillCount = bills.filter(b => !b.is_paid && b.due_date && b.due_date < format(new Date(), 'yyyy-MM-dd')).length;

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
  const weeklyBills = billsDueThisWeek(bills, today);
  const upcomingBills = bills
    .filter(b => !b.is_paid && b.due_date)
    .filter(b => {
      try { const diff = differenceInDays(parseISO(b.due_date), today); return diff >= 0 && diff <= 6; }
      catch { return false; }
    })
    .sort((a, b) => new Date(a.due_date) - new Date(b.due_date))
    .slice(0, 3);

  if (loadFailed) return <DataLoadError onRetry={() => loadData()} />;

  if (loading) {
    return (
      <div className="pt-4 space-y-4">
        <div className="h-40 rounded-2xl bg-gradient-to-br from-primary/20 to-secondary/60 animate-pulse" />
        <div className="h-24 rounded-2xl bg-secondary/60 animate-pulse" />
        <div className="h-32 rounded-2xl bg-secondary/60 animate-pulse" />
      </div>
    );
  }

  return (
    <div className="pb-8 overflow-x-hidden">
      <header className="flex items-center justify-between gap-4 pt-6 pb-5"><div><h1 className="text-2xl font-bold tracking-tight">Overview</h1><p className="text-sm text-muted-foreground mt-1">Your accounts, spending, and upcoming bills</p></div><Link to="/finance?add=1" className="shrink-0 inline-flex items-center gap-1 min-h-[44px] px-3 rounded-xl border border-border bg-card text-sm font-semibold"><Plus className="w-4 h-4" /> Add</Link></header>
      <PullToRefreshIndicator pullY={pullY} refreshing={refreshing} threshold={threshold} />


      <section aria-label="Money overview" className="mb-6">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div><h2 className="text-sm font-semibold">Your money at a glance</h2><p className="text-xs text-muted-foreground mt-1">Recorded activity through {format(latestTxDate, 'MMM d, yyyy')}</p></div>
          <select aria-label="Overview date range" value={cashFlowPeriod} onChange={e => setCashFlowPeriod(e.target.value)} className="min-h-[44px] rounded-xl border border-border bg-card px-3 text-sm font-medium">
            <option value="week">Last 7 days</option><option value="month">Last 30 days</option><option value="3month">Last 3 months</option><option value="6month">Last 6 months</option>
            {YEAR_OPTIONS.map(y => <option key={y} value={`year-${y}`}>{y}</option>)}<option value="all">All time</option>
          </select>
        </div>
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
          <Link to={reportLink(cashFlowPeriod, latestTxDate, transactions, 'income')} className="sky-card rounded-2xl p-4 sm:p-5 hover:border-primary/40 transition-colors"><p className="text-xs text-muted-foreground mb-2">Income ↗</p><p className="text-2xl font-bold tracking-tight tabular-nums text-emerald-600 dark:text-emerald-400">${fmtFull(heroIncome)}</p><p className="text-xs text-muted-foreground mt-2">{rangeLabel(cashFlowPeriod)}</p></Link>
          <Link to={reportLink(cashFlowPeriod, latestTxDate, transactions, 'expense')} className="sky-card rounded-2xl p-4 sm:p-5 hover:border-primary/40 transition-colors"><p className="text-xs text-muted-foreground mb-2">Spending ↗</p><p className="text-2xl font-bold tracking-tight tabular-nums">${fmtFull(heroExpenses)}</p><p className="text-xs text-muted-foreground mt-2">{rangeLabel(cashFlowPeriod)}</p></Link>
          <div className="rounded-2xl p-4 sm:p-5 bg-primary/10 border border-primary/20"><p className="text-xs text-muted-foreground mb-2">Income minus spending</p><p className="text-2xl font-bold tracking-tight tabular-nums">{heroNetSaved < 0 ? '−' : ''}${fmtFull(Math.abs(heroNetSaved))}</p><p className="text-xs text-muted-foreground mt-2">Not your available bank balance</p></div>
          <div className="sky-card rounded-2xl p-4 sm:p-5"><p className="text-xs text-muted-foreground mb-2">Savings rate</p><p className="text-2xl font-bold tracking-tight tabular-nums">{savingsRateLabel(heroSavingsRate)}</p><p className="text-xs text-muted-foreground mt-2">Share of recorded income left</p></div>
        </div>
        <CoverageNotice transactions={heroTx} periodStart={heroPeriodStart} periodEnd={heroPeriodEnd} periodLabel={heroPeriodPhrase} className="mt-3" />
      </section>
      <section aria-label="Next steps" className="space-y-3 mb-6">        {/* Onboarding CTA */}
        {isNewUser && (
          <div className="rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/10 to-card p-4">
            <p className="font-bold text-sm text-foreground mb-0.5">Build your money picture</p>
            <p className="text-xs text-muted-foreground mb-3">Add a transaction to unlock insights.</p>
            <div className="flex gap-2 flex-wrap">
              <Link to="/finance?add=1" className="flex-1 min-w-0">
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

        {/* What should I do next — the single most actionable thing on the
            page, so it opens the column instead of sitting at the bottom
            under everything else. */}
        {(heroTx.length > 0 || budgetedRows.length > 0) && (
          <div className="sky-card rounded-2xl p-4 lg:p-5">
            <WhatsNextCard
              overdueBillCount={overdueBillCount}
              heroNetSaved={heroNetSaved}
              fallbackTip={topSaveMoreCategory ? `You spent the most on ${topSaveMoreCategory.cat} this period ($${fmt(topSaveMoreCategory.spent)}) — see Save More for ideas.` : null}
              bare
            />
          </div>
        )}

</section>
      <section aria-label="Bills and budget" className="mb-8">
        <h2 className="text-base font-semibold mb-3">Your plan</h2>
        <div className="grid lg:grid-cols-2 gap-5 items-start">        {/* Upcoming Bills */}
        {(
          <div className="sky-card rounded-2xl overflow-hidden">
            <div className="flex items-center justify-between px-4 pt-4 pb-3">
              <div className="flex items-center gap-2">
                <Receipt className="w-4 h-4 text-muted-foreground" />
                <p className="font-bold text-sm">Upcoming bills</p>
              </div>
              <Link to="/bills" className="text-xs text-primary font-semibold flex items-center gap-0.5">
                All <ChevronRight className="w-3 h-3" />
              </Link>
            </div>
            <div className="px-4 pb-4 space-y-4">
              <div><p className="text-2xl font-bold">${fmtFull(weeklyBills.total)}</p><p className="text-xs text-muted-foreground mt-1">{weeklyBills.count} recorded unpaid bill{weeklyBills.count === 1 ? '' : 's'} · {format(parseISO(weeklyBills.start), 'MMM d')}–{format(parseISO(weeklyBills.end), 'MMM d')}</p></div>
              {bills.length === 0 && <Link to="/bills?add=1" className="inline-flex min-h-[44px] items-center text-sm font-semibold text-primary">Add your first bill</Link>}
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

<BudgetSummaryCard compact transactions={transactions} budgets={budgets} thisMonth={thisMonth} /></div>
      </section>
      {!simpleMode && <section aria-label="Spending insights" className="mb-8">
        <div className="mb-3"><h2 className="text-base font-semibold">Understand your spending</h2><p className="text-xs text-muted-foreground mt-1">Explore a month to see the details behind the numbers.</p></div>
        <div className="grid xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] gap-5 items-start">
          <CashFlowTrendChart data={cashFlowTrend} period={trendPeriod} onPeriodChange={setTrendPeriod} simple={simpleMode} historyMonths={historyMonths} />
          <CategoryBreakdownCard transactions={transactions} thisMonth={thisMonth} />
        </div>
      </section>}
      <section aria-label="Activity and goals" className={`grid ${simpleMode ? "" : "lg:grid-cols-2"} gap-5 items-start`}>        {/* Recent Transactions */}
        {transactions.length > 0 ? (
          <div className="sky-card rounded-2xl overflow-hidden">
            <div className="flex items-center justify-between px-4 pt-4 pb-3">
              <p className="font-bold text-sm">Recent Transactions</p>
              <Link to="/finance" className="text-xs text-primary font-semibold flex items-center gap-0.5">
                View All <ChevronRight className="w-3 h-3" />
              </Link>
            </div>
            <div className="divide-y divide-border/40">
              {transactions.slice(0, simpleMode ? 3 : 5).map(tx => (
                <div key={tx.id} className="flex items-center gap-3 px-4 py-3.5">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-base shrink-0 ${CAT_TINT[tx.category] || CAT_TINT.other}`}>
                    {CAT_ICONS[tx.category] || '💸'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate">{prettyMerchant(tx.title)}</p>
                    {/* Was printing the raw ISO date ("2026-09-01") while
                        the Money page showed "Today"/"Mon, Sep 1" for the
                        same rows. Same treatment in both places now. */}
                    <p className="text-xs text-muted-foreground capitalize truncate">{tx.category} · {friendlyDate(tx.date)}</p>
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

        {/* Goal Progress */}
        {!simpleMode && savingsGoals.length > 0 && (
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

</section>
    </div>
  );
}
