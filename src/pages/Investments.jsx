import { useState, useEffect, useMemo, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { TrendingUp, ArrowDownLeft, ArrowUpRight, Coins, Wallet } from 'lucide-react';
import { BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer } from 'recharts';
import PageHeader from '@/components/PageHeader';
import { toast } from '@/components/ui/use-toast';
import { fmtFull, fmtCompact, fmtAxisCompact } from '@/lib/format';
import { format, parseISO } from 'date-fns';

// Crypto quantities span fifteen orders of magnitude — 0.00001659 BTC and
// 15,831,486 SHIB are both ordinary. A fixed decimal count renders one as
// "0.00" and the other as a wall of zeros, so precision scales with size.
function formatQty(q) {
  const a = Math.abs(q);
  if (a >= 1000) return q.toLocaleString('en-US', { maximumFractionDigits: 0 });
  if (a >= 1) return q.toLocaleString('en-US', { maximumFractionDigits: 4 });
  if (a >= 0.0001) return q.toFixed(6);
  return q.toFixed(8);
}

// FALLBACK ONLY. Asset and quantity are real columns now (crypto_asset,
// crypto_quantity) straight from Coinbase's export. This regex is kept for
// rows imported before those columns existed — chiefly 2022, which no
// export covers. Everything from 2023 on uses the structured fields.
//
// A Coinbase-style title reads "Coinbase Buy LTC" / "Coinbase Send DOGE" —
// the second word is what happened, the third is the asset.
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

  // Per-asset totals and FIFO realized P&L come from Postgres. Computing
  // them here would mean pulling all 17,274 rows just to fold them into ~87
  // numbers. The recent transaction list still needs rows, but only the
  // most recent few hundred — nobody scrolls 17,000 trades.
  const [summary, setSummary] = useState([]);
  const [yearlyRows, setYearlyRows] = useState([]);
  const [pnlYears, setPnlYears] = useState([]);
  const [coverage, setCoverage] = useState(null);
  const [summaryFailed, setSummaryFailed] = useState(false);
  const [summaryLoading, setSummaryLoading] = useState(true);

  useEffect(() => {
    // The two FIFO functions are the expensive ones. They are NOT awaited
    // alongside the cheap queries any more: the page renders its transactions
    // and yearly chart immediately, and the summary fills in when it arrives.
    // Previously all six were in one Promise.all, so a slow summary held the
    // entire page hostage - and when it timed out at 8s, twice, the page had
    // spent 16 seconds arriving at nothing.
    let alive = true;

    Promise.all([
      base44.entities.Transaction.listInvestments('-date', 400),
      base44.entities.InvestmentHolding.list('-institution_value', 200).catch(() => []),
      base44.entities.Transaction.cryptoYearlySummary().catch(() => []),
      base44.entities.Transaction.cryptoTimeCoverage().catch(() => null),
    ])
      .then(([tx, h, y, cov]) => {
        if (!alive) return;
        setRows(tx); setHoldings(h || []);
        setYearlyRows(y || []); setCoverage(cov);
      })
      .catch(() => toast({ title: "Couldn't load your investments", description: 'Please try again in a moment.', variant: 'destructive' }))
      .finally(() => { if (alive) setLoading(false); });

    // FIFO summary, separately. A failure here must NOT fall back to
    // aggregating the 400 rows loaded above: doing that reported "$9,000
    // bought / $5,000 sold" on an account that had moved $1.33M, and it
    // looked exactly like a real answer. A number derived from 2% of the
    // data is not a degraded version of the truth, it is a different and
    // false claim. The page now says it could not load rather than
    // guessing.
    Promise.all([
      base44.entities.Transaction.cryptoAssetSummary(),
      base44.entities.Transaction.cryptoPnlByYear().catch(() => []),
    ])
      .then(([s, p]) => {
        if (!alive) return;
        setSummary(s || []);
        setPnlYears(p || []);
        setSummaryFailed(false);
      })
      .catch(() => { if (alive) setSummaryFailed(true); })
      .finally(() => { if (alive) setSummaryLoading(false); });

    return () => { alive = false; };
  }, []);

  // Totals across every asset, straight from the server-side FIFO walk.
  const pnl = useMemo(() => {
    const num = (v) => Number(v) || 0;
    const bought = summary.reduce((s, r) => s + num(r.usd_bought), 0);
    const sold = summary.reduce((s, r) => s + num(r.usd_sold), 0);
    const realized = summary.reduce((s, r) => s + num(r.realized_pnl), 0);
    const uncosted = summary.reduce((s, r) => s + num(r.uncosted_proceeds), 0);
    const winners = summary.filter(r => num(r.realized_pnl) > 0).length;
    const losers = summary.filter(r => num(r.realized_pnl) < 0).length;
    return {
      bought, sold, realized, uncosted,
      // Profit on lots that can actually be costed. Uncosted proceeds are
      // sales whose buy is not in the data; counting them as profit is the
      // error that made a Coinbase tax report show $147,189 of "gains" on
      // top of a real loss.
      costed: realized - uncosted,
      winners, losers,
      assets: summary.length,
      txns: summary.reduce((s, r) => s + num(r.txns), 0),
    };
  }, [summary]);

  // Server-computed asset rows, shaped for the list below. Falls back to
  // the client-side aggregation only if the RPC returned nothing.
  const serverAssets = useMemo(() => summary.map(r => ({
    asset: r.asset,
    count: Number(r.txns) || 0,
    bought: Number(r.usd_bought) || 0,
    sold: Number(r.usd_sold) || 0,
    netQty: Number(r.net_qty) || 0,
    realized: Number(r.realized_pnl) || 0,
    uncosted: Number(r.uncosted_proceeds) || 0,
    hasQty: true,
  })), [summary]);

  // Realized P&L per year, split into the part that can be costed and the
  // part that cannot. Charting them stacked would imply they are the same
  // kind of number; they are not, so the chart draws profit and the caption
  // carries the rest.
  const pnlByYear = useMemo(() => pnlYears.map(r => {
    const realized = Number(r.realized_pnl) || 0;
    const uncosted = Number(r.uncosted_proceeds) || 0;
    return {
      year: r.yr,
      costed: realized - uncosted,
      uncosted,
      proceeds: Number(r.proceeds) || 0,
      cost: Number(r.cost_basis) || 0,
      disposals: Number(r.disposals) || 0,
    };
  }), [pnlYears]);

  const best = useMemo(() => {
    if (!pnlByYear.length) return null;
    const sorted = [...pnlByYear].sort((a, b) => b.costed - a.costed);
    return { top: sorted[0], worst: sorted[sorted.length - 1] };
  }, [pnlByYear]);

  // FIFO decides which purchase a sale is matched against, so the order of
  // trades within a day changes the answer. Rows imported before the trade
  // time was stored fall back to an arbitrary within-day order. Measured on
  // this account's own 2018-2023 exports, that was worth $26,085.82 and
  // flipped the sign of the total, so the shortfall is stated rather than
  // buried.
  const timeGap = useMemo(() => {
    if (!coverage) return null;
    const total = Number(coverage.disposals) || 0;
    const withTime = Number(coverage.disposals_with_time) || 0;
    if (!total || withTime >= total) return null;
    return { total, withTime, missing: total - withTime, pct: Math.round((withTime / total) * 100) };
  }, [coverage]);

  const serverYearly = useMemo(() => yearlyRows.map(r => ({
    year: r.yr,
    bought: Number(r.usd_bought) || 0,
    sold: Number(r.usd_sold) || 0,
    cashOut: Number(r.cash_withdrawn) || 0,
  })), [yearlyRows]);

  const { assets: clientAssets, byAsset, totals, yearly: clientYearly } = useMemo(() => {
    const byAsset = {};
    let bought = 0, sold = 0, moneyIn = 0, moneyOut = 0;
    const yearMap = {};

    for (const t of rows) {
      // crypto_asset and crypto_quantity are real columns from Coinbase's
      // own export. Everything here used to be regex'd out of the title,
      // which is why 1,562 rows were "unattributed" and no quantity was
      // recoverable at all. parseActivity() is now only a fallback for
      // pre-import rows that still have no structured asset.
      const parsed = t.crypto_asset ? null : parseActivity(t.title);
      const key = t.crypto_asset || parsed?.asset || '—';
      const action = parsed?.action || '';

      if (!byAsset[key]) {
        byAsset[key] = { asset: key, count: 0, bought: 0, sold: 0, netQty: 0, hasQty: false };
      }
      byAsset[key].count++;

      // SIGNED quantity: negative for Sell/Send/Withdrawal. Summing it is
      // the net change in that asset — not a holding, because history
      // starts 2023 and the account opened in 2022.
      if (t.crypto_quantity !== null && t.crypto_quantity !== undefined) {
        byAsset[key].netQty += Number(t.crypto_quantity);
        byAsset[key].hasQty = true;
      }

      const amt = t.amount || 0;
      const isBuy = t.crypto_asset ? t.type === 'expense' : /^Buy/i.test(action);
      const isSell = t.crypto_asset ? t.type === 'income' : /^Sell/i.test(action);
      if (isBuy) { byAsset[key].bought += amt; bought += amt; }
      if (isSell) { byAsset[key].sold += amt; sold += amt; }
      if (!t.crypto_asset) {
        if (MONEY_IN.test(action)) moneyIn += amt;
        if (MONEY_OUT.test(action)) moneyOut += amt;
      } else if (isSell) moneyIn += amt;
      else moneyOut += amt;

      const y = (t.date || '').slice(0, 4);
      if (y) {
        if (!yearMap[y]) yearMap[y] = { year: y, bought: 0, sold: 0 };
        if (isBuy) yearMap[y].bought += amt;
        if (isSell) yearMap[y].sold += amt;
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

  // Prefer the server summary; the client aggregation remains as a fallback
  // for a user whose rows predate the structured columns.
  // No silent fallback. clientAssets is computed from the 400 most recent
  // rows and can only ever be a fraction of the truth on this data set.
  // It is used ONLY when the server summary genuinely returned nothing to
  // summarise, never to paper over a failure.
  const assets = serverAssets.length ? serverAssets : (summaryFailed ? [] : clientAssets);
  const yearly = serverYearly.length ? serverYearly : clientYearly;

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

      {/* Gains and losses by year.
          The bought/sold chart below shows volume, which says nothing about
          whether a year went well — selling $400k after buying $400k is a
          flat year. This shows, for each year, whether the coins sold went
          out above or below what they cost. Bars are signed: above the zero
          line is profit, below it is loss. */}
      {pnlByYear.length > 0 && (
        <div className="sky-card rounded-2xl p-4 lg:p-5 mb-5">
          <div className="flex items-baseline justify-between mb-1">
            <p className="font-bold text-sm">Gains and losses by year</p>
            <p className="text-[11px] font-semibold text-muted-foreground">FIFO · realized</p>
          </div>
          <p className="text-xs text-muted-foreground mb-3">
            Profit on coins you actually sold, counted in the year you sold them.
          </p>
          <ResponsiveContainer width="100%" height={248}>
            {/* Extra top margin so the value label above a gain is not
                clipped by the plot edge. */}
            <BarChart data={pnlByYear} margin={{ top: 8, right: 4, left: -4, bottom: 4 }}>
              <defs>
                {/* Vertical fade rather than flat fill. Seven solid
                    fire-engine bars read as an alarm; the same data in a
                    graded, desaturated rose reads as a chart. The figures
                    are unchanged - only the alarm is removed. */}
                <linearGradient id="gainFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#34D399" stopOpacity={0.95} />
                  <stop offset="100%" stopColor="#059669" stopOpacity={0.75} />
                </linearGradient>
                <linearGradient id="lossFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#F87171" stopOpacity={0.78} />
                  <stop offset="100%" stopColor="#DC2626" stopOpacity={0.92} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="2 6" vertical={false} stroke="hsl(var(--border))" opacity={0.35} />
              <XAxis dataKey="year" tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))', fontWeight: 700 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} width={58} tickFormatter={v => fmtAxisCompact(v)} />
              <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeOpacity={0.55} strokeWidth={1} />
              <Tooltip
                cursor={{ fill: 'hsl(var(--secondary))', opacity: 0.4 }}
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  const d = payload[0]?.payload;
                  if (!d) return null;
                  return (
                    <div className="sky-card rounded-xl px-3 py-2.5 shadow-lg border border-border">
                      <p className="text-xs font-bold text-foreground mb-1.5">{label}</p>
                      <p className={`text-xs font-bold tabular-nums ${d.costed >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                        {d.costed < 0 ? '−' : '+'}${fmtFull(Math.abs(d.costed))} realized
                      </p>
                      <p className="text-[11px] text-muted-foreground tabular-nums mt-1">
                        Sold ${fmtFull(d.proceeds)} · cost ${fmtFull(d.cost)}
                      </p>
                      <p className="text-[11px] text-muted-foreground tabular-nums">
                        {d.disposals.toLocaleString()} sale{d.disposals === 1 ? '' : 's'}
                      </p>
                      {d.uncosted > 0 && (
                        <p className="text-[11px] font-semibold text-amber-600 dark:text-amber-400 tabular-nums mt-1">
                          + ${fmtFull(d.uncosted)} with no known cost, excluded
                        </p>
                      )}
                    </div>
                  );
                }}
              />
              <Bar dataKey="costed" maxBarSize={34}>
                {/* Corner rounding follows the direction of the bar: a loss
                    grows downward, so its rounded end is the BOTTOM. A fixed
                    [5,5,0,0] rounded the flat end that meets the zero line
                    and left the growing end square - upside down on six of
                    seven years here. */}
                {pnlByYear.map(d => (
                  <Cell
                    key={d.year}
                    fill={d.costed >= 0 ? 'url(#gainFill)' : 'url(#lossFill)'}
                    radius={d.costed >= 0 ? [6, 6, 0, 0] : [0, 0, 6, 6]}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          {/* Every year's figure in text, under the chart. Recharts would
              not render in-bar labels reliably, and at 390px wide they were
              never going to be legible anyway - seven numbers across a
              phone screen is a strip, not annotations. This also means the
              exact values are readable without hovering, which on a
              touchscreen nobody can do. */}
          <div className="grid grid-cols-4 sm:grid-cols-7 gap-x-2 gap-y-2 mt-3 pt-3 border-t border-border/50">
            {pnlByYear.map(d => (
              <div key={d.year} className="text-center min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground leading-none mb-1">{d.year}</p>
                <p className={`text-[12px] font-black tabular-nums leading-none truncate ${d.costed >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'}`}>
                  {d.costed < 0 ? '−' : '+'}{fmtAxisCompact(Math.abs(d.costed))}
                </p>
              </div>
            ))}
          </div>

          {best && best.top.costed !== best.worst.costed && (
            <p className="text-xs text-muted-foreground mt-3 text-center">
              Best year <span className="font-bold text-emerald-600 dark:text-emerald-400">{best.top.year}</span> at{' '}
              <span className="font-bold tabular-nums">{best.top.costed < 0 ? '−' : '+'}${fmtFull(Math.abs(best.top.costed))}</span>
              {' · '}worst <span className="font-bold text-red-500">{best.worst.year}</span> at{' '}
              <span className="font-bold tabular-nums">{best.worst.costed < 0 ? '−' : '+'}${fmtFull(Math.abs(best.worst.costed))}</span>
            </p>
          )}
          {timeGap && (
            <div className="mt-3 rounded-xl bg-amber-500/10 border border-amber-500/20 px-3 py-2.5">
              <p className="text-xs font-bold text-amber-700 dark:text-amber-400 mb-0.5">
                {timeGap.pct}% of your sales have an exact trade time
              </p>
              <p className="text-[11px] leading-relaxed text-amber-700/80 dark:text-amber-400/80">
                Matching a sale to the purchase it came from depends on the order
                you traded within a day. {timeGap.missing.toLocaleString()} sale
                {timeGap.missing === 1 ? '' : 's'} came from an import that kept the
                date but not the time, so those are ordered arbitrarily and the
                figures above are approximate. Re-importing those Coinbase exports
                restores the exact times.
              </p>
            </div>
          )}
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

      {/* Realized profit and loss.
          FIFO, computed server-side, matching the method Coinbase's own tax
          reports use so the two can be compared directly. */}
      {/* The summary is the only source for per-asset totals and realized
          P&L. When it fails, say so. The alternative - quietly aggregating
          the 400 rows already in memory - printed "$9,000 bought" for an
          account that had moved $1.33M, indistinguishable from a real
          figure. */}
      {summaryFailed && (
        <div className="sky-card rounded-2xl p-4 mb-5 border border-amber-500/30 bg-amber-500/10">
          <p className="text-sm font-bold text-amber-700 dark:text-amber-400 mb-1">
            Couldn&rsquo;t load your totals
          </p>
          <p className="text-xs text-amber-700/80 dark:text-amber-400/80 leading-relaxed mb-3">
            Your per-asset totals and realized profit are calculated across your
            whole history, and that calculation timed out. The activity and the
            yearly chart below are still accurate. No totals are shown rather
            than partial ones, because a total computed from part of your
            history looks exactly like a real total.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="text-xs font-bold px-3 py-1.5 rounded-lg bg-amber-500/20 text-amber-800 dark:text-amber-300 hover:bg-amber-500/30 transition-colors"
          >
            Try again
          </button>
        </div>
      )}

      {summaryLoading && !summaryFailed && pnl.assets === 0 && (
        <div className="sky-card rounded-2xl p-4 mb-5 flex items-center gap-3">
          <div className="w-4 h-4 border-2 border-muted-foreground/30 border-t-primary rounded-full animate-spin shrink-0" />
          <p className="text-xs text-muted-foreground">Calculating your profit and loss across every trade…</p>
        </div>
      )}

      {pnl.assets > 0 && (
        <div className="sky-card rounded-2xl p-4 mb-5">
          <div className="flex items-baseline justify-between mb-1">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Realized profit &amp; loss
            </p>
            <span className="text-[10px] text-muted-foreground">FIFO</span>
          </div>
          <p className={`font-numeric text-3xl font-black tabular-nums leading-none mb-1 ${pnl.costed >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
            {pnl.costed < 0 ? '−' : '+'}${fmtFull(Math.abs(pnl.costed))}
          </p>
          <p className="text-[11px] text-muted-foreground mb-4">
            on trades where the original purchase is in your data
          </p>

          <div className="grid grid-cols-2 gap-2.5 mb-3">
            <div className="bg-secondary/60 rounded-xl px-3 py-2.5">
              <p className="text-[10px] font-semibold uppercase text-muted-foreground mb-1">Total bought</p>
              <p className="text-sm font-bold tabular-nums">${fmtFull(pnl.bought)}</p>
            </div>
            <div className="bg-secondary/60 rounded-xl px-3 py-2.5">
              <p className="text-[10px] font-semibold uppercase text-muted-foreground mb-1">Total sold</p>
              <p className="text-sm font-bold tabular-nums">${fmtFull(pnl.sold)}</p>
            </div>
            <div className="bg-emerald-500/10 rounded-xl px-3 py-2.5">
              <p className="text-[10px] font-semibold uppercase text-muted-foreground mb-1">Assets in profit</p>
              <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">{pnl.winners}</p>
            </div>
            <div className="bg-red-500/10 rounded-xl px-3 py-2.5">
              <p className="text-[10px] font-semibold uppercase text-muted-foreground mb-1">Assets at a loss</p>
              <p className="text-sm font-bold text-red-500 tabular-nums">{pnl.losers}</p>
            </div>
          </div>

          {/* This caveat is the whole reason the two figures are separated.
              A sale whose purchase is missing has no cost basis, so counting
              it as profit reports the entire proceeds as gain. That is what
              made a Coinbase tax report read $147,189 of "gains" sitting on
              top of a real loss. */}
          {pnl.uncosted > 0 && (
            <div className="rounded-xl bg-amber-500/10 px-3 py-2.5">
              <p className="text-[11px] font-semibold text-amber-700 dark:text-amber-500 mb-0.5">
                ${fmtFull(pnl.uncosted)} of sales have no recorded purchase
              </p>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Those coins arrived by a route your exports don&apos;t cover, so there&apos;s
                no cost to compare against. They&apos;re kept out of the figure above
                rather than counted as pure profit.
              </p>
            </div>
          )}

          <p className="text-[10px] text-muted-foreground mt-3">
            {pnl.txns.toLocaleString()} transactions across {pnl.assets} assets
          </p>
        </div>
      )}

      {/* By asset */}
      {assets.length > 0 && (
        <>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2 px-1">By asset</p>
          {/* Deliberately "net change since 2023", never "holdings". The
              imported history starts 2023-01-01 while the account opened in
              2022, so a per-asset sum is a CHANGE, not a balance. Under the
              holdings framing several assets read negative, which is
              impossible and would be an obviously broken number; as a change
              it is simply a position drawn down, which is true. */}
          {assets.some(a => a.hasQty) && (
            <p className="text-[11px] text-muted-foreground mb-2 px-1 leading-relaxed">
              Quantities are the <strong className="text-foreground">net change since January 2023</strong>,
              not current holdings — earlier history isn&apos;t in the imported data.
            </p>
          )}
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
                    <p className="text-xs text-muted-foreground">
                      {a.count.toLocaleString()} transactions
                      {a.hasQty && Math.abs(a.netQty) > 1e-8 && (
                        <>
                          {' · '}
                          <span className={a.netQty > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground'}>
                            {a.netQty > 0 ? '+' : ''}{formatQty(a.netQty)} since 2023
                          </span>
                        </>
                      )}
                    </p>
                  </div>
                  {/* fmtCompact already emits the currency symbol — don't
                      prefix another one. */}
                  <div className="text-right shrink-0">
                    {a.realized !== undefined ? (
                      <>
                        <p className={`text-sm font-bold tabular-nums ${a.realized >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                          {a.realized < 0 ? '−' : '+'}{fmtCompact(Math.abs(a.realized))}
                        </p>
                        <p className="text-[10px] text-muted-foreground tabular-nums">
                          {fmtCompact(a.bought)} in · {fmtCompact(a.sold)} out
                        </p>
                      </>
                    ) : (
                      <>
                        <p className="text-xs text-orange-500 font-semibold tabular-nums">−{fmtCompact(a.bought)}</p>
                        <p className="text-xs text-emerald-500 font-semibold tabular-nums">+{fmtCompact(a.sold)}</p>
                      </>
                    )}
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
