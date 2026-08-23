import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import PullToRefreshIndicator from '@/components/PullToRefreshIndicator';
import { format, differenceInDays, parseISO } from 'date-fns';
import { TrendingUp, TrendingDown, DollarSign, Plus, ChevronRight, ArrowRight, Receipt, Zap } from 'lucide-react';
import BudgetSummaryCard from '@/components/dashboard/BudgetSummaryCard';
import QuickAddTransactionSheet from '@/components/dashboard/QuickAddTransactionSheet';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';

const CAT_ICONS = { housing: '🏠', food: '🍔', transport: '🚗', entertainment: '🎬', health: '💊', shopping: '🛍️', education: '📚', savings: '💰', salary: '💵', freelance: '💻', investment: '📈', other: '💸' };
const CAT_BILL_ICONS = { housing: '🏠', utilities: '💡', phone: '📱', insurance: '🛡️', subscription: '📺', credit_card: '💳', loan: '🏦', other: '💸' };

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
      return { tr: [], b: [], sg: [], bl: [] };
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!localStorage.getItem('onboarding_done')) {
      loadData().then(({ tr, b, sg, bl }) => {
        const hasData = tr.length > 0 || b.length > 0 || sg.length > 0 || bl.length > 0;
        if (!hasData) navigate('/onboarding', { replace: true });
      });
    } else {
      loadData();
    }
  }, [loadData]);

  const { pullY, refreshing, threshold } = usePullToRefresh(loadData);

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

  const today = new Date();
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
      <div className="w-full max-w-xl mx-auto px-4 pt-4 space-y-4">
        <div className="h-40 rounded-2xl bg-gradient-to-br from-blue-200/60 to-purple-200/60 animate-pulse" />
        <div className="h-24 rounded-2xl bg-secondary/60 animate-pulse" />
        <div className="h-32 rounded-2xl bg-secondary/60 animate-pulse" />
      </div>
    );
  }

  return (
    <div className="w-full max-w-xl mx-auto pb-8 overflow-x-hidden">
      <PullToRefreshIndicator pullY={pullY} refreshing={refreshing} threshold={threshold} />

      {/* Quick Add floating button */}
      <button
        onClick={() => setQuickAddOpen(true)}
        className="fixed bottom-[84px] right-4 z-40 w-12 h-12 rounded-full shadow-lg flex items-center justify-center active:scale-95 transition-transform lg:hidden"
        style={{ background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)', boxShadow: '0 4px 16px rgba(16,185,129,0.35)' }}
      >
        <Zap className="w-5 h-5 text-white" strokeWidth={2.5} />
      </button>
      <QuickAddTransactionSheet open={quickAddOpen} onClose={() => setQuickAddOpen(false)} onSave={handleQuickAdd} />

      {/* ── Hero card ─────────────────────────────────────────────────── */}
      <div
        className="mx-4 mt-4 mb-5 rounded-2xl overflow-hidden"
        style={{ background: 'linear-gradient(135deg, #1e40af 0%, #4f46e5 55%, #7c3aed 100%)' }}
      >
        <div className="px-5 pt-5 pb-5">
          {/* Header row */}
          <div className="flex items-center justify-between mb-5">
            <p className="text-white/60 text-xs font-semibold uppercase tracking-widest">
              {format(new Date(), 'MMMM yyyy')}
            </p>
            <Link to="/upgrade">
              <div className="flex items-center gap-1 bg-white/15 hover:bg-white/25 transition-colors rounded-full px-2.5 py-1">
                <Zap className="w-3 h-3 text-yellow-300" />
                <span className="text-white text-[11px] font-bold">Go Pro</span>
              </div>
            </Link>
          </div>

          {/* Primary metric */}
          <p className="text-white/55 text-xs font-medium mb-1">Net saved this month</p>
          <p className="text-white text-4xl font-black tracking-tight leading-none mb-5">
            {netSaved >= 0 ? '+' : '−'}${fmt(Math.abs(netSaved))}
          </p>

          {/* Income / Expenses */}
          <div className="grid grid-cols-2 gap-2.5">
            <div className="bg-white/10 rounded-xl px-4 py-3 flex items-center gap-2.5 min-w-0">
              <TrendingUp className="w-4 h-4 text-emerald-300 shrink-0" />
              <div className="min-w-0">
                <p className="text-white/55 text-[10px] font-semibold uppercase tracking-wide leading-none mb-0.5">Income</p>
                <p className="text-white font-black text-lg leading-tight truncate">${fmt(monthIncome)}</p>
              </div>
            </div>
            <div className="bg-white/10 rounded-xl px-4 py-3 flex items-center gap-2.5 min-w-0">
              <TrendingDown className="w-4 h-4 text-red-300 shrink-0" />
              <div className="min-w-0">
                <p className="text-white/55 text-[10px] font-semibold uppercase tracking-wide leading-none mb-0.5">Expenses</p>
                <p className="text-white font-black text-lg leading-tight truncate">${fmt(monthExpenses)}</p>
              </div>
            </div>
          </div>

          {savingsRate > 0 && (
            <p className="text-white/45 text-xs mt-3">
              {savingsRate >= 20 ? '🔥 Great savings rate' : savingsRate >= 10 ? '📈 Building momentum' : '💡 Room to save more'} · {savingsRate}% saved
            </p>
          )}
        </div>
      </div>

      {/* Net Worth */}
      {netWorthEntries.length > 0 && (
        <div className="mx-4 mb-5 sky-card rounded-2xl p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">Net Worth</p>
              <p className="text-2xl font-black text-foreground">${fmt(netWorth)}</p>
            </div>
            <div className="flex gap-4 text-right">
              <div>
                <p className="text-[10px] font-semibold uppercase text-muted-foreground">Assets</p>
                <p className="text-sm font-bold text-emerald-500">${fmt(totalAssets)}</p>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase text-muted-foreground">Liabilities</p>
                <p className="text-sm font-bold text-red-500">${fmt(totalLiabilities)}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Content sections ──────────────────────────────────────────── */}
      <div className="px-4 space-y-5">

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
                    <span className="text-lg shrink-0">{CAT_BILL_ICONS[bill.category] || '💸'}</span>
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
                  <div className="w-9 h-9 rounded-xl bg-secondary/70 flex items-center justify-center text-base shrink-0">
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