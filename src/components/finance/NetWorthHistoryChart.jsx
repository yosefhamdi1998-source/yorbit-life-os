import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { format } from 'date-fns';
import { TrendingUp } from 'lucide-react';

function fmt(n) { return (n || 0).toLocaleString('en-US', { maximumFractionDigits: 0 }); }

export default function NetWorthHistoryChart({ entries }) {
  const sorted = [...(entries || [])]
    .filter(e => e.created_date)
    .sort((a, b) => new Date(a.created_date) - new Date(b.created_date));

  if (sorted.length < 2) {
    return (
      <div className="sky-card rounded-2xl p-6 mb-4 text-center">
        <TrendingUp className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
        <p className="text-sm font-semibold text-foreground mb-1">Not enough history yet</p>
        <p className="text-xs text-muted-foreground">Add 2+ net worth entries over time to see your trend here.</p>
      </div>
    );
  }

  let running = 0;
  const series = sorted.map(e => {
    running += e.type === 'liability' ? -(e.value || 0) : (e.value || 0);
    return { date: format(new Date(e.created_date), 'MMM d'), net: Math.round(running) };
  });
  const latest = series[series.length - 1].net;
  const first = series[0].net;
  const change = latest - first;

  return (
    <div className="sky-card rounded-2xl px-4 pt-4 pb-2 mb-4">
      <div className="flex items-baseline justify-between mb-3">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Net Worth History</p>
        <p className={`text-sm font-bold ${change >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
          {change >= 0 ? '+' : '−'}${fmt(Math.abs(change))} all time
        </p>
      </div>
      <div className="h-48 -ml-2">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={series} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="netWorthFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#10B981" stopOpacity={0.35} />
                <stop offset="100%" stopColor="#10B981" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
            <XAxis dataKey="date" tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
              tickLine={false} axisLine={false} minTickGap={28} />
            <YAxis tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
              tickLine={false} axisLine={false} width={52}
              tickFormatter={v => `$${Math.abs(v) >= 1000 ? (v / 1000).toFixed(1) + 'k' : v}`} />
            <Tooltip
              contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 12, fontSize: 12 }}
              labelStyle={{ color: 'hsl(var(--muted-foreground))' }}
              formatter={v => [`$${fmt(v)}`, 'Net worth']}
            />
            <Area type="monotone" dataKey="net" stroke="#10B981" strokeWidth={2.5} fill="url(#netWorthFill)"
              dot={(props) => {
                const isLast = props.index === series.length - 1;
                if (!isLast) return <g key={props.index} />;
                return (
                  <g key={props.index}>
                    <circle cx={props.cx} cy={props.cy} r={7} fill="#10B981" fillOpacity={0.18} />
                    <circle cx={props.cx} cy={props.cy} r={3.5} fill="#10B981" stroke="white" strokeWidth={1.5} />
                  </g>
                );
              }}
              activeDot={{ r: 4.5, fill: '#10B981', stroke: 'white', strokeWidth: 1.5 }} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
