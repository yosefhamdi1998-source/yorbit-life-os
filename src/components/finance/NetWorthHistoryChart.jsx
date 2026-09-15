import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { format, parseISO } from 'date-fns';
import { TrendingUp } from 'lucide-react';

function fmt(n) { return (n || 0).toLocaleString('en-US', { maximumFractionDigits: 0 }); }

export default function NetWorthHistoryChart({ entries }) {
  const sorted = [...(entries || [])]
    .filter(e => e.created_date && Number.isFinite(parseISO(e.created_date).getTime()))
    .sort((a, b) => parseISO(a.created_date) - parseISO(b.created_date));

  if (sorted.length < 2) {
    return (
      <div className="sky-card rounded-2xl p-6 mb-4 text-center">
        <TrendingUp className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
        <p className="text-sm font-semibold text-foreground mb-1">Manual entries</p>
        <p className="text-xs text-muted-foreground">Add an asset or liability to track its current value. Historical balance snapshots are not recorded yet.</p>
      </div>
    );
  }

  let running = 0;
  const series = sorted.map(e => {
    running += e.type === 'liability' ? -(e.value || 0) : (e.value || 0);
    return { date: format(parseISO(e.created_date), 'MMM d, yyyy'), net: Math.round(running) };
  });
  const latest = series[series.length - 1].net;

  return (
    <div className="sky-card rounded-2xl px-4 pt-4 pb-2 mb-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Recorded manual entries</p>
        <p className={`text-sm font-bold ${latest >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
          {latest < 0 ? '−' : ''}${fmt(Math.abs(latest))} recorded
        </p>
      </div>
      <p className="text-xs text-muted-foreground mb-3">Running total of current manual values, ordered by date added. Excludes bank balances; this is not historical balance growth.</p>
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={series} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="netWorthFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--chart-income, #2F9273)" stopOpacity={0.35} />
                <stop offset="100%" stopColor="var(--chart-income, #2F9273)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke="hsl(var(--border))" opacity={0.45} />
            <XAxis dataKey="date" tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
              tickLine={false} axisLine={false} minTickGap={28} />
            <YAxis tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
              tickLine={false} axisLine={false} width={52}
              tickFormatter={v => `$${Math.abs(v) >= 1000 ? (v / 1000).toFixed(1) + 'k' : v}`} />
            <Tooltip
              contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 12, fontSize: 12 }}
              labelStyle={{ color: 'hsl(var(--muted-foreground))' }}
              formatter={v => [`$${fmt(v)}`, 'Recorded manual balance']}
            />
            <Area type="monotone" dataKey="net" stroke="var(--chart-income, #2F9273)" strokeWidth={2.5} fill="url(#netWorthFill)"
              dot={(props) => {
                const isLast = props.index === series.length - 1;
                if (!isLast) return <g key={props.index} />;
                return (
                  <g key={props.index}>
                    <circle cx={props.cx} cy={props.cy} r={7} fill="var(--chart-income, #2F9273)" fillOpacity={0.18} />
                    <circle cx={props.cx} cy={props.cy} r={3.5} fill="var(--chart-income, #2F9273)" stroke="white" strokeWidth={1.5} />
                  </g>
                );
              }}
              activeDot={{ r: 4.5, fill: 'var(--chart-income, #2F9273)', stroke: 'white', strokeWidth: 1.5 }} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
