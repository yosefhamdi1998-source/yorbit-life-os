import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Repeat, ChevronRight } from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import { toast } from '@/components/ui/use-toast';

const CAT_ICONS = { housing: '🏠', utilities: '💡', phone: '📱', insurance: '🛡️', subscription: '📺', credit_card: '💳', loan: '🏦', other: '💸' };

function fmt(n) { return (n || 0).toLocaleString('en-US', { maximumFractionDigits: 2 }); }

export default function Recurring() {
  const [bills, setBills] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    base44.entities.Bill.list('due_date', 100)
      .then(setBills)
      .catch(() => toast({ title: "Couldn't load your recurring bills", description: 'Please try again in a moment.', variant: 'destructive' }))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="py-4 space-y-4">
        <div className="h-16 rounded-2xl bg-secondary/60 animate-pulse" />
        <div className="h-24 rounded-2xl bg-secondary/60 animate-pulse" />
        <div className="space-y-2">
          {[1, 2, 3, 4].map(i => <div key={i} className="h-16 rounded-2xl bg-secondary/60 animate-pulse" />)}
        </div>
      </div>
    );
  }

  const recurring = bills.filter(b => b.is_recurring).sort((a, b) => (b.amount || 0) - (a.amount || 0));
  const monthlyTotal = recurring.reduce((s, b) => s + (b.amount || 0), 0);
  const annualTotal = monthlyTotal * 12;

  return (
    <div className="py-4 pb-8">
      <PageHeader title="Recurring" subtitle="Subscriptions & bills that repeat" icon={Repeat} gradient="gradient-finance" showBack />

      {recurring.length === 0 ? (
        <div className="sky-card rounded-2xl p-8 text-center border border-dashed border-border">
          <Repeat className="w-8 h-8 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-sm font-semibold text-foreground mb-1">No recurring bills yet</p>
          <p className="text-xs text-muted-foreground mb-4">Mark a bill as recurring and it'll show up here, with your real monthly and yearly cost.</p>
          <Link to="/bills" className="text-xs font-bold text-primary underline underline-offset-2">Go to Bills →</Link>
        </div>
      ) : (
        <>
          <div className="rounded-2xl p-5 mb-5 relative overflow-hidden" style={{ background: 'linear-gradient(135deg, var(--hero-from) 0%, var(--hero-via) 55%, var(--hero-to) 100%)', textShadow: '0 1px 10px rgba(0,0,0,0.35)' }}>
            <p className="text-white/60 text-[11px] font-semibold uppercase tracking-widest mb-2">Recurring cost</p>
            <p className="font-numeric text-white text-4xl font-black tracking-tight leading-none mb-1 tabular-nums">
              ${fmt(monthlyTotal)}<span className="text-lg font-bold text-white/70">/mo</span>
            </p>
            <p className="text-white/70 text-sm">
              That's <span className="font-numeric font-bold text-white">${fmt(annualTotal)}</span> a year across {recurring.length} recurring bill{recurring.length === 1 ? '' : 's'}.
            </p>
          </div>

          <div className="sky-card rounded-2xl overflow-hidden">
            <div className="divide-y divide-border/50">
              {recurring.map(b => (
                <div key={b.id} className="flex items-center gap-3 px-4 py-3">
                  <span className="text-xl shrink-0">{CAT_ICONS[b.category] || '💸'}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate">{b.name}</p>
                    <p className="text-xs text-muted-foreground capitalize">{(b.category || 'other').replace(/_/g, ' ')}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-bold text-foreground tabular-nums">${fmt(b.amount)}/mo</p>
                    <p className="text-xs text-muted-foreground tabular-nums">${fmt((b.amount || 0) * 12)}/yr</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <Link to="/bills" className="flex items-center justify-center gap-1 text-sm text-primary font-semibold mt-4">
            Manage all bills <ChevronRight className="w-3.5 h-3.5" />
          </Link>
        </>
      )}
    </div>
  );
}
