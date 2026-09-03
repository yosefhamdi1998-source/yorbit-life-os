import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Sparkles, TrendingUp, TrendingDown } from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import { CategoryBadge } from '@/lib/categoryVisuals';
import { PERIODS, filterByPeriod, filterByPreviousPeriod, getLatestTransactionDate, getPeriodLabel } from '@/lib/periods';
import { toast } from '@/components/ui/use-toast';

function fmt(n) { return (n || 0).toLocaleString('en-US', { maximumFractionDigits: 0 }); }

function spendByCategory(transactions) {
  const byCat = {};
  for (const t of transactions) {
    if (t.type !== 'expense') continue;
    byCat[t.category || 'other'] = (byCat[t.category || 'other'] || 0) + (t.amount || 0);
  }
  return byCat;
}

export default function SaveMore() {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState('month');

  useEffect(() => {
    base44.entities.Transaction.list('-date', 50000)
      .then(setTransactions)
      .catch(() => toast({ title: "Couldn't load your spending", description: 'Please try again in a moment.', variant: 'destructive' }))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="py-4 space-y-4">
        <div className="h-16 rounded-2xl bg-secondary/60 animate-pulse" />
        <div className="space-y-3">
          {[1, 2, 3].map(i => <div key={i} className="h-24 rounded-2xl bg-secondary/60 animate-pulse" />)}
        </div>
      </div>
    );
  }

  const latestTxDate = getLatestTransactionDate(transactions);
  const periodTx = filterByPeriod(transactions, period, latestTxDate);
  const prevTx = filterByPreviousPeriod(transactions, period, latestTxDate);
  const thisSpend = spendByCategory(periodTx);
  const prevSpend = spendByCategory(prevTx);

  const rows = Object.entries(thisSpend)
    .map(([cat, spent]) => {
      const prev = prevSpend[cat] || 0;
      const pctChange = prev > 0 ? Math.round(((spent - prev) / prev) * 100) : null;
      return { cat, spent, prev, pctChange };
    })
    .sort((a, b) => b.spent - a.spent)
    .slice(0, 6);

  const top = rows[0];
  const estimatedSavings = top ? Math.round(top.spent * 0.15) : 0;

  return (
    <div className="py-4 pb-8">
      <PageHeader title="Save More" subtitle="Where you could cut back" icon={Sparkles} gradient="gradient-primary" />

      {/* Toggle always renders, even with zero rows for the current period —
          a bare "Month" default with nothing in it used to be a dead end
          with no way to check Year/Last Year, even when real data existed
          there (the exact bug fixed elsewhere in the app already). */}
      <div className="flex gap-1.5 mb-4 overflow-x-auto">
        {PERIODS.map(p => (
          <button
            key={p.key}
            onClick={() => setPeriod(p.key)}
            className={`shrink-0 text-xs font-semibold px-3 py-1.5 rounded-full border transition-all ${period === p.key ? 'bg-primary text-primary-foreground border-primary' : 'bg-secondary border-border text-muted-foreground'}`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {rows.length === 0 && (
        <div className="sky-card rounded-2xl p-8 text-center border border-dashed border-border">
          <Sparkles className="w-8 h-8 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-sm font-semibold text-foreground mb-1">Nothing to analyze for {getPeriodLabel(period, latestTxDate)}</p>
          <p className="text-xs text-muted-foreground">Try a different period above, or add a few transactions.</p>
        </div>
      )}

      {top && (
        <div className="rounded-2xl p-5 mb-5 relative overflow-hidden" style={{ background: 'linear-gradient(135deg, var(--hero-from) 0%, var(--hero-via) 55%, var(--hero-to) 100%)', textShadow: '0 1px 10px rgba(0,0,0,0.35)' }}>
          <p className="text-white/60 text-[11px] font-semibold uppercase tracking-widest mb-2">Biggest opportunity</p>
          <p className="text-white text-lg font-bold leading-snug mb-1">
            You spent ${fmt(top.spent)} on <span className="capitalize">{top.cat}</span> {period === 'month' ? 'this month' : `in ${getPeriodLabel(period, latestTxDate)}`}.
          </p>
          <p className="text-white/80 text-sm">
            Cutting it by 15% would save about <span className="font-numeric font-bold text-white">${fmt(estimatedSavings)}</span> {period === 'week' ? 'a week' : period === 'month' ? 'a month' : 'a year'}.
          </p>
        </div>
      )}

      <div className="space-y-3">
        {rows.map(({ cat, spent, pctChange }) => (
          <div key={cat} className="sky-card rounded-2xl p-4 flex items-center gap-3">
            <CategoryBadge category={cat} size="w-10 h-10" iconSize="w-[18px] h-[18px]" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-foreground capitalize truncate">{cat}</span>
                <span className="text-sm font-bold text-foreground tabular-nums shrink-0">${fmt(spent)}</span>
              </div>
              {pctChange !== null && (
                <p className={`text-xs font-semibold mt-0.5 flex items-center gap-1 ${pctChange > 0 ? 'text-red-500' : pctChange < 0 ? 'text-emerald-500' : 'text-muted-foreground'}`}>
                  {pctChange > 0 ? <TrendingUp className="w-3 h-3" /> : pctChange < 0 ? <TrendingDown className="w-3 h-3" /> : null}
                  {pctChange === 0 ? 'Same as last period' : `${pctChange > 0 ? '+' : ''}${pctChange}% vs. last period`}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
