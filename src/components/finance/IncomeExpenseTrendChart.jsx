import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';
import { subMonths, format, startOfMonth } from 'date-fns';
import { BarChart3 } from 'lucide-react';

function fmt(n) { return (n || 0).toLocaleString('en-US', { maximumFractionDigits: 0 }); }

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

export default function IncomeExpenseTrendChart({ transactions, months = 6 }) {
  const series = [];
  for (let i = months - 1; i >= 0; i--) {
    const monthDate = startOfMonth(subMonths(new Date(), i));
    const key = format(monthDate, 'yyyy-MM');
    const monthTx = transactions.filter(t => t.date?.startsWith(key));
    const income = monthTx.filter(t => t.type === 'income').reduce((s, t) => s + (t.amount || 0), 0);
    const expense = monthTx.filter(t => t.type === 'expense').reduce((s, t) => s + (t.amount || 0), 0);
    series.push({ month: format(monthDate, 'MMM'), income: Math.round(income), expense: Math.round(expense) });
  }

  const hasData = series.some(s => s.income > 0 || s.expense > 0);
  if (!hasData) return null;

  return (
    <div className="sky-card rounded-2xl px-4 pt-4 pb-2 mb-4">
      <div className="flex items-center gap-2 mb-3">
        <BarChart3 className="w-4 h-4 text-muted-foreground" />
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Income vs. Spending · Last {months} Months
        </p>
      </div>
      <div className="h-56 -ml-2">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={series} margin={{ top: 4, right: 4, bottom: 0, left: 0 }} barGap={4}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
            <XAxis dataKey="month" tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }} tickLine={false} axisLine={false} />
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
            <Bar dataKey="income" name="Income" fill="#10B981" radius={[4, 4, 0, 0]} maxBarSize={28} />
            <Bar dataKey="expense" name="Spending" fill="#EF4444" radius={[4, 4, 0, 0]} maxBarSize={28} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
