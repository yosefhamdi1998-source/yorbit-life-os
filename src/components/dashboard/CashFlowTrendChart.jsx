import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { BarChart3 } from 'lucide-react';
import { fmtAxisCompact, fmtFull } from '@/lib/format';

// Fixed 6-calendar-month window (independent of the hero's period switcher
// above it) — the hero already answers "how am I doing in [this period]",
// this answers a different question ("what's the trend") that only means
// something as a multi-month picture, so it doesn't need to react to
// Week/3M/Year etc.
function CashFlowTooltip({ active, payload, label }) {
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

export default function CashFlowTrendChart({ data }) {
  const hasAnyData = data.some(d => d.income > 0 || d.expense > 0);

  return (
    <div className="sky-card rounded-2xl p-4 lg:p-5 mb-5">
      <div className="flex items-center gap-2 mb-1">
        <BarChart3 className="w-4 h-4 text-muted-foreground" />
        <p className="font-bold text-sm">Cash Flow Trend</p>
      </div>
      <p className="text-xs text-muted-foreground mb-3">Income vs. expenses, last 6 months</p>

      {!hasAnyData ? (
        <div className="h-[180px] flex items-center justify-center text-xs text-muted-foreground">
          Add some transactions to see your trend.
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={data} margin={{ top: 4, right: 4, left: -4, bottom: 0 }} barGap={3}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" opacity={0.5} />
            <XAxis dataKey="month" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))', fontWeight: 600 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} width={60} tickFormatter={v => fmtAxisCompact(v)} />
            <Tooltip content={<CashFlowTooltip />} cursor={{ fill: 'hsl(var(--secondary))', opacity: 0.4 }} />
            <Legend
              iconType="circle"
              iconSize={7}
              wrapperStyle={{ fontSize: 11, fontWeight: 600, paddingTop: 6 }}
              formatter={(v) => <span style={{ color: 'hsl(var(--muted-foreground))' }}>{v === 'income' ? 'Income' : 'Expenses'}</span>}
            />
            <Bar dataKey="income" fill="#10B981" radius={[5, 5, 0, 0]} maxBarSize={22} />
            <Bar dataKey="expense" fill="#F97316" radius={[5, 5, 0, 0]} maxBarSize={22} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
