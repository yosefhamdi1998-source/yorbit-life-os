import { useState, useEffect, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { DollarSign, Plus, TrendingUp, TrendingDown, X, Trash2, Search, PiggyBank, Upload, Receipt, Link2, BarChart3 } from 'lucide-react';
// X kept for NW form close button
import AddTransactionSheet from '@/components/finance/AddTransactionSheet';
import { FEATURES } from '@/lib/features';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MobileSelect } from '@/components/ui/mobile-select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import SpendingByCategoryChart from '@/components/finance/SpendingByCategoryChart';
import PullToRefreshIndicator from '@/components/PullToRefreshIndicator';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import { useNavigate } from 'react-router-dom';
import { subMonths, format } from 'date-fns';
import { toast } from '@/components/ui/use-toast';

const EXPENSE_CATS = ['housing', 'food', 'transport', 'entertainment', 'health', 'shopping', 'education', 'other'];
const INCOME_CATS = ['salary', 'freelance', 'investment', 'other'];
const CAT_COLORS = { housing: '#7C3AED', food: '#F97316', transport: '#3B82F6', entertainment: '#EC4899', health: '#EF4444', shopping: '#F59E0B', education: '#10B981', savings: '#059669', salary: '#22C55E', freelance: '#6366F1', investment: '#0EA5E9', other: '#94A3B8' };
const CAT_ICONS = { housing: '🏠', food: '🍔', transport: '🚗', entertainment: '🎬', health: '💊', shopping: '🛍️', education: '📚', savings: '💰', salary: '💵', freelance: '💻', investment: '📈', other: '💸' };

const TX_TYPE_OPTIONS = [
  { value: 'expense', label: '💸 Expense' },
  { value: 'income', label: '💵 Income' },
];

const NW_TYPE_OPTIONS = [
  { value: 'asset', label: '✅ Asset' },
  { value: 'liability', label: '❌ Liability' },
];

const NW_CAT_OPTIONS = ['cash', 'investment', 'property', 'vehicle', 'crypto', 'loan', 'mortgage', 'credit_card', 'other'].map(c => ({
  value: c,
  label: c.charAt(0).toUpperCase() + c.slice(1).replace(/_/g, ' '),
}));

function getCatOptions(type) {
  return (type === 'income' ? INCOME_CATS : EXPENSE_CATS).map(c => ({
    value: c,
    label: `${CAT_ICONS[c] || ''} ${c.charAt(0).toUpperCase() + c.slice(1)}`,
  }));
}

function fmt(n) { return (n || 0).toLocaleString('en-US', { maximumFractionDigits: 0 }); }

// ─── Transaction List ─────────────────────────────────────────────────────────
function TransactionList({ transactions, thisMonth, onDelete, onAdd }) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [confirmId, setConfirmId] = useState(null);

  const filtered = useMemo(() => {
    let list = [...transactions];
    if (filter === 'income') list = list.filter(t => t.type === 'income');
    else if (filter === 'expense') list = list.filter(t => t.type === 'expense');
    else if (filter === 'this_month') list = list.filter(t => t.date?.startsWith(thisMonth));
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(t => t.title?.toLowerCase().includes(q) || t.category?.toLowerCase().includes(q) || t.notes?.toLowerCase().includes(q));
    }
    return list;
  }, [transactions, filter, search, thisMonth]);

  if (transactions.length === 0) {
    return (
      <div className="bg-card border border-dashed border-border rounded-2xl p-8 text-center">
        <DollarSign className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
        <p className="text-sm font-semibold mb-1">No transactions yet</p>
        <p className="text-xs text-muted-foreground mb-4">Add your first transaction to unlock charts, budgets, and AI insights.</p>
        <Button size="sm" onClick={onAdd} className="gap-1"><Plus className="w-3.5 h-3.5" /> Add Transaction</Button>
      </div>
    );
  }

  return (
    <div>
      <div className="space-y-2 mb-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search transactions…" value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {[{ key: 'all', label: 'All' }, { key: 'expense', label: 'Spending' }, { key: 'income', label: 'Income' }, { key: 'this_month', label: 'This Month' }].map(f => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`shrink-0 text-xs px-3 py-1.5 rounded-full border transition-all ${filter === f.key ? 'bg-primary text-primary-foreground border-primary' : 'bg-secondary border-border'}`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="bg-card border border-dashed border-border rounded-2xl p-6 text-center">
          <p className="text-sm text-muted-foreground">No transactions match your filters.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.slice(0, 60).map(tx => (
            <div
              key={tx.id}
              className={`bg-card border border-border rounded-xl overflow-hidden transition-opacity ${tx.id?.startsWith('temp-') ? 'opacity-50' : ''}`}
            >
              <div className="flex items-center gap-3 p-3">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 text-base" style={{ backgroundColor: (CAT_COLORS[tx.category] || '#94A3B8') + '22' }}>
                  {CAT_ICONS[tx.category] || '💸'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{tx.title}</p>
                  <p className="text-xs text-muted-foreground capitalize truncate">{tx.category} · {tx.date}</p>
                </div>
                <span className={`font-bold text-sm shrink-0 ${tx.type === 'income' ? 'text-emerald-500' : 'text-foreground'}`}>
                  {tx.type === 'income' ? '+' : '-'}${tx.amount?.toFixed(2)}
                </span>
                {!tx.id?.startsWith('temp-') && (
                  <button
                    onClick={() => setConfirmId(confirmId === tx.id ? null : tx.id)}
                    className="text-muted-foreground hover:text-destructive transition-colors ml-1 shrink-0 p-2 -mr-1 rounded-lg"
                    title="Delete transaction"
                    aria-label="Delete transaction"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
              {confirmId === tx.id && (
                <div className="flex items-center justify-between px-3 pb-3 gap-2 border-t border-border/40">
                  <p className="text-xs text-muted-foreground">Delete this transaction?</p>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setConfirmId(null)}>Cancel</Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      className="h-7 text-xs"
                      onClick={() => { onDelete(tx.id); setConfirmId(null); }}
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main Finance Page ────────────────────────────────────────────────────────
export default function Finance() {
  const navigate = useNavigate();
  const [transactions, setTransactions] = useState([]);
  const [budgets, setBudgets] = useState([]);
  const [netWorth, setNetWorth] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showTxForm, setShowTxForm] = useState(false);
  const [showNWForm, setShowNWForm] = useState(false);

  const [nwForm, setNwForm] = useState({ name: '', type: 'asset', value: '', category: 'cash' });

  const loadData = async () => {
    setLoading(true);
    const timeout = setTimeout(() => setLoading(false), 5000);
    try {
      const [tx, b, nw] = await Promise.all([
        base44.entities.Transaction.list('-date', 100),
        base44.entities.Budget.list(),
        base44.entities.NetWorthEntry.list(),
      ]);
      clearTimeout(timeout);
      setTransactions(tx); setBudgets(b); setNetWorth(nw);
    } catch (error) {
      toast({ title: "Couldn't load your data", description: "Please try again in a moment.", variant: 'destructive' });
    } finally {
      clearTimeout(timeout);
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const { pullY, refreshing, threshold } = usePullToRefresh(loadData);

  // ── Optimistic add ──────────────────────────────────────────────────────────
  const saveTx = async (txData) => {
    const optimistic = { ...txData, id: `temp-${Date.now()}` };
    setTransactions(prev => [optimistic, ...prev]);
    try {
      await base44.entities.Transaction.create(txData);
      toast({ title: 'Transaction added', description: `$${txData.amount} · ${txData.category}` });
      loadData(); // replace temp with real record
    } catch (error) {
      setTransactions(prev => prev.filter(t => t.id !== optimistic.id));
      toast({ title: "Couldn't save transaction", description: "Please try again in a moment.", variant: 'destructive' });
      throw error; // re-throw so the sheet stays open for retry
    }
  };

  // ── Optimistic delete ───────────────────────────────────────────────────────
  const deleteTx = async (id) => {
    const existing = transactions.find(t => t.id === id);
    setTransactions(prev => prev.filter(t => t.id !== id));
    try {
      await base44.entities.Transaction.delete(id);
      toast({ title: 'Transaction deleted' });
    } catch (error) {
      if (existing) setTransactions(prev => [existing, ...prev]);
      toast({ title: "Couldn't delete transaction", description: "Please try again in a moment.", variant: 'destructive' });
    }
  };

  const [nwSaving, setNwSaving] = useState(false);
  const saveNW = async () => {
    if (!nwForm.name || !nwForm.value) return;
    setNwSaving(true);
    try {
      await base44.entities.NetWorthEntry.create({ ...nwForm, value: parseFloat(nwForm.value) });
      setShowNWForm(false);
      setNwForm({ name: '', type: 'asset', value: '', category: 'cash' });
      toast({ title: 'Entry added' });
      await loadData();
    } catch (err) {
      toast({ title: "Couldn't save entry", description: "Please try again in a moment.", variant: 'destructive' });
    } finally {
      setNwSaving(false);
    }
  };

  const thisMonth = format(new Date(), 'yyyy-MM');
  const lastMonthStr = format(subMonths(new Date(), 1), 'yyyy-MM');

  const monthTx = transactions.filter(t => t.date?.startsWith(thisMonth));
  const lastMonthTx = transactions.filter(t => t.date?.startsWith(lastMonthStr));
  const monthExpenses = monthTx.filter(t => t.type === 'expense').reduce((s, t) => s + (t.amount || 0), 0);
  const monthIncome = monthTx.filter(t => t.type === 'income').reduce((s, t) => s + (t.amount || 0), 0);
  const lastMonthExpenses = lastMonthTx.filter(t => t.type === 'expense').reduce((s, t) => s + (t.amount || 0), 0);
  const totalAssets = netWorth.filter(n => n.type === 'asset').reduce((s, n) => s + (n.value || 0), 0);
  const totalLiabilities = netWorth.filter(n => n.type === 'liability').reduce((s, n) => s + (n.value || 0), 0);
  const netSaved = monthIncome - monthExpenses;
  const savingsRate = monthIncome > 0 ? Math.round((netSaved / monthIncome) * 100) : 0;

  const catData = EXPENSE_CATS.map(cat => ({
    name: cat,
    spent: monthTx.filter(t => t.type === 'expense' && t.category === cat).reduce((s, t) => s + (t.amount || 0), 0),
    budget: budgets.find(b => b.category === cat && b.month === thisMonth)?.monthly_limit || 0,
  })).filter(d => d.spent > 0);

  if (loading) {
    return (
      <div className="p-4 max-w-2xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 rounded-2xl bg-secondary animate-pulse" />
          <div className="space-y-2 flex-1">
            <div className="w-20 h-4 rounded bg-secondary animate-pulse" />
            <div className="w-36 h-3 rounded bg-secondary animate-pulse" />
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
          {[1,2,3,4].map(i => <div key={i} className="h-20 rounded-2xl bg-secondary animate-pulse" />)}
        </div>
        <div className="h-28 rounded-2xl bg-secondary animate-pulse mb-3" />
        <div className="h-28 rounded-2xl bg-secondary animate-pulse" />
      </div>
    );
  }

  return (
    <div className="p-4 max-w-2xl mx-auto pb-8">
      <PullToRefreshIndicator pullY={pullY} refreshing={refreshing} threshold={threshold} />

      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-black tracking-tight">Money</h1>
        <div className="flex gap-1.5 items-center">
          <Button variant="ghost" size="icon" onClick={() => navigate('/spending-summary')} className="h-8 w-8 text-primary" title="Spending Summary" aria-label="Spending Summary">
            <BarChart3 className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => navigate('/bills')} className="h-8 w-8 text-muted-foreground" title="Bills" aria-label="Bills">
            <Receipt className="w-4 h-4" />
          </Button>
          {FEATURES.bankSync && (
            <Button variant="ghost" size="icon" onClick={() => navigate('/bank-sync')} className="h-8 w-8 text-blue-600" title="Connect Bank" aria-label="Connect Bank">
              <Link2 className="w-4 h-4" />
            </Button>
          )}
          <Button variant="ghost" size="icon" onClick={() => navigate('/csv-import')} className="h-8 w-8 text-amber-600" title="Import CSV" aria-label="Import CSV">
            <Upload className="w-4 h-4" />
          </Button>
          <Button onClick={() => setShowTxForm(true)} className="bg-emerald-600 hover:bg-emerald-700 text-white border-0 gap-1 shrink-0 h-8 px-3 text-sm rounded-xl">
            <Plus className="w-3.5 h-3.5" /> Add
          </Button>
        </div>
      </div>

      {/* Summary — 2-col on mobile, 4-col on sm+ */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-4">
        {[
          { label: 'Income', value: `$${fmt(monthIncome)}`, icon: TrendingUp, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
          { label: 'Spending', value: `$${fmt(monthExpenses)}`, icon: TrendingDown, color: 'text-red-500', bg: 'bg-red-500/10' },
          { label: 'Net Saved', value: `$${fmt(Math.max(0, netSaved))}`, icon: PiggyBank, color: 'text-blue-500', bg: 'bg-blue-500/10' },
          { label: 'Savings Rate', value: `${savingsRate}%`, icon: TrendingUp, color: savingsRate >= 20 ? 'text-emerald-500' : 'text-amber-500', bg: savingsRate >= 20 ? 'bg-emerald-500/10' : 'bg-amber-500/10' },
        ].map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} className="sky-card rounded-xl p-3">
            <div className={`w-6 h-6 ${bg} rounded-lg flex items-center justify-center mb-1.5`}>
              <Icon className={`w-3 h-3 ${color}`} />
            </div>
            <p className="text-base font-black leading-none mb-0.5">{value}</p>
            <p className="text-[11px] text-muted-foreground">{label}</p>
          </div>
        ))}
      </div>

      {/* Add Transaction Bottom Sheet */}
      <AddTransactionSheet
        open={showTxForm}
        onClose={() => setShowTxForm(false)}
        onSave={saveTx}
      />

      <Tabs defaultValue="transactions">
        <TabsList className="mb-5 w-full grid grid-cols-3 text-xs">
          <TabsTrigger value="transactions">Transactions</TabsTrigger>
          <TabsTrigger value="overview">Spending</TabsTrigger>
          <TabsTrigger value="networth">Net Worth</TabsTrigger>
        </TabsList>

        {/* TRANSACTIONS TAB */}
        <TabsContent value="transactions">
          <TransactionList transactions={transactions} thisMonth={thisMonth} onDelete={deleteTx} onAdd={() => setShowTxForm(true)} />
        </TabsContent>

        {/* OVERVIEW / SPENDING TAB */}
        <TabsContent value="overview">
          {catData.length > 0 ? (
            <>
              <SpendingByCategoryChart catData={catData} totalExpenses={monthExpenses} />

              {monthIncome > 0 && (
                <div className="bg-card border border-border rounded-2xl p-4 mb-4">
                  <p className="font-bold text-sm mb-3">Money Snapshot</p>
                  <div className="space-y-2.5">
                    {[
                      { label: 'Income', value: monthIncome, color: 'bg-emerald-500', textColor: 'text-emerald-500', pct: 100 },
                      { label: 'Spending', value: monthExpenses, color: 'bg-red-500', textColor: 'text-red-500', pct: Math.min(100, (monthExpenses / monthIncome) * 100) },
                      ...(netSaved > 0 ? [{ label: 'Net Saved', value: netSaved, color: 'bg-blue-500', textColor: 'text-blue-500', pct: Math.min(100, (netSaved / monthIncome) * 100) }] : []),
                    ].map(({ label, value, color, textColor, pct }) => (
                      <div key={label} className="flex items-center gap-3">
                        <span className={`text-xs font-medium w-20 shrink-0 ${textColor}`}>{label}</span>
                        <div className="flex-1 h-2.5 bg-secondary rounded-full overflow-hidden">
                          <div className={`h-full ${color} rounded-full`} style={{ width: `${pct}%` }} />
                        </div>
                        <span className={`text-xs font-bold w-16 text-right shrink-0 ${textColor}`}>${fmt(value)}</span>
                      </div>
                    ))}
                  </div>
                  {lastMonthExpenses > 0 && (
                    <p className={`text-xs mt-3 ${monthExpenses > lastMonthExpenses ? 'text-amber-600' : 'text-emerald-600'}`}>
                      {monthExpenses > lastMonthExpenses
                        ? `⚠️ Spending up ${Math.round(((monthExpenses - lastMonthExpenses) / lastMonthExpenses) * 100)}% vs last month`
                        : `✅ Spending down ${Math.round(((lastMonthExpenses - monthExpenses) / lastMonthExpenses) * 100)}% vs last month`}
                    </p>
                  )}
                </div>
              )}
            </>
          ) : (
            <div className="sky-card border border-dashed border-blue-200 rounded-2xl p-8 text-center mb-4">
              <DollarSign className="w-10 h-10 text-primary/30 mx-auto mb-3" />
              <p className="text-sm font-semibold mb-1">No spending data yet</p>
              <p className="text-xs text-muted-foreground mb-4">Add a few transactions to see your spending breakdown.</p>
              <Button size="sm" onClick={() => setShowTxForm(true)} className="gap-1 bg-primary text-white shadow-sm shadow-primary/20">
                <Plus className="w-3.5 h-3.5" /> Add Transaction
              </Button>
            </div>
          )}
        </TabsContent>

        {/* NET WORTH TAB */}
        <TabsContent value="networth">
          <div className="bg-card border border-border rounded-2xl p-4 mb-4">
            <div className="flex items-center justify-between mb-1">
              <p className="text-sm font-bold">Net Worth</p>
              <Button onClick={() => setShowNWForm(true)} variant="outline" size="sm" className="h-8 text-xs gap-1">
                <Plus className="w-3 h-3" /> Add Entry
              </Button>
            </div>
            <p className={`text-2xl font-black ${totalAssets - totalLiabilities >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
              ${fmt(totalAssets - totalLiabilities)}
            </p>
          </div>

          {showNWForm && (
            <div className="bg-card border border-border rounded-2xl p-5 mb-4">
              <div className="flex items-center justify-between mb-3">
                <p className="font-semibold text-sm">Add Entry</p>
                <button onClick={() => setShowNWForm(false)} className="p-2.5 -m-1 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg hover:bg-secondary active:bg-secondary/70 transition-colors"><X className="w-5 h-5 text-muted-foreground" /></button>
              </div>
              <div className="space-y-3">
                <Input placeholder="Name (e.g. Savings Account)" value={nwForm.name} onChange={e => setNwForm(f => ({ ...f, name: e.target.value }))} />
                <Input type="number" placeholder="Value ($)" value={nwForm.value} onChange={e => setNwForm(f => ({ ...f, value: e.target.value }))} />
                <div className="grid grid-cols-2 gap-3">
                  <MobileSelect
                    value={nwForm.type}
                    onValueChange={v => setNwForm(f => ({ ...f, type: v }))}
                    options={NW_TYPE_OPTIONS}
                  />
                  <MobileSelect
                    value={nwForm.category}
                    onValueChange={v => setNwForm(f => ({ ...f, category: v }))}
                    options={NW_CAT_OPTIONS}
                  />
                </div>
              </div>
              <div className="flex gap-2 mt-3">
                <Button variant="outline" onClick={() => setShowNWForm(false)} className="flex-1">Cancel</Button>
                <Button onClick={saveNW} disabled={!nwForm.name || !nwForm.value || nwSaving} className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white border-0">
                  {nwSaving ? 'Saving…' : 'Save'}
                </Button>
              </div>
            </div>
          )}

          <div className="grid sm:grid-cols-2 gap-4">
            {[
              { type: 'asset', label: 'Assets', total: totalAssets, color: 'text-emerald-600', emptyMsg: 'No assets added yet' },
              { type: 'liability', label: 'Liabilities', total: totalLiabilities, color: 'text-red-500', emptyMsg: 'No liabilities added yet' },
            ].map(({ type, label, total, color, emptyMsg }) => (
              <div key={type}>
                <h4 className={`font-bold text-sm ${color} mb-3`}>{label} · ${fmt(total)}</h4>
                <div className="space-y-2">
                  {netWorth.filter(n => n.type === type).map(n => (
                    <div key={n.id} className="bg-card border border-border rounded-xl p-3 flex justify-between">
                      <div><p className="text-sm font-medium">{n.name}</p><p className="text-xs text-muted-foreground capitalize">{n.category}</p></div>
                      <span className={`font-bold ${color}`}>{type === 'liability' ? '-' : ''}${fmt(n.value)}</span>
                    </div>
                  ))}
                  {netWorth.filter(n => n.type === type).length === 0 && (
                    <div className="bg-card border border-dashed border-border rounded-xl p-4 text-center">
                      <p className="text-xs text-muted-foreground">{emptyMsg}</p>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}