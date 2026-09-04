import { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { PiggyBank, Plus, X, CheckCircle, AlertTriangle, Clock, Wallet, CreditCard } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import PageHeader from '@/components/PageHeader';
import BudgetExportMenu from '@/components/budget/BudgetExportMenu';
import StatCard from '@/components/StatCard';
import { toast } from '@/components/ui/use-toast';
import useDeleteLock from '@/hooks/useDeleteLock';
import { format } from 'date-fns';
import useAutoOpenForm from '@/hooks/useAutoOpenForm';
import { fmtFull, fmtAxisCompact } from '@/lib/format';
import { BUDGET_CATEGORIES } from '@/lib/enums';

// From the single source of truth, verified against the database's
// budgets_category_check by `npm run check:enums`. This list previously
// offered 'investment', which the constraint rejects — picking it was a
// guaranteed, silent save failure.
const EXPENSE_CATS = BUDGET_CATEGORIES;
const CAT_ICONS = { housing: '🏠', food: '🍔', transport: '🚗', entertainment: '🎬', health: '💊', shopping: '🛍️', education: '📚', savings: '💰', investment: '📈', other: '💸' };
const BUDGET_SUGGESTIONS = [
  { cat: 'food', amount: 400 },
  { cat: 'transport', amount: 200 },
  { cat: 'entertainment', amount: 150 },
  { cat: 'shopping', amount: 250 },
  { cat: 'housing', amount: 1200 },
  { cat: 'health', amount: 150 },
];

function fmt(n) { return (n || 0).toLocaleString('en-US', { maximumFractionDigits: 0 }); }

function BudgetChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const spent = payload.find(p => p.dataKey === 'spent')?.value || 0;
  const limit = payload.find(p => p.dataKey === 'limit')?.value || 0;
  const over = spent > limit;
  return (
    <div className="sky-card rounded-xl px-3 py-2.5 shadow-lg border border-border">
      <p className="text-xs font-bold text-foreground capitalize mb-1.5">{label}</p>
      <p className={`text-xs font-semibold tabular-nums ${over ? 'text-red-500' : 'text-foreground'}`}>Spent · ${fmtFull(spent)}</p>
      <p className="text-xs font-semibold text-muted-foreground tabular-nums">Limit · ${fmtFull(limit)}</p>
    </div>
  );
}

export default function Budget() {
  const { runGuarded: guardDelete, isDeleting } = useDeleteLock();
  const [transactions, setTransactions] = useState([]);
  const [budgets, setBudgets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  useAutoOpenForm(() => setShowForm(true));
  const [form, setForm] = useState({ category: 'food', monthly_limit: '' });
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [saved, setSaved] = useState(false);

  const thisMonth = format(new Date(), 'yyyy-MM');

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try {
      const [tx, b] = await Promise.all([
        base44.entities.Transaction.list('-date', 50000),
        base44.entities.Budget.list(),
      ]);
      setTransactions(tx);
      setBudgets(b);
    } catch (error) {
      toast({ title: "Couldn't load your budgets", description: "Please check your connection and try again.", variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const monthTx = transactions.filter(t => t.date?.startsWith(thisMonth));

  const save = async () => {
    if (!form.monthly_limit || parseFloat(form.monthly_limit) <= 0) return;
    // Synchronous re-entry guard — see Bills.saveBill for why the
    // `disabled={saving}` state alone doesn't stop a fast double-tap.
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    try {
      const existing = budgets.find(b => b.category === form.category && b.month === thisMonth);
      if (existing) {
        await base44.entities.Budget.update(existing.id, { monthly_limit: parseFloat(form.monthly_limit) });
        toast({ title: 'Budget updated', description: form.category });
      } else {
        await base44.entities.Budget.create({ category: form.category, monthly_limit: parseFloat(form.monthly_limit), month: thisMonth });
        toast({ title: 'Budget saved', description: form.category });
      }
      setSaved(true);
      setForm({ category: 'food', monthly_limit: '' });
      setShowForm(false);
      setTimeout(() => setSaved(false), 3000);
      loadData();
    } catch (error) {
      toast({ title: "Couldn't save budget", description: "Please try again in a moment.", variant: 'destructive' });
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const deleteBudget = (id) => guardDelete(id, async () => {
    const b = budgets.find(x => x.id === id);
    if (!window.confirm(`Remove the ${b?.category || 'this'} budget limit?`)) return;
    try {
      await base44.entities.Budget.delete(id);
      toast({ title: 'Budget deleted' });
      loadData();
    } catch (error) {
      toast({ title: "Couldn't delete budget", description: "Please try again in a moment.", variant: 'destructive' });
    }
  });

  const rows = EXPENSE_CATS.map(cat => ({
    cat,
    spent: monthTx.filter(t => t.type === 'expense' && t.category === cat).reduce((s, t) => s + (t.amount || 0), 0),
    budget: budgets.find(b => b.category === cat && b.month === thisMonth),
  })).filter(d => d.spent > 0 || d.budget);

  // Only measure spending against categories that actually have a limit —
  // otherwise unbudgeted spending inflates the total against a smaller
  // budget and the page reports being over while every category is fine.
  const budgetedRows = rows.filter(r => r.budget);
  const totalBudget = budgetedRows.reduce((s, r) => s + (r.budget?.monthly_limit || 0), 0);
  const totalSpent = budgetedRows.reduce((s, r) => s + r.spent, 0);
  const budgetPct = totalBudget > 0 ? Math.min(100, Math.round((totalSpent / totalBudget) * 100)) : 0;
  const overCount = rows.filter(r => r.budget && r.spent > r.budget.monthly_limit).length;

  if (loading) {
    return (
      <div className="py-4 space-y-4">
        <div className="h-16 rounded-2xl bg-secondary/60 animate-pulse" />
        <div className="h-32 rounded-2xl bg-secondary/60 animate-pulse" />
        <div className="space-y-3">
          {[1,2,3].map(i => <div key={i} className="h-20 rounded-2xl bg-secondary/60 animate-pulse" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="py-4 pb-8">
      <PageHeader
        title="Budget"
        subtitle="Track spending against your limits"
        icon={PiggyBank}
        gradient="gradient-primary"
        showBack
        action={
          <div className="flex items-center gap-1">
            <BudgetExportMenu rows={rows} totalSpent={totalSpent} totalBudget={totalBudget} month={thisMonth} />
            <Button size="sm" onClick={() => setShowForm(true)} className="bg-primary hover:bg-primary/90 text-primary-foreground border-0 gap-1">
              <Plus className="w-3.5 h-3.5" /> Set Budget
            </Button>
          </div>
        }
      />

      {saved && (
        <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl p-3 mb-4">
          <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0" />
          <p className="text-sm text-emerald-700 font-medium">Budget saved.</p>
        </div>
      )}

      {/* Budget Health Overview */}
      {totalBudget > 0 && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            <StatCard label="Total budget" value={totalBudget} prefix="$" icon={Wallet} />
            <StatCard label="Total spent" value={totalSpent} prefix="$" tone={totalSpent > totalBudget ? 'negative' : 'default'} icon={CreditCard} />
            <StatCard label="Remaining" value={Math.abs(totalBudget - totalSpent)} prefix="$" tone={totalBudget - totalSpent < 0 ? 'negative' : 'positive'} icon={PiggyBank} />
            <StatCard label="Over limit" value={overCount} tone={overCount > 0 ? 'negative' : 'positive'} icon={AlertTriangle} />
          </div>
          <div className="sky-card rounded-2xl p-4 lg:p-5 mb-4">
            <div className="flex items-baseline justify-between mb-2.5">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Budget used</p>
              <p className="text-sm font-bold tabular-nums">{budgetPct}%</p>
            </div>
            <div className="h-2.5 bg-secondary rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-700 ${budgetPct > 100 ? 'bg-red-500' : budgetPct > 85 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                style={{ width: `${budgetPct}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              ${fmt(totalSpent)} of ${fmt(totalBudget)} this month
            </p>
          </div>

          {/* Spent vs. Limit, side by side per category — the list below
              already shows this row by row, but a chart makes "which
              categories are actually blowing the budget" scannable at a
              glance instead of reading N progress bars one at a time. */}
          {budgetedRows.length > 1 && (
            <div className="sky-card rounded-2xl p-4 lg:p-5 mb-4">
              <p className="font-bold text-sm mb-3">Spent vs. Budget</p>
              <ResponsiveContainer width="100%" height={Math.max(160, budgetedRows.length * 46)}>
                <BarChart data={budgetedRows.map(r => ({ cat: r.cat, spent: r.spent, limit: r.budget.monthly_limit }))} layout="vertical" margin={{ top: 0, right: 16, left: 8, bottom: 0 }} barGap={2}>
                  <CartesianGrid horizontal={false} stroke="hsl(var(--border))" opacity={0.4} />
                  <XAxis type="number" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} tickFormatter={v => fmtAxisCompact(v)} />
                  <YAxis type="category" dataKey="cat" tick={{ fontSize: 12, fill: 'hsl(var(--foreground))', fontWeight: 600 }} width={90} tickFormatter={v => `${CAT_ICONS[v] || ''} ${v}`} />
                  <Tooltip content={<BudgetChartTooltip />} cursor={{ fill: 'hsl(var(--secondary))', opacity: 0.4 }} />
                  <Bar dataKey="limit" fill="hsl(var(--secondary))" radius={[4, 4, 4, 4]} maxBarSize={14} />
                  <Bar dataKey="spent" radius={[4, 4, 4, 4]} maxBarSize={14}>
                    {budgetedRows.map(r => <Cell key={r.cat} fill={r.spent > r.budget.monthly_limit ? '#EF4444' : '#10B981'} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <div className="flex items-center gap-4 justify-center mt-1">
                <span className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground"><span className="w-2.5 h-2.5 rounded-full bg-secondary border border-border" /> Limit</span>
                <span className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> On track</span>
                <span className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground"><span className="w-2.5 h-2.5 rounded-full bg-red-500" /> Over</span>
              </div>
            </div>
          )}
        </>
      )}

      {/* Add Budget Form */}
      {showForm && (
        <div className="sky-card rounded-2xl p-4 mb-4">
          <div className="flex items-center justify-between mb-3">
            <p className="font-semibold text-sm">Set Monthly Budget</p>
            <button onClick={() => setShowForm(false)} className="p-2.5 -m-1 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg hover:bg-secondary active:bg-secondary/70 transition-colors"><X className="w-5 h-5 text-muted-foreground" /></button>
          </div>
          <p className="text-xs text-muted-foreground mb-2">Quick suggestions</p>
          <div className="flex gap-2 flex-wrap mb-3">
            {BUDGET_SUGGESTIONS.map(s => (
              <button
                key={s.cat}
                onClick={() => setForm({ category: s.cat, monthly_limit: String(s.amount) })}
                className="text-xs px-3 py-1 rounded-full border border-border bg-secondary hover:bg-primary/10 hover:border-primary hover:text-primary transition-all"
              >
                {CAT_ICONS[s.cat]} {s.cat.charAt(0).toUpperCase() + s.cat.slice(1)} ${s.amount}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2 mb-3">
            <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {EXPENSE_CATS.map(c => <SelectItem key={c} value={c}>{CAT_ICONS[c]} {c.charAt(0).toUpperCase() + c.slice(1)}</SelectItem>)}
              </SelectContent>
            </Select>
            <Input type="number" placeholder="Monthly limit ($)" value={form.monthly_limit} onChange={e => setForm(f => ({ ...f, monthly_limit: e.target.value }))} min="1" max="10000000" />
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setShowForm(false)} className="flex-1">Cancel</Button>
            <Button onClick={save} disabled={!form.monthly_limit || parseFloat(form.monthly_limit) <= 0 || saving} className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground border-0">
              {saving ? 'Saving…' : 'Save Budget'}
            </Button>
          </div>
        </div>
      )}

      {/* Category rows */}
      {rows.length === 0 ? (
        <div
          className="rounded-3xl p-6 relative overflow-hidden text-center"
          style={{ background: 'linear-gradient(135deg, var(--hero-from) 0%, var(--hero-via) 55%, var(--hero-to) 100%)', textShadow: '0 1px 10px rgba(0,0,0,0.35)' }}
        >
          <div className="w-16 h-16 bg-white/20 rounded-3xl flex items-center justify-center mx-auto mb-4">
            <PiggyBank className="w-8 h-8 text-white" strokeWidth={1.6} />
          </div>
          <h3 className="text-xl font-black text-white mb-2">Set your first budget</h3>
          <p className="text-white/70 text-sm mb-6 leading-relaxed max-w-xs mx-auto">
            People who budget save on average $300 more per month. Pick a category to get started.
          </p>
          <div className="grid grid-cols-3 gap-2 mb-5 max-w-xs mx-auto">
            {BUDGET_SUGGESTIONS.slice(0, 6).map(s => (
              <button
                key={s.cat}
                onClick={() => { setForm({ category: s.cat, monthly_limit: String(s.amount) }); setShowForm(true); }}
                className="rounded-2xl px-2 py-2.5 text-center transition-all active:scale-95"
                style={{ background: 'rgba(255,255,255,0.18)' }}
              >
                <div className="text-xl mb-0.5">{CAT_ICONS[s.cat]}</div>
                <div className="text-[10px] text-white font-semibold capitalize">{s.cat}</div>
                <div className="text-[10px] text-white/70">${s.amount}</div>
              </button>
            ))}
          </div>
          <Button
            onClick={() => setShowForm(true)}
            className="bg-white hover:bg-white/90 border-0 gap-1 font-bold"
            style={{ color: 'var(--hero-via)', textShadow: 'none' }}
          >
            <Plus className="w-4 h-4" /> Custom Budget
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map(({ cat, spent, budget }) => {
            const limit = budget?.monthly_limit || 0;
            const rawPct = limit > 0 ? (spent / limit) * 100 : 0;
            const pct = Math.min(100, rawPct);
            const over = limit > 0 && spent > limit;
            const close = limit > 0 && !over && rawPct >= 75;
            const remaining = limit > 0 ? limit - spent : 0;

            return (
              <div key={cat} className={`bg-card border rounded-2xl p-4 ${over ? 'border-red-200' : close ? 'border-amber-200' : 'border-border'}`}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-base">{CAT_ICONS[cat]}</span>
                    <span className="text-sm font-semibold capitalize">{cat}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {over && <div className="flex items-center gap-1 text-xs font-medium text-red-500"><AlertTriangle className="w-3 h-3" />Over</div>}
                    {close && !over && <div className="flex items-center gap-1 text-xs font-medium text-amber-500"><Clock className="w-3 h-3" />Close</div>}
                    {!over && !close && limit > 0 && <div className="flex items-center gap-1 text-xs font-medium text-emerald-500"><CheckCircle className="w-3 h-3" />On track</div>}
                    {budget && (
                      <button onClick={() => deleteBudget(budget.id)} className="text-muted-foreground hover:text-destructive p-1 transition-colors" title="Remove budget limit" aria-label="Remove budget limit">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 mb-2 text-xs">
                  <div><p className="text-muted-foreground">Spent</p><p className={`font-numeric font-bold ${over ? 'text-red-500' : ''}`}>${fmt(spent)}</p></div>
                  {limit > 0 && (
                    <>
                      <div><p className="text-muted-foreground">Limit</p><p className="font-numeric font-bold">${fmt(limit)}</p></div>
                      <div><p className="text-muted-foreground">Remaining</p><p className={`font-numeric font-bold ${remaining < 0 ? 'text-red-500' : 'text-emerald-500'}`}>{remaining < 0 ? '-' : ''}${fmt(Math.abs(remaining))}</p></div>
                    </>
                  )}
                </div>
                {limit > 0 ? (
                  <div className="h-2 bg-secondary rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${over ? 'bg-red-500' : close ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${pct}%` }} />
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">No limit set — <button onClick={() => { setForm(f => ({ ...f, category: cat })); setShowForm(true); }} className="text-primary underline">set one</button></p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}