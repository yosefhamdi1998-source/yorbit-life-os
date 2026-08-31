import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import PullToRefreshIndicator from '@/components/PullToRefreshIndicator';
import { format, differenceInDays, parseISO, startOfDay, startOfMonth, eachDayOfInterval } from 'date-fns';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { DollarSign, Plus, ChevronRight, ArrowRight, Receipt, Zap } from 'lucide-react';
import BudgetSummaryCard from '@/components/dashboard/BudgetSummaryCard';
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

export default function Dashboard() {
  const [transactions, setTransactions] = useState([]);
  const [budgets, setBudgets] = useState([]);
  const [savingsGoals, setSavingsGoals] = useState([]);
  const [bills, setBills] = useState([]);
  const [netWorthEntries, setNetWorthEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const navigate = useNavigate();

  const thisMonth = format(new Date(), 'yyyy-MM');

  const loadData = useCallback(async () => {
    try {
      const [tr, b, sg, bl, nw] = await Promise.all([
        base44.entities.Transaction.list('-date', 100),
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

  // Running net balance for each day so far this month, for the trend chart.
  const cashFlowSeries = (() => {
    const start = startOfMonth(new Date());
    const days = eachDayOfInterval({ start, end: new Date() });
    let running = 0;
    return days.map(d => {
      const key = format(d, 'yyyy-MM-dd');
      for (const t of monthTx) {
        if (t.date === key) running += t.type === 'income' ? (t.amount || 0) : -(t.amount || 0);
      }
      return { day: format(d, 'MMM d'), net: Math.round(running) };
    });
  })();

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
        style={{ background: 'linear-gradient(135deg, #1e40af 0%, #4f46e5 55%, #7c3aed 100%)' }}
      >
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div className="aurora-blob aurora-sky1" style={{ opacity: 0.45 }} />
          <div className="aurora-blob aurora-sky2" style={{ opacity: 0.35 }} />
        </div>
        <div className="relative px-5 pt-5 pb-5 lg:px-8 lg:pt-7 lg:pb-7">
          <div className="flex items-center justify-between mb-5">
            <p className="text-white/60 text-[11px] font-semibold uppercase tracking-widest">
              {format(new Date(), 'MMMM yyyy')}
            </p>
            <Link to="/upgrade">
              <div className="flex items-center gap-1.5 bg-white/15 hover:bg-white/25 transition-colors rounded-full px-3 py-1.5">
                <Zap className="w-3.5 h-3.5 text-yellow-300" />
                <span className="text-white text-xs font-bold">Go Pro</span>
              </div>
            </Link>
          </div>

          <p className="text-white/55 text-xs font-medium mb-1">Net saved this month</p>
          <p className="text-white text-4xl lg:text-6xl font-black tracking-tight leading-none mb-5 tabular-nums">
            {netSaved >= 0 ? '+' : '−'}<AnimatedNumber prefix="$" value={Math.abs(netSaved)} />
          </p>

          <div className="grid grid-cols-3 gap-2.5">
            <div className="bg-white/10 rounded-xl px-3 py-2.5">
              <p className="text-white/55 text-[10px] font-semibold uppercase tracking-wide mb-0.5">Income</p>
              <p className="text-white font-black text-base leading-tight tabular-nums truncate">
                <AnimatedNumber prefix="$" value={monthIncome} />
              </p>
            </div>
            <div className="bg-white/10 rounded-xl px-3 py-2.5">
              <p className="text-white/55 text-[10px] font-semibold uppercase tracking-wide mb-0.5">Expenses</p>
              <p className="text-white font-black text-base leading-tight tabular-nums truncate">
                <AnimatedNumber prefix="$" value={monthExpenses} />
              </p>
            </div>
            <div className="bg-white/10 rounded-xl px-3 py-2.5">
              <p className="text-white/55 text-[10px] font-semibold uppercase tracking-wide mb-0.5">Savings rate</p>
              <p className="text-white font-black text-base leading-tight tabular-nums truncate">{savingsRate}%</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Cash flow trend ───────────────────────────────────────────── */}
      {monthTx.length > 0 && (
        <div className="sky-card rounded-2xl px-4 pt-4 pb-2 lg:px-5 lg:pt-5 mb-5">
          <div className="flex items-baseline justify-between mb-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Cash flow this month
            </p>
            <p className={`text-sm font-bold ${netSaved >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
              {netSaved >= 0 ? '+' : '−'}${fmt(Math.abs(netSaved))}
            </p>
          </div>
          <div className="h-40 lg:h-56 -ml-2">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={cashFlowSeries} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="cashFlowFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#2563EB" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#2563EB" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                <XAxis dataKey="day" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                  tickLine={false} axisLine={false} minTickGap={28} />
                <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                  tickLine={false} axisLine={false} width={52}
                  tickFormatter={v => `$${Math.abs(v) >= 1000 ? (v / 1000).toFixed(1) + 'k' : v}`} />
                <Tooltip
                  contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))',
                    borderRadius: 12, fontSize: 12 }}
                  labelStyle={{ color: 'hsl(var(--muted-foreground))' }}
                  formatter={v => [`$${fmt(v)}`, 'Net']}
                />
                <Area type="monotone" dataKey="net" stroke="#2563EB" strokeWidth={2.5}
                  fill="url(#cashFlowFill)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Net Worth */}
      {netWorthEntries.length > 0 && (
        <div className="mb-5 sky-card rounded-2xl p-4 lg:p-5">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Net Worth</p>
              <p className="text-2xl lg:text-3xl font-black text-foreground tabular-nums leading-none">${fmt(netWorth)}</p>
            </div>
            {netWorthTrend.length > 1 && (
              <div className="hidden sm:block shrink-0">
                <Sparkline values={netWorthTrend} tone={netWorth >= 0 ? 'positive' : 'negative'} width={104} height={34} />
              </div>
            )}
            <div className="flex gap-4 text-right shrink-0">
              <div>
                <p className="text-[10px] font-semibold uppercase text-muted-foreground">Assets</p>
                <p className="text-sm lg:text-base font-bold text-emerald-500">${fmt(totalAssets)}</p>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase text-muted-foreground">Liabilities</p>
                <p className="text-sm lg:text-base font-bold text-red-500">${fmt(totalLiabilities)}</p>
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

        {/* Budget Summary */}
        <BudgetSummaryCard transactions={transactions} budgets={budgets} thisMonth={thisMonth} />

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
                      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: 'linear-gradient(90deg, #2563EB, #7C3AED)' }} />
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