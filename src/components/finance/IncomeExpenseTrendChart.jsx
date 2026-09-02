import { useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';
import { subMonths, format, startOfMonth, startOfDay } from 'date-fns';
import { BarChart3 } from 'lucide-react';

function fmt(n) { return (n || 0).toLocaleString('en-US', { maximumFractionDigits: 0 }); }

const PERIODS = [
  { key: '1m', label: '1M' },
  { key: '3m', label: '3M' },
  { key: '6m', label: '6M' },
  { key: '1y', label: '1Y' },
  { key: '2y', label: '2Y' },
  { key: 'all', label: 'All' },
];

const TrendTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  const income = payload.find(p => p.dataKey === 'income')?.value || 0;
  const expense = payload.find(p => p.dataKey === 'expense')?.value || 0;
  return (
    <div className="sky-card rounded-xl px-3 py-2 shadow-lg">
      <p className="text-xs font-bold text-foreground mb-1">{label}</p>
      <p className="text-xs font-semibold text-emerald-500">Income ${fmt(income)}</p>
      <p className="text-xs font-semibold text-red-500">Spending ${fmt(expense)}</p>
      <p className="text-xs font-bold text-foreground mt-0.5">Net {income - expense >= 0 ? '+' : '−'}${fmt(Math.abs(income - expense))}</p>
    </div>
  );
};

// Anchored to the latest transaction on record (not literal today) — same
// reasoning as the Home page's Cash Flow Trend: imported/historical data
// can trail today's real date, and a window counted from "right now" would
// silently show empty bars for anyone whose last transaction isn't from today.
function getLatestDate(transactions) {
  let latest = null;
  for (const t of transactions) {
    if (t.date && (!latest || t.date > latest)) latest = t.date;
  }
  return latest ? new Date(latest + 'T00:00:00') : new Date();
}

function buildSeries(transactions, period, anchor) {
  if (period === '1m') {
    const year = anchor.getFullYear();
    const month = anchor.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const series = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const key = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const dayTx = transactions.filter(t => t.date === key);
      const income = dayTx.filter(t => t.type === 'income').reduce((s, t) => s + (t.amount || 0), 0);
      const expense = dayTx.filter(t => t.type === 'expense').reduce((s, t) => s + (t.amount || 0), 0);
      series.push({ month: String(d), income: Math.round(income), expense: Math.round(expense) });
    }
    return series;
  }
  if (period === 'all') {
    const years = [...new Set(transactions.map(t => t.date?.slice(0, 4)).filter(Boolean))].sort();
    return years.map(y => {
      const yearTx = transactions.filter(t => t.date?.startsWith(y));
      const income = yearTx.filter(t => t.type === 'income').reduce((s, t) => s + (t.amount || 0), 0);
      const expense = yearTx.filter(t => t.type === 'expense').reduce((s, t) => s + (t.amount || 0), 0);
      return { month: y, income: Math.round(income), expense: Math.round(expense) };
    });
  }
  const monthsBack = { '3m': 3, '6m': 6, '1y': 12, '2y': 24 }[period] || 6;
  const series = [];
  for (let i = monthsBack - 1; i >= 0; i--) {
    const monthDate = startOfMonth(subMonths(anchor, i));
    const key = format(monthDate, 'yyyy-MM');
    const monthTx = transactions.filter(t => t.date?.startsWith(key));
    const income = monthTx.filter(t => t.type === 'income').reduce((s, t) => s + (t.amount || 0), 0);
    const expense = monthTx.filter(t => t.type === 'expense').reduce((s, t) => s + (t.amount || 0), 0);
    const label = monthsBack > 12 ? format(monthDate, 'MMM yy') : format(monthDate, 'MMM');
    series.push({ month: label, income: Math.round(income), expense: Math.round(expense) });
  }
  return series;
}

export default function IncomeExpenseTrendChart({ transactions }) {
  const [period, setPeriod] = useState('6m');
  const anchor = startOfDay(getLatestDate(transactions));
  const series = buildSeries(transactions, period, anchor);

  const hasData = series.some(s => s.income > 0 || s.expense > 0);

  // A bar per day (1M) or per month across 2 years needs thinner bars and
  // fewer tick labels than a plain 6-bar view, same thresholds as the Home
  // page's Cash Flow Trend so the two charts stay visually consistent.
  const tickInterval = series.length > 20 ? Math.ceil(series.length / 10) - 1 : 0;
  const barMaxSize = series.length > 20 ? 8 : series.length > 12 ? 14 : 28;

  return (
    <div className="sky-card rounded-2xl px-4 pt-4 pb-2 mb-4">
      <div className="flex items-center gap-2 mb-3">
        <BarChart3 className="w-4 h-4 text-muted-foreground" />
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Income vs. Spending
        </p>
      </div>
      <div className="flex gap-1.5 mb-3 overflow-x-auto">
        {PERIODS.map(p => (
          <button
            key={p.key}
            onClick={() => setPeriod(p.key)}
            className={`shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full border transition-all ${p.key === period ? 'bg-primary text-primary-foreground border-primary' : 'bg-secondary border-border text-muted-foreground hover:text-foreground'}`}
          >
            {p.label}
          </button>
        ))}
      </div>
      {!hasData ? (
        <div className="h-56 flex items-center justify-center text-xs text-muted-foreground">
          No transactions in this window yet.
        </div>
      ) : (
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={series} margin={{ top: 4, right: 4, bottom: 0, left: 0 }} barGap={series.length > 12 ? 1 : 4}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
              <XAxis dataKey="month" tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }} tickLine={false} axisLine={false} interval={tickInterval} />
              <YAxis tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }} tickLine={false} axisLine={false} width={52}
                tickFormatter={v => `$${Math.abs(v) >= 1000 ? (v / 1000).toFixed(1) + 'k' : v}`} />
              <Tooltip content={<TrendTooltip />} cursor={{ fill: 'hsl(var(--secondary))', opacity: 0.5 }} />
              <Legend
                verticalAlign="top"
                align="right"
                height={0}
                wrapperStyle={{ fontSize: 11, fontWeight: 600, paddingBottom: 8 }}
                formatter={(v) => <span style={{ color: 'hsl(var(--muted-foreground))' }}>{v}</span>}
              />
              <Bar dataKey="income" name="Income" fill="#10B981" radius={[4, 4, 0, 0]} maxBarSize={barMaxSize} />
              <Bar dataKey="expense" name="Spending" fill="#EF4444" radius={[4, 4, 0, 0]} maxBarSize={barMaxSize} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
