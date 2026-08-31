import { useState, useEffect, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useNavigate } from 'react-router-dom';
import {
  format, subMonths, addMonths, startOfMonth, endOfMonth, eachDayOfInterval,
  isSameMonth, subDays, addDays, startOfYear, endOfYear, eachMonthOfInterval,
  subYears, addYears, isSameYear, isAfter, isBefore, isSameDay, parseISO,
  differenceInCalendarDays,
} from 'date-fns';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, AreaChart, Area, CartesianGrid, Sankey } from 'recharts';
import { ChevronLeft, ChevronRight, BarChart3 } from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import StatCard from '@/components/StatCard';
import ExportButtons from '@/components/finance/ExportButtons';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';

const CAT_COLORS = {
  housing: '#7C3AED', food: '#F97316', transport: '#3B82F6', entertainment: '#EC4899',
  health: '#EF4444', shopping: '#F59E0B', education: '#10B981', savings: '#059669',
  salary: '#22C55E', freelance: '#6366F1', investment: '#0EA5E9', other: '#94A3B8',
};
const CAT_ICONS = {
  housing: '🏠', food: '🍔', transport: '🚗', entertainment: '🎬', health: '💊',
  shopping: '🛍️', education: '📚', savings: '💰', salary: '💵', freelance: '💻',
  investment: '📈', other: '💸',
};
const EXPENSE_CATS = ['housing', 'food', 'transport', 'entertainment', 'health', 'shopping', 'education', 'savings', 'investment', 'other'];
const PERIODS = [
  { key: 'monthly', label: 'Monthly' },
  { key: 'biweekly', label: 'Bi-Weekly' },
  { key: 'yearly', label: 'Yearly' },
];

const fmt = (n) => (n || 0).toLocaleString('en-US', { maximumFractionDigits: 0 });

const PieTooltip = ({ active, payload }) => {
  if (active && payload?.length) {
    const { name, value } = payload[0];
    return (
      <div className="sky-card rounded-xl px-3 py-2 shadow-lg">
        <p className="text-xs font-bold capitalize">{CAT_ICONS[name]} {name}</p>
        <p className="text-sm font-black">${fmt(value)}</p>
      </div>
    );
  }
  return null;
};

// Sankey draws only the ribbons; nodes and their labels are ours to render.
function SankeyNode({ x, y, width, height, index, payload, containerWidth }) {
  const isLeaf = x + width + 6 > containerWidth - 130;
  const color = payload.color || '#94A3B8';
  if (height < 1) return null;
  return (
    <g>
      <rect x={x} y={y} width={width} height={height} fill={color} rx={3} />
      <text
        x={isLeaf ? x + width + 8 : x + width + 8}
        y={y + height / 2}
        textAnchor="start"
        dominantBaseline="middle"
        className="fill-foreground"
        style={{ fontSize: 11, fontWeight: 700 }}
      >
        {payload.name}
      </text>
      <text
        x={x + width + 8}
        y={y + height / 2 + 13}
        textAnchor="start"
        dominantBaseline="middle"
        className="fill-muted-foreground"
        style={{ fontSize: 10, fontWeight: 600 }}
      >
        ${(payload.value || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })}
        {payload.pct != null ? ` (${payload.pct}%)` : ''}
      </text>
    </g>
  );
}

function defaultCursor(period) {
  const now = new Date();
  if (period === 'biweekly') {
    const yearStart = startOfYear(now);
    const idx = Math.floor(differenceInCalendarDays(now, yearStart) / 14);
    return addDays(yearStart, idx * 14);
  }
  return now;
}

function getRange(period, cursor) {
  if (period === 'monthly') return { start: startOfMonth(cursor), end: endOfMonth(cursor), label: format(cursor, 'MMMM yyyy') };
  if (period === 'biweekly') {
    const end = addDays(cursor, 13);
    return { start: cursor, end, label: `${format(cursor, 'MMM d')} – ${format(end, 'MMM d, yyyy')}` };
  }
  return { start: startOfYear(cursor), end: endOfYear(cursor), label: format(cursor, 'yyyy') };
}

function getPrevRange(period, cursor) {
  if (period === 'monthly') { const c = subMonths(cursor, 1); return getRange('monthly', c); }
  if (period === 'biweekly') { const c = subDays(cursor, 14); return getRange('biweekly', c); }
  const c = subYears(cursor, 1); return getRange('yearly', c);
}

const inRange = (dateStr, start, end) => {
  if (!dateStr) return false;
  const d = parseISO(dateStr);
  return (isAfter(d, start) || isSameDay(d, start)) && (isBefore(d, end) || isSameDay(d, end));
};

export default function SpendingSummary() {
  const navigate = useNavigate();
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState('monthly');
  const [cursor, setCursor] = useState(() => defaultCursor('monthly'));

  useEffect(() => {
    (async () => {
      try {
        const tx = await base44.entities.Transaction.list('-date', 1000);
        setTransactions(tx);
      } catch {
        toast({ title: "Couldn't load your spending", description: "Please try again in a moment.", variant: 'destructive' });
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const expenses = useMemo(() => transactions.filter(t => t.type === 'expense'), [transactions]);

  const { start, end, label } = getRange(period, cursor);
  const prevRange = getPrevRange(period, cursor);

  const periodTx = useMemo(() => expenses.filter(t => inRange(t.date, start, end)), [expenses, start, end]);
  const prevTx = useMemo(() => expenses.filter(t => inRange(t.date, prevRange.start, prevRange.end)), [expenses, prevRange]);

  const totalSpending = periodTx.reduce((s, t) => s + (t.amount || 0), 0);
  const prevTotal = prevTx.reduce((s, t) => s + (t.amount || 0), 0);
  const changePct = prevTotal > 0 ? Math.round(((totalSpending - prevTotal) / prevTotal) * 100) : null;

  const catData = useMemo(() => EXPENSE_CATS.map(cat => ({
    name: cat,
    spent: periodTx.filter(t => t.category === cat).reduce((s, t) => s + (t.amount || 0), 0),
  })).filter(d => d.spent > 0).sort((a, b) => b.spent - a.spent), [periodTx]);

  const topCategory = catData[0];

  // Income → Spending/Savings → categories. Needs income in the period to
  // have a source to flow from, so it hides itself when there is none.
  const sankeyData = useMemo(() => {
    const income = transactions
      .filter(t => t.type === 'income' && inRange(t.date, start, end))
      .reduce((s, t) => s + (t.amount || 0), 0);
    if (income <= 0 || catData.length === 0) return null;

    const spent = catData.reduce((s, c) => s + c.spent, 0);
    if (spent <= 0) return null;

    const leftOver = Math.max(0, income - spent);
    const pct = v => Math.round((v / income) * 100);

    const nodes = [
      { name: 'Income', value: income, pct: 100, color: '#0EA5E9' },
      { name: 'Spending', value: spent, pct: pct(spent), color: '#F97316' },
      ...(leftOver > 0 ? [{ name: 'Left over', value: leftOver, pct: pct(leftOver), color: '#10B981' }] : []),
      ...catData.map(c => ({
        name: `${CAT_ICONS[c.name] || ''} ${c.name}`,
        value: c.spent,
        pct: pct(c.spent),
        color: CAT_COLORS[c.name] || '#94A3B8',
      })),
    ];

    const spendingIdx = 1;
    const catOffset = leftOver > 0 ? 3 : 2;
    const links = [
      { source: 0, target: spendingIdx, value: spent },
      ...(leftOver > 0 ? [{ source: 0, target: 2, value: leftOver }] : []),
      ...catData.map((c, i) => ({ source: spendingIdx, target: catOffset + i, value: c.spent })),
    ];

    return { nodes, links };
  }, [transactions, start, end, catData]);

  // Trend buckets: daily for monthly/biweekly, monthly for yearly
  const trendData = useMemo(() => {
    if (period === 'yearly') {
      return eachMonthOfInterval({ start, end }).map(m => {
        const key = format(m, 'yyyy-MM');
        return { key: format(m, 'MMM'), spent: Math.round(expenses.filter(t => t.date?.startsWith(key)).reduce((s, t) => s + (t.amount || 0), 0)) };
      });
    }
    return eachDayOfInterval({ start, end }).map(d => {
      const key = format(d, 'yyyy-MM-dd');
      return { key: period === 'biweekly' ? format(d, 'MMM d') : format(d, 'd'), spent: Math.round(periodTx.filter(t => t.date === key).reduce((s, t) => s + (t.amount || 0), 0)) };
    });
  }, [period, start, end, expenses, periodTx]);

  const bucketsCount = period === 'monthly' ? end.getDate() : period === 'biweekly' ? 14 : 12;
  const avgPerBucket = totalSpending / bucketsCount;
  const avgLabel = period === 'yearly' ? 'Avg / Month' : 'Avg / Day';

  const now = new Date();
  const nextDisabled =
    period === 'monthly' ? (isSameMonth(cursor, now) || isAfter(cursor, now))
    : period === 'biweekly' ? isAfter(addDays(cursor, 14), now)
    : (isSameYear(cursor, now) || isAfter(cursor, now));

  const goPrev = () => setCursor(c => period === 'monthly' ? subMonths(c, 1) : period === 'biweekly' ? subDays(c, 14) : subYears(c, 1));
  const goNext = () => { if (nextDisabled) return; setCursor(c => period === 'monthly' ? addMonths(c, 1) : period === 'biweekly' ? addDays(c, 14) : addYears(c, 1)); };

  const switchPeriod = (p) => { setPeriod(p); setCursor(defaultCursor(p)); };

  if (loading) {
    return (
      <div className="py-4">
        <div className="h-12 w-12 rounded-2xl bg-secondary animate-pulse mb-4" />
        <div className="h-24 rounded-2xl bg-secondary animate-pulse mb-3" />
        <div className="h-64 rounded-2xl bg-secondary animate-pulse" />
      </div>
    );
  }

  return (
    <div className="py-4 pb-8">
      <PageHeader
        title="Spending Summary"
        subtitle="Where your money goes"
        icon={BarChart3}
        gradient="gradient-primary"
        action={
          <ExportButtons
            allTransactions={transactions}
            periodTransactions={periodTx}
            categoryData={catData}
            totalSpending={totalSpending}
            periodLabel={label}
          />
        }
      />

      {/* Period toggle */}
      <div className="bg-secondary/70 rounded-2xl p-1.5 flex gap-1.5 mb-4">
        {PERIODS.map(p => (
          <button
            key={p.key}
            onClick={() => switchPeriod(p.key)}
            className={`flex-1 rounded-xl py-2.5 text-xs font-bold transition-all ${period === p.key ? 'bg-white shadow-md text-primary' : 'text-muted-foreground hover:bg-white/40'}`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Period navigator */}
      <div className="flex items-center justify-between sky-card rounded-2xl p-3 mb-4">
        <Button variant="ghost" size="icon" onClick={goPrev} aria-label="Previous period" className="min-h-[44px] min-w-[44px]">
          <ChevronLeft className="w-5 h-5" />
        </Button>
        <div className="text-center">
          <p className="font-bold text-sm">{label}</p>
          <p className="text-[11px] text-muted-foreground">${fmt(totalSpending)} spent</p>
        </div>
        <Button variant="ghost" size="icon" onClick={goNext} disabled={nextDisabled} aria-label="Next period" className="min-h-[44px] min-w-[44px] disabled:opacity-30">
          <ChevronRight className="w-5 h-5" />
        </Button>
      </div>

      {periodTx.length === 0 ? (
        <div className="bg-card border border-dashed border-border rounded-2xl p-10 text-center">
          <BarChart3 className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-sm font-semibold mb-1">No spending in this period</p>
          <p className="text-xs text-muted-foreground mb-4">Add some transactions to see your breakdown.</p>
          <Button size="sm" onClick={() => navigate('/finance')} className="gap-1">
            <BarChart3 className="w-3.5 h-3.5" /> Go to Money
          </Button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-4">
            <StatCard label="Total spent" value={totalSpending} prefix="$" tone="negative" />
            <StatCard label={avgLabel} value={avgPerBucket} prefix="$" />
            <StatCard
              label="Top category"
              value={topCategory ? `${CAT_ICONS[topCategory.name]} ${topCategory.name}` : '—'}
              sub={topCategory ? `$${fmt(topCategory.spent)}` : ''}
            />
            <StatCard
              label="vs previous"
              value={changePct === null ? '—' : `${changePct > 0 ? '+' : ''}${changePct}%`}
              tone={changePct === null ? 'default' : changePct > 0 ? 'negative' : 'positive'}
            />
          </div>

          {/* Money flow — where income ends up */}
          {sankeyData && (
            <div className="sky-card rounded-2xl p-4 lg:p-5 mb-4">
              <div className="flex items-baseline justify-between mb-1">
                <p className="font-bold text-sm">Money Flow</p>
                <p className="text-xs text-muted-foreground font-medium">{label}</p>
              </div>
              <p className="text-xs text-muted-foreground mb-3">
                Every dollar of income, traced to where it ended up.
              </p>
              <div className="h-[280px] lg:h-[380px] -mx-1">
                <ResponsiveContainer width="100%" height="100%">
                  <Sankey
                    data={sankeyData}
                    nodePadding={26}
                    nodeWidth={12}
                    margin={{ top: 8, right: 130, bottom: 8, left: 8 }}
                    link={{ stroke: '#93A3B8', strokeOpacity: 0.28 }}
                    node={<SankeyNode />}
                  >
                    <Tooltip
                      contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))',
                        borderRadius: 12, fontSize: 12 }}
                      formatter={v => [`$${fmt(v)}`, 'Amount']}
                    />
                  </Sankey>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Donut */}
          <div className="sky-card rounded-2xl p-4 mb-4">
            <div className="flex items-center justify-between mb-2">
              <p className="font-bold text-sm">Spending by Category</p>
              <p className="text-xs text-muted-foreground font-medium">${fmt(totalSpending)} total</p>
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={catData} dataKey="spent" nameKey="name" cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={2} strokeWidth={0}>
                  {catData.map((e) => <Cell key={e.name} fill={CAT_COLORS[e.name] || '#94A3B8'} />)}
                </Pie>
                <Tooltip content={<PieTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* Trend */}
          <div className="sky-card rounded-2xl p-4 mb-4">
            <p className="font-bold text-sm mb-3">{period === 'yearly' ? 'Monthly Spending' : 'Daily Spending Trend'}</p>
            {period === 'yearly' ? (
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={trendData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" opacity={0.4} />
                  <XAxis dataKey="key" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
                  <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} tickFormatter={v => `$${v}`} width={48} />
                  <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid hsl(var(--border))', background: 'hsl(var(--card))', fontSize: 12 }} formatter={(v) => [`$${fmt(v)}`, 'Spent']} />
                  <Bar dataKey="spent" radius={[6, 6, 0, 0]} fill="#2563EB" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <ResponsiveContainer width="100%" height={180}>
                <AreaChart data={trendData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="dailyGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#2563EB" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#2563EB" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" opacity={0.4} />
                  <XAxis dataKey="key" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} interval={period === 'monthly' ? 3 : 1} />
                  <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} tickFormatter={v => `$${v}`} width={48} />
                  <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid hsl(var(--border))', background: 'hsl(var(--card))', fontSize: 12 }} formatter={(v) => [`$${fmt(v)}`, 'Spent']} labelFormatter={(d) => `${d}`} />
                  <Area type="monotone" dataKey="spent" stroke="#2563EB" strokeWidth={2} fill="url(#dailyGrad)" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Category bars */}
          <div className="sky-card rounded-2xl p-4 mb-4">
            <p className="font-bold text-sm mb-3">Category Comparison</p>
            <ResponsiveContainer width="100%" height={Math.max(140, catData.length * 36)}>
              <BarChart data={catData} layout="vertical" margin={{ top: 0, right: 16, left: 8, bottom: 0 }}>
                <CartesianGrid horizontal={false} stroke="hsl(var(--border))" opacity={0.4} />
                <XAxis type="number" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} tickFormatter={v => `$${v}`} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: 'hsl(var(--foreground))' }} width={90} tickFormatter={(v) => `${CAT_ICONS[v] || ''} ${v}`} />
                <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid hsl(var(--border))', background: 'hsl(var(--card))', fontSize: 12 }} formatter={(v) => [`$${fmt(v)}`, 'Spent']} />
                <Bar dataKey="spent" radius={[6, 6, 6, 6]}>
                  {catData.map((e) => <Cell key={e.name} fill={CAT_COLORS[e.name] || '#94A3B8'} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Breakdown */}
          <div className="sky-card rounded-2xl p-4">
            <p className="font-bold text-sm mb-3">Breakdown</p>
            <div className="space-y-3">
              {catData.map(({ name, spent }) => {
                const pct = totalSpending > 0 ? Math.round((spent / totalSpending) * 100) : 0;
                const color = CAT_COLORS[name] || '#94A3B8';
                return (
                  <div key={name}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-semibold capitalize">{CAT_ICONS[name]} {name}</span>
                      <span className="text-xs font-bold">${fmt(spent)} <span className="text-[10px] text-muted-foreground font-medium">{pct}%</span></span>
                    </div>
                    <div className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: color + '22' }}>
                      <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}