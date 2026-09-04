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
import ExportButtons from '@/components/finance/ExportButtons';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';
import { CAT_COLORS, CategoryBadge } from '@/lib/categoryVisuals';
import { fmtAxisCompact, fmtFull, fmtCompact, heroValueSizeClass } from '@/lib/format';

// Emoji still used for spots where an icon has to embed inline in plain
// text (chart axis labels, Sankey node names) - real icon components only
// render in JSX, not as characters inside a string.
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
        style={{ fontSize: 14, fontWeight: 800 }}
      >
        {payload.name}
      </text>
      <text
        x={x + width + 8}
        y={y + height / 2 + 15}
        textAnchor="start"
        dominantBaseline="middle"
        className="fill-muted-foreground"
        style={{ fontSize: 12, fontWeight: 700 }}
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

// Reached from Home's Expenses/Income tiles with ?period=yearly&year=2026 so
// the breakdown opens already scoped to whatever window the hero was
// showing, instead of always resetting to "this month" regardless of what
// was tapped.
function initialStateFromQuery() {
  const params = new URLSearchParams(window.location.search);
  const qPeriod = params.get('period');
  if (qPeriod === 'yearly') {
    const year = parseInt(params.get('year'), 10);
    if (year) return { period: 'yearly', cursor: new Date(year, 0, 1) };
  }
  return { period: 'monthly', cursor: defaultCursor('monthly') };
}

export default function SpendingSummary() {
  const navigate = useNavigate();
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [{ period: initialPeriod, cursor: initialCursor }] = useState(initialStateFromQuery);
  const [period, setPeriod] = useState(initialPeriod);
  const [cursor, setCursor] = useState(initialCursor);
  // Was this page opened from Home with a specific period in the URL? If so
  // don't override the user's choice with the newest-data month below.
  const [openedWithExplicitPeriod] = useState(
    () => new URLSearchParams(window.location.search).has('period')
  );

  useEffect(() => {
    (async () => {
      try {
        const tx = await base44.entities.Transaction.list('-date', 50000);
        setTransactions(tx);

        // Land on the newest month that actually has spending, rather than
        // whatever month it happens to be today. Opening on the 1st or 2nd
        // showed a near-empty month ("$61 spent, −98% vs. previous") that
        // reads as a broken page instead of "the month just started".
        // Skipped when the page was opened with an explicit ?period=/&year=
        // from Home, since that's a deliberate choice by the user.
        if (!openedWithExplicitPeriod) {
          const latest = tx
            .filter(t => t.type === 'expense' && t.date)
            .reduce((max, t) => (!max || t.date > max ? t.date : max), null);
          if (latest) setCursor(parseISO(latest));
        }
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

  // A period still in progress must not be compared against a COMPLETE
  // earlier one. Three days into September against all of August reported
  // "-96% vs. previous period" — arithmetically true, and completely
  // misleading; a year with 9 months of data against a year with 1 read
  // "+3034%". Both look like the app is broken or lying.
  //
  // So when the current period hasn't finished yet, the previous one is
  // truncated to the same elapsed length: the first 3 days of September
  // against the first 3 days of August. Like against like.
  const today = new Date();
  const isPartial = end > today;
  const elapsedMs = isPartial ? today - start : end - start;

  const prevTx = useMemo(() => {
    const cutoff = isPartial
      ? new Date(prevRange.start.getTime() + elapsedMs)
      : prevRange.end;
    return expenses.filter(t => inRange(t.date, prevRange.start, cutoff));
  }, [expenses, prevRange, isPartial, elapsedMs]);

  const totalSpending = periodTx.reduce((s, t) => s + (t.amount || 0), 0);
  const prevTotal = prevTx.reduce((s, t) => s + (t.amount || 0), 0);
  const changePct = prevTotal > 0 ? Math.round(((totalSpending - prevTotal) / prevTotal) * 100) : null;
  // Say plainly what's being compared, so the number can't be misread.
  const comparisonLabel = isPartial ? 'vs. same point last period' : 'vs. previous period';

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
    // A Sankey can only show where income *went* — once spending exceeds
    // income in the window (routine now with crypto trade volume), there's
    // no real "source" for the excess to flow from. Recharts sizes each
    // node by its link totals, not the value field on the node data, so
    // forcing an Income→Spending link larger than Income itself silently
    // inflated the Income bar to match spending and made the percentages
    // stop adding up (e.g. "Spending 183%" next to an Income bar mislabeled
    // with the spending total). Hiding the diagram for this case is more
    // honest than drawing a flow that doesn't balance; the stat cards and
    // category breakdown below still show the real numbers either way.
    if (spent > income) return null;

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

  // Switching Monthly/Bi-Weekly/Yearly lands on the newest period that has
  // data, not on literal today — otherwise flipping to Monthly at the start
  // of a month drops you on an empty view again.
  const switchPeriod = (p) => {
    setPeriod(p);
    const latest = expenses.reduce((max, t) => (t.date && (!max || t.date > max) ? t.date : max), null);
    setCursor(latest ? parseISO(latest) : defaultCursor(p));
  };

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
      <PageHeader title="Spending Summary" showBack
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

      {/* Hero — same gradient-card language as Home/Budget/Totals instead of
          a plain header + a separate toggle bar + a separate nav bar + a
          separate stat grid stacked four deep. One card carries the period
          controls, the headline number, and the supporting figures. */}
      <div
        className="rounded-3xl overflow-hidden relative mb-5"
        style={{ background: 'linear-gradient(135deg, var(--hero-from) 0%, var(--hero-via) 55%, var(--hero-to) 100%)', textShadow: '0 1px 10px rgba(0,0,0,0.35)' }}
      >
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div className="aurora-blob aurora-sky1" style={{ opacity: 0.4 }} />
          <div className="aurora-blob aurora-sky2" style={{ opacity: 0.3 }} />
        </div>
        <div className="relative px-5 pt-5 pb-5 lg:px-8 lg:pt-7 lg:pb-7">
          <p className="text-white/60 text-[11px] font-semibold uppercase tracking-widest mb-3">Where Your Money Goes</p>

          <div className="flex gap-1.5 mb-4">
            {PERIODS.map(p => (
              <button
                key={p.key}
                onClick={() => switchPeriod(p.key)}
                className={`flex-1 text-[11px] font-semibold py-1.5 rounded-full border transition-all ${period === p.key ? 'bg-white text-primary border-white' : 'bg-white/10 border-white/20 text-white/70 hover:bg-white/15'}`}
              >
                {p.label}
              </button>
            ))}
          </div>

          <div className="flex items-center justify-between mb-4">
            <button onClick={goPrev} aria-label="Previous period" className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors shrink-0">
              <ChevronLeft className="w-4 h-4 text-white" />
            </button>
            <p className="text-white text-sm font-bold">{label}</p>
            <button onClick={goNext} disabled={nextDisabled} aria-label="Next period" className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors disabled:opacity-30 shrink-0">
              <ChevronRight className="w-4 h-4 text-white" />
            </button>
          </div>

          <p className="text-white/60 text-xs font-medium mb-1">Total spent</p>
          <p className={`font-numeric text-white ${heroValueSizeClass(fmtFull(totalSpending))} font-black tracking-tight leading-none mb-1.5 tabular-nums`}>
            ${fmtFull(totalSpending)}
          </p>
          <p className="text-white/75 text-xs font-semibold mb-5 h-4">
            {changePct !== null && `${changePct > 0 ? '+' : ''}${changePct}% ${comparisonLabel}`}
          </p>

          <div className="grid grid-cols-2 gap-2.5">
            <div className="bg-white/10 rounded-xl px-3 py-2.5 min-w-0">
              <p className="text-white/60 text-[10px] font-semibold uppercase tracking-wide mb-1">{avgLabel}</p>
              <p className="text-white font-black text-lg leading-tight tabular-nums truncate">{fmtCompact(avgPerBucket)}</p>
            </div>
            <div className="bg-white/10 rounded-xl px-3 py-2.5 min-w-0">
              <p className="text-white/60 text-[10px] font-semibold uppercase tracking-wide mb-1">Top category</p>
              <p className="text-white font-black text-sm leading-tight capitalize truncate">
                {topCategory ? `${CAT_ICONS[topCategory.name]} ${topCategory.name}` : '—'}
              </p>
              {topCategory && <p className="text-white/70 text-[11px] font-semibold tabular-nums mt-0.5">{fmtCompact(topCategory.spent)}</p>}
            </div>
          </div>
        </div>
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
                <BarChart data={trendData} margin={{ top: 5, right: 5, left: -4, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" opacity={0.4} />
                  <XAxis dataKey="key" tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }} />
                  <YAxis tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }} tickFormatter={v => fmtAxisCompact(v)} width={56} />
                  <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid hsl(var(--border))', background: 'hsl(var(--card))', fontSize: 12 }} formatter={(v) => [`$${fmt(v)}`, 'Spent']} />
                  <Bar dataKey="spent" radius={[6, 6, 0, 0]} fill="hsl(var(--primary))" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <ResponsiveContainer width="100%" height={180}>
                <AreaChart data={trendData} margin={{ top: 5, right: 5, left: -4, bottom: 0 }}>
                  <defs>
                    <linearGradient id="dailyGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" opacity={0.4} />
                  <XAxis dataKey="key" tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }} interval={period === 'monthly' ? 3 : 1} />
                  <YAxis tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }} tickFormatter={v => fmtAxisCompact(v)} width={56} />
                  <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid hsl(var(--border))', background: 'hsl(var(--card))', fontSize: 12 }} formatter={(v) => [`$${fmt(v)}`, 'Spent']} labelFormatter={(d) => `${d}`} />
                  <Area type="monotone" dataKey="spent" stroke="hsl(var(--primary))" strokeWidth={2} fill="url(#dailyGrad)" />
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
                <XAxis type="number" tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }} tickFormatter={v => fmtAxisCompact(v)} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 12, fill: 'hsl(var(--foreground))' }} width={90} tickFormatter={(v) => `${CAT_ICONS[v] || ''} ${v}`} />
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
                  <div key={name} className="flex items-center gap-3">
                    <CategoryBadge category={name} size="w-10 h-10" iconSize="w-[18px] h-[18px]" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-bold capitalize text-foreground truncate">{name}</span>
                        <span className="text-sm font-bold text-foreground tabular-nums shrink-0">${fmt(spent)}</span>
                      </div>
                      <p className="text-xs text-muted-foreground font-medium mt-0.5">{pct}% of spending</p>
                      <div className="h-2 rounded-full overflow-hidden mt-1.5" style={{ backgroundColor: color + '22' }}>
                        <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
                      </div>
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