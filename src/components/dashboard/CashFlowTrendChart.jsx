import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Dot } from 'recharts';
import { BarChart3, TrendingUp, TrendingDown } from 'lucide-react';
import { fmtAxisCompact, fmtFull } from '@/lib/format';

export const CASH_FLOW_PERIODS = [
  { key: '1m', label: '1M', subtitle: 'Income vs. expenses, this month' },
  { key: '3m', label: '3M', subtitle: 'Income vs. expenses, last 3 months' },
  { key: '6m', label: '6M', subtitle: 'Income vs. expenses, last 6 months' },
  { key: '1y', label: '1Y', subtitle: 'Income vs. expenses, last year' },
  { key: '2y', label: '2Y', subtitle: 'Income vs. expenses, last 2 years' },
  { key: 'all', label: 'All', subtitle: 'Income vs. expenses, every year' },
];

function CashFlowTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const income = payload.find(p => p.dataKey === 'income')?.value || 0;
  const expense = payload.find(p => p.dataKey === 'expense')?.value || 0;
  const net = income - expense;
  return (
    <div className="rounded-xl px-3.5 py-3 shadow-xl border border-border/60 backdrop-blur-sm" style={{ background: 'hsl(var(--card)/0.98)' }}>
      <p className="text-xs font-bold text-foreground mb-2">{label}</p>
      <div className="space-y-1">
        <p className="flex items-center justify-between gap-4 text-xs">
          <span className="flex items-center gap-1.5 text-muted-foreground"><span className="w-2 h-2 rounded-full bg-emerald-500" />Income</span>
          <span className="font-bold tabular-nums text-foreground">${fmtFull(income)}</span>
        </p>
        <p className="flex items-center justify-between gap-4 text-xs">
          <span className="flex items-center gap-1.5 text-muted-foreground"><span className="w-2 h-2 rounded-full bg-orange-500" />Expenses</span>
          <span className="font-bold tabular-nums text-foreground">${fmtFull(expense)}</span>
        </p>
      </div>
      <p className="flex items-center justify-between gap-4 text-xs font-bold tabular-nums mt-2 pt-2 border-t border-border/60">
        <span className="text-muted-foreground">Net</span>
        <span className={net >= 0 ? 'text-emerald-500' : 'text-red-500'}>{net >= 0 ? '+' : '−'}${fmtFull(Math.abs(net))}</span>
      </p>
    </div>
  );
}

// A filled dot with a white ring reads as "premium chart" — plain recharts
// dots look flat against a colored line at this size. Skipped entirely once
// there are enough bars (1M/2Y) that a dot per bar would just be visual
// noise on top of the line.
function NetDot(props) {
  const { cx, cy, showDots } = props;
  if (!showDots || cx == null || cy == null) return null;
  return (
    <g>
      <circle cx={cx} cy={cy} r={5} fill="hsl(var(--card))" stroke="#818cf8" strokeWidth={2} />
      <circle cx={cx} cy={cy} r={2} fill="#818cf8" />
    </g>
  );
}

export default function CashFlowTrendChart({ data, period, onPeriodChange, simple }) {
  // Simple Mode: just "this month" and "this year" — the full 6-option
  // spread is exactly the kind of choice-overload a first-time/younger
  // user doesn't need.
  const periodOptions = simple ? CASH_FLOW_PERIODS.filter(p => p.key === '1m' || p.key === '1y') : CASH_FLOW_PERIODS;
  const activePeriod = CASH_FLOW_PERIODS.find(p => p.key === period) || CASH_FLOW_PERIODS[2];
  const hasAnyData = data.some(d => d.income > 0 || d.expense > 0);
  const totalIncome = data.reduce((s, d) => s + d.income, 0);
  const totalExpense = data.reduce((s, d) => s + d.expense, 0);

  // First half vs. second half of the window, for a lightweight "is this
  // getting better or worse" signal in the header — cheap to compute, no
  // extra fetch, and it's the one thing a static bar chart can't say for
  // itself at a glance.
  const mid = Math.ceil(data.length / 2);
  const firstHalfNet = data.slice(0, mid).reduce((s, d) => s + (d.income - d.expense), 0);
  const secondHalfNet = data.slice(mid).reduce((s, d) => s + (d.income - d.expense), 0);
  const improving = secondHalfNet > firstHalfNet;

  // A bar per day (1M) or per month across 2 years is a lot of ticks —
  // thin them out so labels never overlap, and drop the per-point dots/bar
  // radius that only read as "premium" when there's room to breathe.
  const dense = data.length > 12;
  const tickInterval = data.length > 20 ? Math.ceil(data.length / 10) - 1 : 0;
  const barMaxSize = data.length > 20 ? 8 : data.length > 12 ? 14 : 22;

  return (
    <div className="sky-card rounded-2xl p-4 lg:p-5 mb-5 relative overflow-hidden">
      <div className="flex items-start justify-between mb-3 gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <BarChart3 className="w-4 h-4 text-primary" />
          </div>
          <div className="min-w-0">
            <p className="font-bold text-sm leading-tight">Cash Flow Trend</p>
            <p className="text-xs text-muted-foreground truncate">{activePeriod.subtitle}</p>
          </div>
        </div>
        {hasAnyData && data.length > 1 && (
          <div className={`shrink-0 flex items-center gap-1 text-[11px] font-bold px-2 py-1 rounded-full ${improving ? 'bg-emerald-500/10 text-emerald-500' : 'bg-red-500/10 text-red-500'}`}>
            {improving ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
            {improving ? 'Improving' : 'Slipping'}
          </div>
        )}
      </div>

      <div className="flex gap-1.5 mb-3 overflow-x-auto">
        {periodOptions.map(p => (
          <button
            key={p.key}
            onClick={() => onPeriodChange(p.key)}
            className={`shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full border transition-all ${p.key === activePeriod.key ? 'bg-primary text-primary-foreground border-primary' : 'bg-secondary border-border text-muted-foreground hover:text-foreground'}`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {!hasAnyData ? (
        <div className="h-[200px] flex items-center justify-center text-xs text-muted-foreground">
          {totalIncome === 0 && totalExpense === 0 && data.length === 0
            ? 'No transactions in this window yet.'
            : 'Add some transactions to see your trend.'}
        </div>
      ) : (
        <>
          <ResponsiveContainer width="100%" height={220}>
            <ComposedChart data={data} margin={{ top: 12, right: 8, left: -4, bottom: 0 }} barGap={dense ? 1 : 4}>
              <defs>
                <linearGradient id="incomeBarGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10B981" stopOpacity={1} />
                  <stop offset="100%" stopColor="#10B981" stopOpacity={0.55} />
                </linearGradient>
                <linearGradient id="expenseBarGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#F97316" stopOpacity={1} />
                  <stop offset="100%" stopColor="#F97316" stopOpacity={0.55} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" opacity={0.5} />
              <XAxis
                dataKey="month"
                tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))', fontWeight: 600 }}
                axisLine={false}
                tickLine={false}
                interval={tickInterval}
              />
              <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} width={56} tickFormatter={v => fmtAxisCompact(v)} />
              <Tooltip content={<CashFlowTooltip />} cursor={{ fill: 'hsl(var(--secondary))', opacity: 0.35 }} />
              <Bar dataKey="income" fill="url(#incomeBarGrad)" radius={dense ? [2, 2, 0, 0] : [5, 5, 0, 0]} maxBarSize={barMaxSize} />
              <Bar dataKey="expense" fill="url(#expenseBarGrad)" radius={dense ? [2, 2, 0, 0] : [5, 5, 0, 0]} maxBarSize={barMaxSize} />
              <Line
                type="monotone"
                dataKey="net"
                stroke="#818cf8"
                strokeWidth={2.5}
                dot={<NetDot showDots={!dense} />}
                activeDot={{ r: 6, fill: '#818cf8', stroke: 'hsl(var(--card))', strokeWidth: 2 }}
              />
            </ComposedChart>
          </ResponsiveContainer>
          <div className="flex items-center gap-4 justify-center mt-1 flex-wrap">
            <span className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> Income</span>
            <span className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground"><span className="w-2.5 h-2.5 rounded-full bg-orange-500" /> Expenses</span>
            <span className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground"><span className="w-2.5 h-2.5 rounded-full bg-indigo-400" /> Net</span>
          </div>
        </>
      )}
    </div>
  );
}
