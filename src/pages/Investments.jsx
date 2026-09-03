import { useState, useEffect, useMemo, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { TrendingUp, ArrowDownLeft, ArrowUpRight, Coins, Wallet } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import PageHeader from '@/components/PageHeader';
import { toast } from '@/components/ui/use-toast';
import { fmtFull, fmtCompact, fmtAxisCompact } from '@/lib/format';
import { format, parseISO } from 'date-fns';

// A Coinbase-style title reads "Coinbase Buy LTC" / "Coinbase Send DOGE" —
// the second word is what happened, the third is the asset. Parsing it
// here keeps the imported rows untouched while still giving this page real
// structure to group and total by.
function parseActivity(title = '') {
  const m = title.match(/^Coinbase\s+([A-Za-z]+(?:\s+(?:Out|In))?)\s*-?\s*([A-Z]{2,6})?/i);
  if (!m) return { action: 'Other', asset: null };
  const action = m[1].replace(/\s+/g, ' ').trim();
  return { action: action.charAt(0).toUpperCase() + action.slice(1).toLowerCase(), asset: m[2] || null };
}

// Money that actually entered or left the investing world, as opposed to
// churn between assets. A buy/sell is a position change; a deposit or
// withdrawal is real money crossing the boundary with your bank.
const MONEY_IN = /^(Deposit|Receive)/i;
const MONEY_OUT = /^(Withdrawal|Send)/i;

export default function Investments() {
  const [rows, setRows] = useState([]);
  const [holdings, setHoldings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [assetFilter, setAssetFilter] = useState('all');
  // Tapping an asset below filters the Activity feed further down the
  // page — with a thin phone screen and thousands of rows, that feed sits
  // well off-screen, so the tap looked like it did nothing at all. Scroll
  // it into view on selection so the filter is actually visible.
  const activityRef = useRef(null);
  const selectAsset = (asset) => {
    setAssetFilter(prev => (prev === asset ? 'all' : asset));
    requestAnimationFrame(() => activityRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };

  useEffect(() => {
    Promise.all([
      base44.entities.Transaction.listInvestments('-date', 50000),
      base44.entities.InvestmentHolding.list('-institution_value', 200).catch(() => []),
    ])
      .then(([tx, h]) => { setRows(tx); setHoldings(h || []); })
      .catch(() => toast({ title: "Couldn't load your investments", description: 'Please try again in a moment.', variant: 'destructive' }))
      .finally(() => setLoading(false));
  }, []);

  const { assets, byAsset, totals, yearly } = useMemo(() => {
    const byAsset = {};
    let bought = 0, sold = 0, moneyIn = 0, moneyOut = 0;
    const yearMap = {};

    for (const t of rows) {
      const { action, asset } = parseActivity(t.title);
      const key = asset || '—';
      if (!byAsset[key]) byAsset[key] = { asset: key, count: 0, bought: 0, sold: 0 };
      byAsset[key].count++;

      const amt = t.amount || 0;
      if (/^Buy/i.test(action)) { byAsset[key].bought += amt; bought += amt; }
      if (/^Sell/i.test(action)) { byAsset[key].sold += amt; sold += amt; }
      if (MONEY_IN.test(action)) moneyIn += amt;
      if (MONEY_OUT.test(action)) moneyOut += amt;

      const y = (t.date || '').slice(0, 4);
      if (y) {
        if (!yearMap[y]) yearMap[y] = { year: y, bought: 0, sold: 0 };
        if (/^Buy/i.test(action)) yearMap[y].bought += amt;
        if (/^Sell/i.test(action)) yearMap[y].sold += amt;
      }
    }

    const assets = Object.values(byAsset).sort((a, b) => (b.bought + b.sold) - (a.bought + a.sold));
    return {
      assets,
      byAsset,
      totals: { bought, sold, moneyIn, moneyOut, net: sold - bought },
      yearly: Object.values(yearMap).sort((a, b) => a.year.localeCompare(b.year))
        .map(y => ({ year: y.year, bought: Math.round(y.bought), sold: Math.round(y.sold) })),
    };
  }, [rows]);

  const visible = useMemo(() => {
    const list = assetFilter === 'all'
      ? rows
      : rows.filter(t => parseActivity(t.title).asset === assetFilter);
    return list.slice(0, 100);
  }, [rows, assetFilter]);

  const holdingsValue = holdings.reduce((s, h) => s + (h.institution_value || 0), 0);

  if (loading) {
    return (
      <div className="py-4 space-y-4">
        <div className="h-16 rounded-2xl bg-secondary/60 animate-pulse" />
        <div className="h-32 rounded-2xl bg-secondary/60 animate-pulse" />
        {[1, 2, 3].map(i => <div key={i} className="h-16 rounded-2xl bg-secondary/60 animate-pulse" />)}
      </div>
    );
  }

  if (rows.length === 0 && holdings.length === 0) {
    return (
      <div className="py-4 pb-8">
        <PageHeader title="Investments" subtitle="Trading and holdings, kept out of your budget" icon={TrendingUp} gradient="gradient-primary" showBack />
        <div className="sky-card rounded-2xl p-8 text-center border border-dashed border-border mt-4">
          <Coins className="w-8 h-8 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-sm font-semibold text-foreground mb-1">No investing activity yet</p>
          <p className="text-xs text-muted-foreground">Connect a brokerage or crypto account, or import a Coinbase export, and it'll appear here — separate from your spending.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="py-4 pb-8">
      <PageHeader title="Investments" subtitle="Trading and holdings, kept out of your budget" icon={TrendingUp} gradient="gradient-primary" showBack />

      {/* Hero — the headline is what actually crossed the boundary between
          your bank and your investing, not trading volume, which tells you
          almost nothing on its own. */}
      <div
        className="rounded-3xl overflow-hidden relative mb-5"
        style={{ background: 'linear-gradient(135deg, var(--hero-from) 0%, var(--hero-via) 55%, var(--hero-to) 100%)', textShadow: '0 1px 10px rgba(0,0,0,0.35)' }}
      >
        <div className="relative px-5 py-5 lg:px-8 lg:py-7">
          <p className="text-white/60 text-[11px] font-semibold uppercase tracking-widest mb-2">Trading activity</p>
          <p className="font-numeric text-white text-3xl lg:text-5xl font-black tracking-tight leading-none mb-1.5 tabular-nums">
            {totals.net >= 0 ? '+' : '−'}${fmtFull(Math.abs(totals.net))}
          </p>
          <p className="text-white/70 text-xs font-semibold mb-5">
            Sold minus bought, across {rows.length.toLocaleString()} transactions
          </p>
          <div className="grid grid-cols-2 gap-2.5">
            <div className="bg-white/10 rounded-xl px-3 py-2.5" title={`$${fmtFull(totals.bought)}`}>
              <p className="text-white/60 text-[10px] font-semibold uppercase tracking-wide mb-1">Total bought</p>
              <p className="text-white font-black text-lg leading-tight tabular-nums">{fmtCompact(totals.bought)}</p>
            </div>
            <div className="bg-white/10 rounded-xl px-3 py-2.5" title={`$${fmtFull(totals.sold)}`}>
              <p className="text-white/60 text-[10px] font-semibold uppercase tracking-wide mb-1">Total sold</p>
              <p className="text-white font-black text-lg leading-tight tabular-nums">{fmtCompact(totals.sold)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Live holdings, when a brokerage/crypto account is connected */}
      {holdings.length > 0 && (
        <div className="sky-card rounded-2xl p-4 mb-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Wallet className="w-4 h-4 text-primary" />
              <p className="text-sm font-bold text-foreground">Current holdings</p>
            </div>
            <p className="text-sm font-black text-foreground tabular-nums">${fmtFull(holdingsValue)}</p>
          </div>
          <div className="divide-y divide-border/50">
            {holdings.map(h => (
              <div key={h.id} className="flex items-center justify-between py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-foreground truncate">{h.security_name}</p>
                  <p className="text-xs text-muted-foreground">{h.ticker_symbol || ''}</p>
                </div>
                <p className="text-sm font-bold text-foreground tabular-nums shrink-0">${fmtFull(h.institution_value)}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Bought vs sold by year */}
      {yearly.length > 1 && (
        <div className="sky-card rounded-2xl p-4 lg:p-5 mb-5">
          <p className="font-bold text-sm mb-3">Bought vs. sold by year</p>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={yearly} margin={{ top: 4, right: 4, left: -4, bottom: 0 }} barGap={4}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" opacity={0.5} />
              <XAxis dataKey="year" tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))', fontWeight: 700 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} width={58} tickFormatter={v => fmtAxisCompact(v)} />
              <Tooltip
                cursor={{ fill: 'hsl(var(--secondary))', opacity: 0.4 }}
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  const b = payload.find(p => p.dataKey === 'bought')?.value || 0;
                  const s = payload.find(p => p.dataKey === 'sold')?.value || 0;
                  return (
                    <div className="sky-card rounded-xl px-3 py-2.5 shadow-lg border border-border">
                      <p className="text-xs font-bold text-foreground mb-1.5">{label}</p>
                      <p className="text-xs font-semibold text-orange-500 tabular-nums">Bought · ${fmtFull(b)}</p>
                      <p className="text-xs font-semibold text-emerald-500 tabular-nums">Sold · ${fmtFull(s)}</p>
                    </div>
                  );
                }}
              />
              <Bar dataKey="bought" fill="#F97316" radius={[5, 5, 0, 0]} maxBarSize={28} />
              <Bar dataKey="sold" fill="#10B981" radius={[5, 5, 0, 0]} maxBarSize={28} />
            </BarChart>
          </ResponsiveContainer>
          <div className="flex items-center gap-4 justify-center mt-1">
            <span className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground"><span className="w-2.5 h-2.5 rounded-full bg-orange-500" /> Bought</span>
            <span className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> Sold</span>
          </div>
        </div>
      )}

      {/* By asset */}
      {assets.length > 0 && (
        <>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2 px-1">By asset</p>
          <div className="sky-card rounded-2xl overflow-hidden mb-5">
            <div className="divide-y divide-border/50">
              {assets.slice(0, 12).map(a => (
                <button
                  key={a.asset}
                  onClick={() => selectAsset(a.asset)}
                  className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors active:scale-[0.99] ${assetFilter === a.asset ? 'bg-primary/10' : ''}`}
                >
                  <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                    <span className="text-[11px] font-black text-primary">{a.asset}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground">{a.asset}</p>
                    <p className="text-xs text-muted-foreground">{a.count.toLocaleString()} transactions</p>
                  </div>
                  {/* fmtCompact already emits the currency symbol — don't
                      prefix another one. */}
                  <div className="text-right shrink-0">
                    <p className="text-xs text-orange-500 font-semibold tabular-nums">−{fmtCompact(a.bought)}</p>
                    <p className="text-xs text-emerald-500 font-semibold tabular-nums">+{fmtCompact(a.sold)}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Activity list */}
      <div ref={activityRef} className="flex items-center justify-between mb-2 px-1 scroll-mt-20">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Activity {assetFilter !== 'all' && `· ${assetFilter} (${(byAsset[assetFilter]?.count || 0).toLocaleString()})`}
        </p>
        {assetFilter !== 'all' && (
          <button onClick={() => setAssetFilter('all')} className="text-xs font-semibold text-primary">Show all</button>
        )}
      </div>
      <div className="sky-card rounded-2xl overflow-hidden">
        <div className="divide-y divide-border/50">
          {visible.map(t => {
            const { action, asset } = parseActivity(t.title);
            const isIn = /^(Sell|Receive|Deposit)/i.test(action);
            return (
              <div key={t.id} className="flex items-center gap-3 px-4 py-3">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${isIn ? 'bg-emerald-500/10' : 'bg-orange-500/10'}`}>
                  {isIn
                    ? <ArrowDownLeft className="w-4 h-4 text-emerald-500" />
                    : <ArrowUpRight className="w-4 h-4 text-orange-500" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate">{action}{asset ? ` ${asset}` : ''}</p>
                  <p className="text-xs text-muted-foreground">{t.date ? format(parseISO(t.date), 'MMM d, yyyy') : ''}</p>
                </div>
                <p className="text-sm font-bold text-foreground tabular-nums shrink-0">${fmtFull(t.amount)}</p>
              </div>
            );
          })}
        </div>
        {rows.length > visible.length && (
          <p className="text-xs text-muted-foreground text-center py-3 border-t border-border/50">
            Showing {visible.length} of {rows.length.toLocaleString()}
          </p>
        )}
      </div>

      <p className="text-xs text-muted-foreground mt-4 px-1 leading-relaxed">
        None of this counts toward your income, spending, savings rate or budgets — buying and selling the same money isn't earning or spending it.
      </p>
    </div>
  );
}
