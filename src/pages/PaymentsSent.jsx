import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Send, ArrowUpRight } from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import { PERIODS, filterByPeriod, getLatestTransactionDate, getPeriodLabel } from '@/lib/periods';
import { toast } from '@/components/ui/use-toast';
import { format, parseISO } from 'date-fns';

function fmt(n) { return (n || 0).toLocaleString('en-US', { maximumFractionDigits: 2 }); }

// Peer-to-peer / person-to-person payment apps and bank "sent a payment"
// wording — Zelle, Venmo, Cash App, PayPal, and a bank's own generic
// "PMNT SENT" transfer description. Matched against the transaction title,
// case-insensitive. This is a real pattern check against your own data, not
// a category — Plaid/CSV imports file these under all sorts of categories
// (savings, other, shopping), so category alone can't find them.
const SENT_PATTERNS = [/zelle/i, /venmo/i, /pmnt sent/i, /cash app/i, /cashapp/i, /paypal/i];

function isPaymentSent(tx) {
  if (tx.type !== 'expense') return false;
  const title = tx.title || '';
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

  useEffect(() => {
    base44.entities.Transaction.list('-date', 50000)
      .then(setTransactions)
      .catch(() => toast({ title: "Couldn't load your payments", description: 'Please try again in a moment.', variant: 'destructive' }))
      .finally(() => setLoading(false));
  }, []);

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

  const latestTxDate = getLatestTransactionDate(transactions);
  const periodTx = filterByPeriod(transactions, period, latestTxDate);
  const sent = periodTx.filter(isPaymentSent).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const total = sent.reduce((s, t) => s + (t.amount || 0), 0);

  // Group by app for the little breakdown row under the hero total.
  const byApp = {};
  for (const t of sent) {
    const app = detectApp(t.title || '');
    byApp[app] = (byApp[app] || 0) + (t.amount || 0);
  }
  const appBreakdown = Object.entries(byApp).sort((a, b) => b[1] - a[1]);

  return (
    <div className="py-4 pb-8">
      <PageHeader title="Payments Sent" subtitle="Zelle, Venmo, Cash App & bank transfers out" icon={Send} gradient="gradient-primary" showBack />

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

      <div className="rounded-2xl p-5 mb-5 relative overflow-hidden" style={{ background: 'linear-gradient(135deg, var(--hero-from) 0%, var(--hero-via) 55%, var(--hero-to) 100%)', textShadow: '0 1px 10px rgba(0,0,0,0.35)' }}>
        <p className="text-white/60 text-[11px] font-semibold uppercase tracking-widest mb-2">Sent {getPeriodLabel(period) === getPeriodLabel('month') && period === 'month' ? 'this month' : `in ${getPeriodLabel(period)}`}</p>
        <p className="font-numeric text-white text-4xl font-black tracking-tight leading-none mb-1 tabular-nums">
          ${fmt(total)}
        </p>
        <p className="text-white/70 text-sm mb-4">
          Across {sent.length} payment{sent.length === 1 ? '' : 's'}
        </p>
        {appBreakdown.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {appBreakdown.map(([app, amt]) => (
              <span key={app} className="text-xs font-semibold bg-white/15 text-white rounded-full px-2.5 py-1">
                {app} · ${fmt(amt)}
              </span>
            ))}
          </div>
        )}
      </div>

      {sent.length === 0 ? (
        <div className="sky-card rounded-2xl p-8 text-center border border-dashed border-border">
          <Send className="w-8 h-8 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-sm font-semibold text-foreground mb-1">No payments sent {getPeriodLabel(period) === getPeriodLabel('month') && period === 'month' ? 'this month' : `in ${getPeriodLabel(period)}`}</p>
          <p className="text-xs text-muted-foreground">Zelle, Venmo, Cash App, PayPal, and bank transfers out will show up here automatically.</p>
        </div>
      ) : (
        <div className="sky-card rounded-2xl overflow-hidden">
          <div className="divide-y divide-border/50">
            {sent.map(t => (
              <div key={t.id} className="flex items-center gap-3 px-4 py-3">
                <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                  <ArrowUpRight className="w-4 h-4 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate">{t.title}</p>
                  <p className="text-xs text-muted-foreground">{detectApp(t.title || '')} · {t.date ? format(parseISO(t.date), 'MMM d, yyyy') : ''}</p>
                </div>
                <p className="text-sm font-bold text-foreground tabular-nums shrink-0">−${fmt(t.amount)}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
