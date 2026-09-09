import CashFlowDetail from './CashFlowDetail';
import { getChartStyle, saveChartStyle } from '@/lib/chartPreferences';
import { useState } from 'react';
import { ComposedChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { BarChart3, ChartLine, ChartPie } from 'lucide-react';
import { fmtAxisCompact, fmtFull } from '@/lib/format';
const exactMoney = value => Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

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
  // `window` is the time phrase alone, reused by the pie caption below so
  // it isn't parsed back out of `subtitle` (that produced "...income vs.
  // expenses, last 6 months, income vs. expenses" — the phrase duplicated).
  { key: '1m', label: '1M', subtitle: 'Daily income and spending · last 30 days', window: 'the last 30 days' },
  { key: '3m', label: '3M', subtitle: 'Income vs. expenses, last 3 months', window: 'the last 3 months' },
  { key: '6m', label: '6M', subtitle: 'Income vs. expenses, last 6 months', window: 'the last 6 months' },
  { key: '1y', label: '1Y', subtitle: 'Income vs. expenses, last year', window: 'the last year' },
  { key: '2y', label: '2Y', subtitle: 'Income vs. expenses, last 2 years', window: 'the last 2 years' },
  { key: '3y', label: '3Y', subtitle: 'Income vs. expenses, last 3 years', window: 'the last 3 years' },
  { key: 'all', label: 'All', subtitle: 'Income vs. expenses, every year', window: 'the full history' },
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
          <span className="flex items-center gap-1.5 text-muted-foreground"><span className="w-2 h-2 rounded-full" style={{ background: '#2F9273' }} />Income</span>
          <span className="font-bold tabular-nums text-foreground">${fmtFull(income)}</span>
        </p>
        <p className="flex items-center justify-between gap-4 text-xs">
          <span className="flex items-center gap-1.5 text-muted-foreground"><span className="w-2 h-2 rounded-full" style={{ background: '#DD8163' }} />Expenses</span>
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
  const [chartType, setChartType] = useState(getChartStyle);
  const [selected, setSelected] = useState(null);
  const selectedIndex = selected ? data.findIndex(bucket => bucket.start === selected.start) : -1;
  const selectBucket = event => {
    const bucket = event?.activePayload?.[0]?.payload;
    if (bucket?.start) setSelected(bucket);
  };

  // Simple Mode: just "this month" and "this year" — the full 6-option
  // spread is exactly the kind of choice-overload a first-time/younger
  // user doesn't need.
  let periodOptions = simple ? CASH_FLOW_PERIODS.filter(p => p.key === '1m' || p.key === '1y') : CASH_FLOW_PERIODS;

  // Offering 3Y/All to someone with nine months of history produced a
  // chart that was almost entirely blank — it read as broken rather than
  // as "no data that far back". Keep the first option that covers the full
  // history and drop anything longer — but always keep 2Y as a floor
  // regardless of how much real history exists, per explicit request.
  if (typeof historyMonths === 'number' && historyMonths > 0) {
    const twoYearIndex = periodOptions.findIndex(p => p.key === '2y');
    const covering = periodOptions.findIndex(p => PERIOD_MONTHS[p.key] >= historyMonths);
    const cutoff = Math.max(covering, twoYearIndex);
    if (cutoff >= 0) periodOptions = periodOptions.slice(0, cutoff + 1);
  }
  const activePeriod = CASH_FLOW_PERIODS.find(p => p.key === period) || CASH_FLOW_PERIODS[2];
  const hasAnyData = data.some(d => d.income > 0 || d.expense > 0);
  const totalIncome = data.reduce((s, d) => s + d.income, 0);
  const totalExpense = data.reduce((s, d) => s + d.expense, 0);

  // A bar per day (1M) or per month across 2 years is a lot of ticks —
  // thin them out so labels never overlap, and drop the per-point dots/bar
  // radius that only read as "premium" when there's room to breathe.
  const dense = data.length > 12;
  const tickInterval = data.length > 20 ? Math.ceil(data.length / 10) - 1 : 0;
  const barMaxSize = data.length > 20 ? 8 : data.length > 12 ? 14 : 22;

  const pieData = [
    { name: 'Income', value: totalIncome, fill: '#2F9273' },
    { name: 'Expenses', value: totalExpense, fill: '#DD8163' },
  ].filter(d => d.value > 0);

  return (
    <div className="sky-card rounded-2xl p-4 lg:p-5 mb-5 relative overflow-hidden">
      {/* Dropping the repeated period text (previous fix) helped but didn't
          fully solve it — icon + 2-line title/subtitle competing with the
          Improving badge + 3-icon toggle in one unwrapped row still had
          nowhere to go on a narrow phone. flex-wrap is the actual fix: the
          right-hand cluster drops to its own row the moment it doesn't
          fit, instead of squeezing the left side into truncating. Checked
          every other card header in the app for this same combination
          (title+subtitle block fighting a badge/button cluster) — this is
          the only one that has it; nothing else needed this treatment. */}
      <div className="flex flex-wrap items-start justify-between mb-3 gap-x-2 gap-y-1.5">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <BarChart3 className="w-4 h-4 text-primary" />
          </div>
          <div className="min-w-0">
            <p className="font-bold text-sm leading-tight">Income & spending</p>
            <p className="text-xs text-muted-foreground truncate">{activePeriod.subtitle}</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0 ml-auto">
          {/* Chart-type switcher, top-right corner — three genuinely
              different readings of the same numbers rather than the same
              chart drawn three ways. */}
          {hasAnyData && (
            <div className="flex items-center gap-0.5 bg-secondary rounded-full p-0.5">
              {CHART_TYPES.map(ct => (
                <button
                  key={ct.key}
                  onClick={() => { setChartType(ct.key); saveChartStyle(ct.key); }}
                  aria-label={ct.label}
                  aria-pressed={chartType === ct.key}
                  title={ct.label}
                  // Was w-6 h-6 (24x24px) — well under the ~44px tap-target
                  // guideline, three of them side by side. Bumped as far as
                  // this compact pill can go without changing the design.
                  className={`w-11 h-11 rounded-full flex items-center justify-center transition-colors ${chartType === ct.key ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                >
                  <ct.icon className="w-4 h-4" strokeWidth={2.25} />
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
            onClick={() => { setSelected(null); onPeriodChange(p.key); }}
            aria-pressed={p.key === activePeriod.key}
            className={`shrink-0 min-h-[44px] text-xs font-semibold px-3 py-1 rounded-full border transition-all ${p.key === activePeriod.key ? 'bg-primary text-primary-foreground border-primary' : 'bg-secondary border-border text-muted-foreground hover:text-foreground'}`}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3 text-center pb-4 mb-2 border-b border-border/60">
        <div><p className="text-xs text-muted-foreground flex items-center justify-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-600" />Income</p><p className="money-figure mt-2">${fmtFull(totalIncome)}</p></div>
        <div><p className="text-xs text-muted-foreground flex items-center justify-center gap-1.5"><span className="w-2 h-2 rounded-full bg-orange-400" />Spending</p><p className="money-figure mt-2">${fmtFull(totalExpense)}</p></div>
      </div>
      {!hasAnyData ? (
        <div className="h-[200px] flex items-center justify-center text-xs text-muted-foreground">
          {totalIncome === 0 && totalExpense === 0 && data.length === 0
            ? 'No transactions in this window yet.'
            : 'Add some transactions to see your trend.'}
        </div>
      ) : chartType === 'pie' ? (
        <>
          <ResponsiveContainer width="100%" height={240}>
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
            <span className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground"><span className="w-2.5 h-2.5 rounded-full" style={{ background: '#2F9273' }} /> Income · ${fmtFull(totalIncome)}</span>
            <span className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground"><span className="w-2.5 h-2.5 rounded-full" style={{ background: '#DD8163' }} /> Expenses · ${fmtFull(totalExpense)}</span>
          </div>
          <p className="text-[11px] text-muted-foreground text-center mt-1.5">Income vs. expenses, {activePeriod.window}.</p>
        </>
      ) : (
        <>
          <div className="h-[240px] sm:h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            {chartType === 'line' ? (
              <LineChart onClick={selectBucket} accessibilityLayer data={data} margin={{ top: 12, right: 8, left: -4, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="hsl(var(--border))" opacity={0.45} />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))', fontWeight: 600 }} axisLine={false} tickLine={false} interval={tickInterval} />
                <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} width={56} tickFormatter={v => fmtAxisCompact(v)} />
                <Tooltip content={<CashFlowTooltip />} cursor={{ stroke: 'hsl(var(--border))', strokeWidth: 1 }} />
                <Line type="monotone" dataKey="income" stroke="#2F9273" strokeWidth={2.5} dot={!dense} activeDot={{ r: 5 }} />
                <Line type="monotone" dataKey="expense" stroke="#DD8163" strokeDasharray="6 4" strokeWidth={2.5} dot={!dense} activeDot={{ r: 5 }} />
              </LineChart>
            ) : (
              <ComposedChart onClick={selectBucket} accessibilityLayer data={data} margin={{ top: 12, right: 8, left: -4, bottom: 0 }} barGap={dense ? 1 : 4}>
                <defs>
                  <linearGradient id="incomeBarGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#2F9273" stopOpacity={1} />
                    <stop offset="100%" stopColor="#2F9273" stopOpacity={0.55} />
                  </linearGradient>
                  <linearGradient id="expenseBarGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#DD8163" stopOpacity={1} />
                    <stop offset="100%" stopColor="#DD8163" stopOpacity={0.55} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke="hsl(var(--border))" opacity={0.45} />
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
          </div>
          <div className="flex items-center gap-4 justify-center mt-1 flex-wrap">
            <span className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground"><span className="w-2.5 h-2.5 rounded-full" style={{ background: '#2F9273' }} /> Income</span>
            <span className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground"><span className="w-2.5 h-2.5 rounded-full" style={{ background: '#DD8163' }} /> Expenses</span>
          </div>
          <p className="text-[11px] text-muted-foreground text-center mt-1.5">
            Select a period to explore its categories and transactions.
          </p>
        </>
      )}
      {hasAnyData && <label className="flex items-center justify-between gap-3 mt-4 pt-3 border-t border-border/60 text-xs text-muted-foreground">
        Explore a period
        <select aria-label="Explore chart period" value="" onChange={e => { const bucket = data[Number(e.target.value)]; if (bucket?.start) setSelected(bucket); }} className="min-h-[44px] max-w-[65%] rounded-lg border border-border bg-card text-foreground px-3 text-sm">
          <option value="" disabled>Choose month or date</option>
          {data.map((bucket, i) => <option key={bucket.start || i} value={i}>{bucket.label || bucket.month}</option>)}
        </select>
      </label>}
      {hasAnyData && <details className="mt-3 border-t border-border/60 pt-3">
        <summary className="min-h-[44px] cursor-pointer text-sm font-semibold text-primary py-3">View period totals</summary>
        <p className="text-xs text-muted-foreground mb-3">Recorded activity only. Empty periods may mean missing history. Select a date to explore its records.</p>
        <div className="overflow-x-auto max-h-80 rounded-xl border border-border">
          <table className="w-full text-xs text-right tabular-nums">
            <caption className="sr-only">Income, spending, and net by period</caption>
            <thead className="sticky top-0 bg-card"><tr className="border-b border-border"><th scope="col" className="p-3 text-left">Period</th><th scope="col" className="p-3">Income</th><th scope="col" className="p-3">Spending</th><th scope="col" className="p-3">Net</th></tr></thead>
            <tbody>{data.map((bucket, i) => <tr key={bucket.start || i} className="border-b border-border/50 last:border-0 hover:bg-secondary/50">
              <th scope="row" className="text-left font-medium"><button className="min-h-[44px] px-3 text-primary text-left" onClick={() => setSelected(bucket)}>{bucket.label || bucket.month}</button></th>
              <td className="p-3 whitespace-nowrap">${exactMoney(bucket.income)}</td><td className="p-3 whitespace-nowrap">${exactMoney(bucket.expense)}</td>
              <td className="p-3 whitespace-nowrap">{bucket.income >= bucket.expense ? '+' : '−'}${exactMoney(Math.abs(bucket.income - bucket.expense))}</td>
            </tr>)}</tbody>
          </table>
        </div>
      </details>}
      <CashFlowDetail bucket={selected} onClose={() => setSelected(null)}
        onPrevious={selectedIndex > 0 ? () => setSelected(data[selectedIndex - 1]) : undefined}
        onNext={selectedIndex >= 0 && selectedIndex < data.length - 1 ? () => setSelected(data[selectedIndex + 1]) : undefined} />
    </div>
  );
}
