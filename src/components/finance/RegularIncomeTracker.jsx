import { useMemo } from 'react';
import { format, subMonths } from 'date-fns';
import { TrendingUp, TrendingDown, RefreshCw, AlertCircle, ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';

function fmt(n) {
  return (n || 0).toLocaleString('en-US', { maximumFractionDigits: 0 });
}

function detectRecurring(transactions) {
  const now = new Date();
  const months = Array.from({ length: 6 }, (_, i) => format(subMonths(now, i), 'yyyy-MM'));
  const thisMonth = months[0];
  const lastMonth = months[1];

  const byTitle = {};
  transactions.forEach(tx => {
    if (tx.type !== 'income') return;
    if (!tx.date || !tx.title) return;
    const month = tx.date.slice(0, 7);
    if (!months.includes(month)) return;
    const key = tx.title.trim().toLowerCase();
    if (!byTitle[key]) byTitle[key] = { title: tx.title, entries: [] };
    byTitle[key].entries.push({ month, amount: tx.amount || 0 });
  });

  const recurring = [];
  Object.values(byTitle).forEach(({ title, entries }) => {
    const uniqueMonths = [...new Set(entries.map(e => e.month))];
    if (uniqueMonths.length < 2) return;

    const thisAmt = entries.filter(e => e.month === thisMonth).reduce((s, e) => s + e.amount, 0);
    const lastAmt = entries.filter(e => e.month === lastMonth).reduce((s, e) => s + e.amount, 0);
    const avg = entries.reduce((s, e) => s + e.amount, 0) / uniqueMonths.length;

    let status;
    if (thisAmt === 0 && lastAmt > 0) status = 'missing';
    else if (thisAmt === 0)            status = 'inactive';
    else if (thisAmt < lastAmt * 0.8)  status = 'lower';
    else if (thisAmt > lastAmt * 1.1)  status = 'higher';
    else                                status = 'on_track';

    recurring.push({ title, thisAmt, lastAmt, avg, status, monthCount: uniqueMonths.length });
  });

  return recurring.sort((a, b) => b.avg - a.avg);
}

const STATUS = {
  missing:  { label: 'Not received yet',   blurb: s => `We haven't seen your usual ${s.toLowerCase()} deposit yet.`,   color: 'text-red-500',    bg: 'bg-red-50 border-red-100',       icon: AlertCircle },
  lower:    { label: 'Lower than usual',    blurb: s => `${s} came in lower than usual this month.`,                     color: 'text-amber-500',  bg: 'bg-amber-50 border-amber-100',   icon: TrendingDown },
  on_track: { label: 'On track',            blurb: s => `${s} looks on track.`,                                          color: 'text-emerald-600',bg: 'bg-emerald-50 border-emerald-100', icon: RefreshCw },
  higher:   { label: 'Higher than usual',   blurb: s => `${s} is higher than usual — nice!`,                             color: 'text-emerald-600',bg: 'bg-emerald-50 border-emerald-100', icon: TrendingUp },
  inactive: { label: 'Not yet this month',  blurb: s => `${s} hasn't arrived yet this month.`,                           color: 'text-muted-foreground', bg: 'bg-secondary border-border', icon: RefreshCw },
};

export default function RegularIncomeTracker({ transactions }) {
  const now = new Date();
  const thisMonth = format(now, 'yyyy-MM');
  const lastMonth = format(subMonths(now, 1), 'yyyy-MM');

  const recurring = useMemo(() => detectRecurring(transactions), [transactions]);

  // Only render if at least one recurring income source is detected
  if (recurring.length === 0) return null;

  const expectedThis = recurring.reduce((s, r) => s + (r.thisAmt || r.avg), 0);
  const totalLast = recurring.reduce((s, r) => s + r.lastAmt, 0);
  const delta = expectedThis - totalLast;
  const deltaPct = totalLast > 0 ? Math.round((delta / totalLast) * 100) : 0;

  const visible = recurring.slice(0, 3);
  const hasMore = recurring.length > 3;

  return (
    <div className="sky-card rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-4 pb-3">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-emerald-500/15 flex items-center justify-center">
            <RefreshCw className="w-3.5 h-3.5 text-emerald-600" />
          </div>
          <div>
            <p className="text-sm font-bold text-foreground leading-none">Regular Income</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">Track paychecks and other income that usually repeat.</p>
          </div>
        </div>
      </div>

      {/* Summary */}
      <div className="mx-4 mb-3 rounded-xl bg-gradient-to-r from-emerald-500/8 to-blue-500/8 border border-emerald-200/50 p-3">
        <div className="flex items-end justify-between">
          <div>
            <p className="text-[10px] text-muted-foreground font-medium mb-0.5">Expected this month</p>
            <p className="text-2xl font-black text-foreground leading-none">${fmt(expectedThis)}</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] text-muted-foreground mb-0.5">Last month</p>
            <p className="text-sm font-semibold text-foreground">${fmt(totalLast)}</p>
            {totalLast > 0 && (
              <div className={`flex items-center gap-0.5 justify-end text-xs font-bold ${delta >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                {delta >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                {delta >= 0 ? '+' : ''}{deltaPct}% change
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Per-source rows */}
      <div className="px-4 pb-4 space-y-2">
        {visible.map((r) => {
          const cfg = STATUS[r.status];
          const Icon = cfg.icon;
          return (
            <div key={r.title} className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 ${cfg.bg}`}>
              <Icon className={`w-3.5 h-3.5 shrink-0 ${cfg.color}`} />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-foreground truncate">{r.title}</p>
                <p className="text-[10px] text-muted-foreground">
                  Avg ${fmt(r.avg)}/mo · seen {r.monthCount} month{r.monthCount !== 1 ? 's' : ''}
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className={`text-xs font-bold ${r.status === 'missing' ? 'text-red-400' : 'text-foreground'}`}>
                  {r.thisAmt > 0 ? `$${fmt(r.thisAmt)}` : '—'}
                </p>
                <p className={`text-[10px] font-medium ${cfg.color}`}>{cfg.label}</p>
              </div>
            </div>
          );
        })}

        {hasMore && (
          <Link to="/finance" className="flex items-center justify-center gap-1 text-xs text-primary font-semibold pt-1">
            View all income sources <ChevronRight className="w-3.5 h-3.5" />
          </Link>
        )}
      </div>
    </div>
  );
}