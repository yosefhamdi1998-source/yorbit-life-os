import { useState } from 'react';
import { ComposedChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { BarChart3, TrendingUp, TrendingDown, ChartLine, ChartPie } from 'lucide-react';
import { fmtAxisCompact, fmtFull } from '@/lib/format';

// Three honestly-different readings of the same data, not the same chart
// redrawn: Bars compare income vs. expense bucket by bucket (the default —
// best for "which months were bad"); Line drops the bar clutter to show
// the shape of the trend across many buckets ("is this getting better");
// Pie steps back from the timeline entirely to show the split for the
// whole selected window ("out of everything, how much went out").
const CHART_TYPES = [
  { key: 'bar', label: 'Bars', icon: BarChart3 },
  { key: 'line', label: 'Line', icon: ChartLine },
  { key: 'pie', label: 'Split', icon: ChartPie },
];

export const CASH_FLOW_PERIODS = [
  { key: '1m', label: '1M', subtitle: 'Income vs. expenses, this month' },
  { key: '3m', label: '3M', subtitle: 'Income vs. expenses, last 3 months' },
  { key: '6m', label: '6M', subtitle: 'Income vs. expenses, last 6 months' },
  { key: '1y', label: '1Y', subtitle: 'Income vs. expenses, last year' },
  { key: '2y', label: '2Y', subtitle: 'Income vs. expenses, last 2 years' },
  { key: '3y', label: '3Y', subtitle: 'Income vs. expenses, last 3 years' },
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

// How far back each option reaches, so options that can only ever show
// empty space are never offered.
const PERIOD_MONTHS = { '1m': 1, '3m': 3, '6m': 6, '1y': 12, '2y': 24, '3y': 36, all: Infinity };

export default function CashFlowTrendChart({ data, period, onPeriodChange, simple, historyMonths }) {
  const [chartType, setChartType] = useState('bar');

  // Simple Mode: just "this month" and "this year" — the full 6-option
  // spread is exactly the kind of choice-overload a first-time/younger
  // user doesn't need.
  let periodOptions = simple ? CASH_FLOW_PERIODS.filter(p => p.key === '1m' || p.key === '1y') : CASH_FLOW_PERIODS;

  // Offering 2Y and 3Y to someone with nine months of history produced a
  // chart that was almost entirely blank — it read as broken rather than
  // as "no data that far back". Keep the first option that covers the full
  // history and drop anything longer.
  if (typeof historyMonths === 'number' && historyMonths > 0) {
    const covering = periodOptions.findIndex(p => PERIOD_MONTHS[p.key] >= historyMonths);
    if (covering >= 0) periodOptions = periodOptions.slice(0, covering + 1);
  }
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

  const pieData = [
    { name: 'Income', value: totalIncome, fill: '#10B981' },
    { name: 'Expenses', value: totalExpense, fill: '#F97316' },
  ].filter(d => d.value > 0);

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
        <div className="flex items-center gap-1.5 shrink-0">
          {hasAnyData && data.length > 1 && (
            <div className={`flex items-center gap-1 text-[11px] font-bold px-2 py-1 rounded-full ${improving ? 'bg-emerald-500/10 text-emerald-500' : 'bg-red-500/10 text-red-500'}`}>
              {improving ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
              {improving ? 'Improving' : 'Slipping'}
            </div>
          )}
          {/* Chart-type switcher, top-right corner — three genuinely
              different readings of the same numbers rather than the same
              chart drawn three ways. */}
          {hasAnyData && (
            <div className="flex items-center gap-0.5 bg-secondary rounded-full p-0.5">
              {CHART_TYPES.map(ct => (
                <button
                  key={ct.key}
                  onClick={() => setChartType(ct.key)}
                  aria-label={ct.label}
                  title={ct.label}
                  className={`w-6 h-6 rounded-full flex items-center justify-center transition-colors ${chartType === ct.key ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                >
                  <ct.icon className="w-3.5 h-3.5" strokeWidth={2.25} />
                </button>
              ))}
            </div>
          )}
        </div>
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
      ) : chartType === 'pie' ? (
        <>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const p = payload[0];
                  const share = totalIncome + totalExpense > 0 ? Math.round((p.value / (totalIncome + totalExpense)) * 100) : 0;
                  return (
                    <div className="rounded-xl px-3.5 py-2.5 shadow-xl border border-border/60 backdrop-blur-sm" style={{ background: 'hsl(var(--card)/0.98)' }}>
                      <p className="text-xs font-bold text-foreground">{p.name} · ${fmtFull(p.value)}</p>
                      <p className="text-[11px] text-muted-foreground">{share}% of total activity</p>
                    </div>
                  );
                }}
              />
              <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={55} outerRadius={85} paddingAngle={3} strokeWidth={0}>
                {pieData.map(d => <Cell key={d.name} fill={d.fill} />)}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          <div className="flex items-center gap-4 justify-center mt-1 flex-wrap">
            <span className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> Income · ${fmtFull(totalIncome)}</span>
            <span className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground"><span className="w-2.5 h-2.5 rounded-full bg-orange-500" /> Expenses · ${fmtFull(totalExpense)}</span>
          </div>
          <p className="text-[11px] text-muted-foreground text-center mt-1.5">Everything in {activePeriod.label.toLowerCase() === 'all' ? 'the full history' : activePeriod.subtitle.toLowerCase()}, income vs. expenses.</p>
        </>
      ) : (
        <>
          <ResponsiveContainer width="100%" height={220}>
            {chartType === 'line' ? (
              <LineChart data={data} margin={{ top: 12, right: 8, left: -4, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" opacity={0.5} />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))', fontWeight: 600 }} axisLine={false} tickLine={false} interval={tickInterval} />
                <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} width={56} tickFormatter={v => fmtAxisCompact(v)} />
                <Tooltip content={<CashFlowTooltip />} cursor={{ stroke: 'hsl(var(--border))', strokeWidth: 1 }} />
                <Line type="monotone" dataKey="income" stroke="#10B981" strokeWidth={2.5} dot={!dense} activeDot={{ r: 5 }} />
                <Line type="monotone" dataKey="expense" stroke="#F97316" strokeWidth={2.5} dot={!dense} activeDot={{ r: 5 }} />
              </LineChart>
            ) : (
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
                {/* The net line used to be drawn across the bars. It sat on
                    top of the thing people actually want to read and made the
                    bars harder to tap, and net is already stated in the
                    tooltip — so the bars now have the chart to themselves. */}
                <Bar dataKey="income" fill="url(#incomeBarGrad)" radius={dense ? [2, 2, 0, 0] : [5, 5, 0, 0]} maxBarSize={barMaxSize} />
                <Bar dataKey="expense" fill="url(#expenseBarGrad)" radius={dense ? [2, 2, 0, 0] : [5, 5, 0, 0]} maxBarSize={barMaxSize} />
              </ComposedChart>
            )}
          </ResponsiveContainer>
          <div className="flex items-center gap-4 justify-center mt-1 flex-wrap">
            <span className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> Income</span>
            <span className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground"><span className="w-2.5 h-2.5 rounded-full bg-orange-500" /> Expenses</span>
          </div>
          <p className="text-[11px] text-muted-foreground text-center mt-1.5">
            {chartType === 'line' ? "Tap a point for that period's exact numbers." : "Tap any bar for that period's exact numbers."}
          </p>
        </>
      )}
    </div>
  );
}
