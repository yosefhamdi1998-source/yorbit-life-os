import { useState, useEffect, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { BarChart3, ChevronDown, TrendingUp, TrendingDown, ListChecks } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import PageHeader from '@/components/PageHeader';
import { toast } from '@/components/ui/use-toast';
import { fmtFull, fmtCompact, fmtAxisCompact } from '@/lib/format';

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function TrendTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const income = payload.find(p => p.dataKey === 'income')?.value || 0;
  const expense = payload.find(p => p.dataKey === 'expense')?.value || 0;
  return (
    <div className="sky-card rounded-xl px-3 py-2.5 shadow-lg border border-border">
      <p className="text-xs font-bold text-foreground mb-1.5">{label}</p>
      <p className="text-xs font-semibold text-emerald-500 tabular-nums">Income · ${fmtFull(income)}</p>
      <p className="text-xs font-semibold text-muted-foreground tabular-nums">Expenses · ${fmtFull(expense)}</p>
      <p className="text-xs font-bold text-foreground tabular-nums mt-1 pt-1 border-t border-border/60">
        Net · {income - expense >= 0 ? '+' : '−'}${fmtFull(Math.abs(income - expense))}
      </p>
    </div>
  );
}

export default function Totals() {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedYear, setExpandedYear] = useState(null);

  useEffect(() => {
    base44.entities.Transaction.list('-date', 50000)
      .then(setTransactions)
      .catch(() => toast({ title: "Couldn't load your totals", description: 'Please try again in a moment.', variant: 'destructive' }))
      .finally(() => setLoading(false));
  }, []);

  const { allTime, byYear, years } = useMemo(() => {
    const yearMap = {};
    let allIncome = 0, allExpense = 0, allCount = 0;

    for (const t of transactions) {
      if (!t.date) continue;
      const year = t.date.slice(0, 4);
      const month = t.date.slice(5, 7);
      if (!yearMap[year]) {
        yearMap[year] = {
          year, income: 0, expense: 0, count: 0,
          months: Array.from({ length: 12 }, (_, i) => ({ key: String(i + 1).padStart(2, '0'), name: MONTH_NAMES[i], income: 0, expense: 0, count: 0 })),
        };
      }
      const amt = t.amount || 0;
      const yr = yearMap[year];
      const mo = yr.months[parseInt(month, 10) - 1];
      yr.count += 1;
      allCount += 1;
      if (t.type === 'income') { yr.income += amt; allIncome += amt; if (mo) { mo.income += amt; mo.count += 1; } }
      else if (t.type === 'expense') { yr.expense += amt; allExpense += amt; if (mo) { mo.expense += amt; mo.count += 1; } }
    }

    const years = Object.keys(yearMap).sort((a, b) => b.localeCompare(a));
    return {
      allTime: { income: allIncome, expense: allExpense, net: allIncome - allExpense, count: allCount },
      byYear: yearMap,
      years,
    };
  }, [transactions]);

  const chartData = years.slice().reverse().map(y => ({ year: y, income: byYear[y].income, expense: byYear[y].expense }));

  if (loading) {
    return (
      <div className="py-4 space-y-4">
        <div className="h-16 rounded-2xl bg-secondary/60 animate-pulse" />
        <div className="grid grid-cols-2 gap-3">
          {[1, 2, 3, 4].map(i => <div key={i} className="h-20 rounded-2xl bg-secondary/60 animate-pulse" />)}
        </div>
        <div className="space-y-3">
          {[1, 2, 3].map(i => <div key={i} className="h-16 rounded-2xl bg-secondary/60 animate-pulse" />)}
        </div>
      </div>
    );
  }

  if (transactions.length === 0) {
    return (
      <div className="py-4 pb-8">
        <PageHeader title="Totals" subtitle="Your money, by year and month" icon={BarChart3} gradient="gradient-primary" showBack />
        <div className="sky-card rounded-2xl p-8 text-center border border-dashed border-border mt-4">
          <BarChart3 className="w-8 h-8 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-sm font-semibold text-foreground mb-1">Nothing to total yet</p>
          <p className="text-xs text-muted-foreground">Add some transactions and your all-time totals will show up here.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="py-4 pb-8">
      <PageHeader title="Totals" subtitle="Every dollar, all time — by year and month" icon={BarChart3} gradient="gradient-primary" showBack />

      {/* All-time headline */}
      <div
        className="rounded-3xl overflow-hidden relative mb-5"
        style={{ background: 'linear-gradient(135deg, var(--hero-from) 0%, var(--hero-via) 55%, var(--hero-to) 100%)', textShadow: '0 1px 10px rgba(0,0,0,0.35)' }}
      >
        <div className="relative px-5 py-5 lg:px-8 lg:py-7">
          <p className="text-white/60 text-[11px] font-semibold uppercase tracking-widest mb-2">All Time</p>
          <p className="font-numeric text-white text-3xl lg:text-5xl font-black tracking-tight leading-none mb-1.5 tabular-nums">
            {allTime.net >= 0 ? '+' : '−'}${fmtFull(Math.abs(allTime.net))}
          </p>
          <p className="text-white/70 text-xs font-semibold mb-5">
            {allTime.count.toLocaleString()} transactions across {years.length} year{years.length === 1 ? '' : 's'}
          </p>
          <div className="grid grid-cols-2 gap-2.5">
            <div className="bg-white/10 rounded-xl px-3 py-2.5" title={`$${fmtFull(allTime.income)}`}>
              <p className="text-white/60 text-[10px] font-semibold uppercase tracking-wide mb-1">Total income</p>
              <p className="text-white font-black text-lg leading-tight tabular-nums">{fmtCompact(allTime.income)}</p>
            </div>
            <div className="bg-white/10 rounded-xl px-3 py-2.5" title={`$${fmtFull(allTime.expense)}`}>
              <p className="text-white/60 text-[10px] font-semibold uppercase tracking-wide mb-1">Total expenses</p>
              <p className="text-white font-black text-lg leading-tight tabular-nums">{fmtCompact(allTime.expense)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Yearly trend chart */}
      {years.length > 1 && (
        <div className="sky-card rounded-2xl p-4 lg:p-5 mb-5">
          <p className="font-bold text-sm mb-3">Income vs. Expenses by Year</p>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={chartData} margin={{ top: 4, right: 4, left: -4, bottom: 0 }} barGap={4}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" opacity={0.5} />
              <XAxis dataKey="year" tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))', fontWeight: 700 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} width={62} tickFormatter={v => fmtAxisCompact(v)} />
              <Tooltip content={<TrendTooltip />} cursor={{ fill: 'hsl(var(--secondary))', opacity: 0.4 }} />
              <Bar dataKey="income" fill="#10B981" radius={[5, 5, 0, 0]} maxBarSize={28} />
              <Bar dataKey="expense" fill="#F97316" radius={[5, 5, 0, 0]} maxBarSize={28} />
            </BarChart>
          </ResponsiveContainer>
          <div className="flex items-center gap-4 justify-center mt-1">
            <span className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> Income</span>
            <span className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground"><span className="w-2.5 h-2.5 rounded-full bg-orange-500" /> Expenses</span>
          </div>
        </div>
      )}

      {/* Year-by-year breakdown, expandable to months */}
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2 px-1">By Year</p>
      <div className="space-y-3">
        {years.map(year => {
          const y = byYear[year];
          const net = y.income - y.expense;
          const isOpen = expandedYear === year;
          const activeMonths = y.months.filter(m => m.count > 0);
          return (
            <div key={year} className="sky-card rounded-2xl overflow-hidden">
              <button
                onClick={() => setExpandedYear(isOpen ? null : year)}
                className="w-full flex items-center justify-between px-4 py-3.5 text-left"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                    <span className="text-sm font-black text-primary">{year}</span>
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-foreground">{y.count.toLocaleString()} transactions</p>
                    <p className="text-xs text-muted-foreground">{activeMonths.length} month{activeMonths.length === 1 ? '' : 's'} with activity</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <div className="text-right">
                    <p className={`text-sm font-bold tabular-nums ${net >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                      {net >= 0 ? '+' : '−'}${fmtFull(Math.abs(net))}
                    </p>
                    <p className="text-[10px] text-muted-foreground">net</p>
                  </div>
                  <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                </div>
              </button>

              <div className="px-4 pb-3 flex items-center gap-4">
                <span className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground"><TrendingUp className="w-3.5 h-3.5 text-emerald-500" /> ${fmtFull(y.income)}</span>
                <span className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground"><TrendingDown className="w-3.5 h-3.5 text-orange-500" /> ${fmtFull(y.expense)}</span>
              </div>

              {isOpen && (
                <div className="border-t border-border/50 divide-y divide-border/40">
                  {activeMonths.length === 0 ? (
                    <p className="px-4 py-4 text-xs text-muted-foreground">No transactions this year.</p>
                  ) : activeMonths.map(m => {
                    const mNet = m.income - m.expense;
                    return (
                      <div key={m.key} className="flex items-center justify-between px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <ListChecks className="w-3.5 h-3.5 text-muted-foreground/50" />
                          <span className="text-sm font-semibold text-foreground">{m.name} {year}</span>
                          <span className="text-[10px] text-muted-foreground">· {m.count} tx</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-emerald-500 font-semibold tabular-nums hidden sm:inline">+${fmtFull(m.income)}</span>
                          <span className="text-xs text-orange-500 font-semibold tabular-nums hidden sm:inline">−${fmtFull(m.expense)}</span>
                          <span className={`text-sm font-bold tabular-nums ${mNet >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                            {mNet >= 0 ? '+' : '−'}${fmtFull(Math.abs(mNet))}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
