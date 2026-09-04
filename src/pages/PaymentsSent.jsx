import { useState, useEffect, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { Send, ArrowUpRight, Search, X } from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import { PERIODS, filterByPeriod, getLatestTransactionDate, getPeriodLabel } from '@/lib/periods';
import { toast } from '@/components/ui/use-toast';
import { format, parseISO } from 'date-fns';
import { prettyMerchant } from '@/lib/merchantName';

function fmt(n) { return (n || 0).toLocaleString('en-US', { maximumFractionDigits: 2 }); }

// Peer-to-peer / person-to-person payment apps and bank "sent a payment"
// wording — Zelle, Venmo, Cash App, PayPal, and a bank's own generic
// "PMNT SENT" transfer description. Matched against the transaction title,
// case-insensitive. This is a real pattern check against your own data, not
// a category — Plaid/CSV imports file these under all sorts of categories
// (savings, other, shopping), so category alone can't find them.
const SENT_PATTERNS = [/zelle/i, /venmo/i, /pmnt sent/i, /cash app/i, /cashapp/i, /paypal/i];

// PayPal specifically processes ordinary merchant checkouts too, not just
// person-to-person sends — banks show those as "PAYPAL *NETFLIX",
// "PAYPAL *AMAZON.COM", etc. (the asterisk is PayPal's own merchant-charge
// format). Without this, every subscription or purchase someone happened
// to pay for through PayPal got counted here as a payment "sent to
// someone," inflating the total with things that were really just normal
// shopping — a real accuracy complaint, not a hypothetical one.
const PAYPAL_MERCHANT_RE = /paypal\s*\*/i;

function isPaymentSent(tx) {
  if (tx.type !== 'expense') return false;
  const title = tx.title || '';
  if (PAYPAL_MERCHANT_RE.test(title)) return false;
  return SENT_PATTERNS.some(p => p.test(title));
}

// Which app sent it, just for the little tag under each row.
function detectApp(title) {
  if (/zelle/i.test(title)) return 'Zelle';
  if (/venmo/i.test(title)) return 'Venmo';
  if (/cash ?app/i.test(title)) return 'Cash App';
  if (/paypal/i.test(title)) return 'PayPal';
  return 'Bank transfer';
}

export default function PaymentsSent() {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState('month');
  const [appFilter, setAppFilter] = useState(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    // listPayments, not list — P2P and ATM rows are now excluded from
    // budgeting (they have no spending category), and the default list()
    // hides excluded rows. Reading through list() here would have left
    // this page permanently empty.
    base44.entities.Transaction.listPayments('-date', 50000)
      .then(setTransactions)
      .catch(() => toast({ title: "Couldn't load your payments", description: 'Please try again in a moment.', variant: 'destructive' }))
      .finally(() => setLoading(false));
  }, []);

  const latestTxDate = useMemo(() => getLatestTransactionDate(transactions), [transactions]);
  const periodTx = useMemo(() => filterByPeriod(transactions, period, latestTxDate), [transactions, period, latestTxDate]);
  const sentAll = useMemo(
    () => periodTx.filter(isPaymentSent).sort((a, b) => (b.date || '').localeCompare(a.date || '')),
    [periodTx]
  );
  const total = sentAll.reduce((s, t) => s + (t.amount || 0), 0);

  // Group by app for the tappable breakdown chips under the hero total —
  // the single most useful upgrade here: these used to be decoration, now
  // tapping one actually filters the list below to just that app.
  const byApp = {};
  for (const t of sentAll) {
    const app = detectApp(t.title || '');
    byApp[app] = (byApp[app] || 0) + (t.amount || 0);
  }
  const appBreakdown = Object.entries(byApp).sort((a, b) => b[1] - a[1]);

  // App filter + a name search — with hundreds of P2P payments once a
  // year/all-time range is picked, a flat unfiltered list is close to
  // useless for finding "did I ever pay so-and-so".
  const q = search.trim().toLowerCase();
  const sent = sentAll.filter(t => {
    if (appFilter && detectApp(t.title || '') !== appFilter) return false;
    if (q && !prettyMerchant(t.title).toLowerCase().includes(q) && !(t.title || '').toLowerCase().includes(q)) return false;
    return true;
  });

  // Grouped by month so a long list reads as a timeline with real
  // checkpoints instead of one undifferentiated scroll — the same
  // language Totals already uses for years, one level down.
  const byMonth = useMemo(() => {
    const groups = new Map();
    for (const t of sent) {
      const key = (t.date || '').slice(0, 7); // yyyy-MM
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(t);
    }
    return [...groups.entries()]; // already date-desc since `sent` is
  }, [sent]);

  if (loading) {
    return (
      <div className="py-4 space-y-4">
        <div className="h-16 rounded-2xl bg-secondary/60 animate-pulse" />
        <div className="h-28 rounded-2xl bg-secondary/60 animate-pulse" />
        <div className="space-y-2">
          {[1, 2, 3, 4].map(i => <div key={i} className="h-16 rounded-2xl bg-secondary/60 animate-pulse" />)}
        </div>
      </div>
    );
  }

  const periodPhrase = period === 'month' ? 'this month' : period === 'all' ? 'all time' : `in ${getPeriodLabel(period, latestTxDate)}`;

  return (
    <div className="py-4 pb-8">
      <PageHeader title="Payments Sent" subtitle="Zelle, Venmo, Cash App & bank transfers out" icon={Send} gradient="gradient-primary" showBack />

      <div className="flex gap-1.5 mb-4 overflow-x-auto">
        {/* 'All' matters most on this page: someone wanting to know what
            they've sent over the years was stuck comparing single-year
            totals with no way to see the whole picture. */}
        {[...PERIODS, { key: 'all', label: 'All' }].map(p => (
          <button
            key={p.key}
            onClick={() => setPeriod(p.key)}
            className={`shrink-0 text-xs font-semibold px-3 py-1.5 rounded-full border transition-all ${period === p.key ? 'bg-primary text-primary-foreground border-primary' : 'bg-secondary border-border text-muted-foreground'}`}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="rounded-2xl p-5 mb-5 relative overflow-hidden" style={{ background: 'linear-gradient(135deg, var(--hero-from) 0%, var(--hero-via) 55%, var(--hero-to) 100%)', textShadow: '0 1px 10px rgba(0,0,0,0.35)' }}>
        <p className="text-white/60 text-[11px] font-semibold uppercase tracking-widest mb-2">Sent {periodPhrase}</p>
        <p className="font-numeric text-white text-4xl font-black tracking-tight leading-none mb-1 tabular-nums">
          ${fmt(total)}
        </p>
        <p className="text-white/70 text-sm mb-4">
          Across {sentAll.length} payment{sentAll.length === 1 ? '' : 's'}
        </p>
        {appBreakdown.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {appBreakdown.map(([app, amt]) => (
              <button
                key={app}
                onClick={() => setAppFilter(f => (f === app ? null : app))}
                className={`text-xs font-semibold rounded-full px-2.5 py-1 transition-colors ${appFilter === app ? 'bg-white text-primary' : 'bg-white/15 text-white hover:bg-white/25'}`}
              >
                {app} · ${fmt(amt)}
              </button>
            ))}
            {appFilter && (
              <button
                onClick={() => setAppFilter(null)}
                className="text-xs font-semibold rounded-full px-2.5 py-1 bg-white/10 text-white/70 hover:bg-white/20 flex items-center gap-1"
              >
                <X className="w-3 h-3" /> Clear
              </button>
            )}
          </div>
        )}
      </div>

      {sentAll.length > 0 && (
        <div className="relative mb-4">
          <Search className="w-4 h-4 text-muted-foreground absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search who you sent it to…"
            className="w-full h-11 pl-10 pr-9 rounded-xl border border-border bg-secondary text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      )}

      {sentAll.length === 0 ? (
        <div className="sky-card rounded-2xl p-8 text-center border border-dashed border-border">
          <Send className="w-8 h-8 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-sm font-semibold text-foreground mb-1">No payments sent {periodPhrase}</p>
          <p className="text-xs text-muted-foreground">Zelle, Venmo, Cash App, PayPal, and bank transfers out will show up here automatically.</p>
        </div>
      ) : sent.length === 0 ? (
        <div className="sky-card rounded-2xl p-8 text-center border border-dashed border-border">
          <Search className="w-8 h-8 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-sm font-semibold text-foreground mb-1">No matches</p>
          <p className="text-xs text-muted-foreground">Nothing matches {appFilter ? `"${appFilter}"` : ''}{appFilter && search ? ' and ' : ''}{search ? `"${search}"` : ''} {periodPhrase}.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {byMonth.map(([monthKey, rows]) => {
            const monthTotal = rows.reduce((s, t) => s + (t.amount || 0), 0);
            const label = monthKey ? format(parseISO(`${monthKey}-01`), 'MMMM yyyy') : 'No date';
            return (
              <div key={monthKey} className="sky-card rounded-2xl overflow-hidden">
                <div className="flex items-center justify-between px-4 pt-3.5 pb-2.5 border-b border-border/40">
                  <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{label}</p>
                  <p className="text-xs font-bold text-foreground tabular-nums">${fmt(monthTotal)}</p>
                </div>
                <div className="divide-y divide-border/50">
                  {rows.map(t => (
                    <div key={t.id} className="flex items-center gap-3 px-4 py-3">
                      <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                        <ArrowUpRight className="w-4 h-4 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-foreground truncate">{prettyMerchant(t.title)}</p>
                        <p className="text-xs text-muted-foreground">{detectApp(t.title || '')} · {t.date ? format(parseISO(t.date), 'MMM d, yyyy') : ''}</p>
                      </div>
                      <p className="text-sm font-bold text-foreground tabular-nums shrink-0">−${fmt(t.amount)}</p>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
