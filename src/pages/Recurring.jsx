import { useState, useEffect, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Repeat, ChevronRight, Sparkles, Plus } from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import { toast } from '@/components/ui/use-toast';
import { detectRecurring } from '@/lib/detectRecurring';

const CAT_ICONS = { housing: '🏠', utilities: '💡', phone: '📱', insurance: '🛡️', subscription: '📺', credit_card: '💳', loan: '🏦', other: '💸' };
// Same palette as Bills, so a category reads as the same color everywhere
// it appears rather than switching depending on which page you're on.
const CAT_COLORS = { housing: '#8B5CF6', utilities: '#F59E0B', phone: '#0EA5E9', insurance: '#3B82F6', subscription: '#EC4899', credit_card: '#EF4444', loan: '#F97316', other: '#94A3B8' };

function fmt(n) { return (n || 0).toLocaleString('en-US', { maximumFractionDigits: 2 }); }

export default function Recurring() {
  const [bills, setBills] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [addedKeys, setAddedKeys] = useState(() => new Set());
  const [addingKey, setAddingKey] = useState(null);
  const addingRef = useRef(new Set());

  useEffect(() => {
    Promise.all([
      base44.entities.Bill.list('due_date', 100),
      base44.entities.Transaction.list('-date', 50000),
    ])
      .then(([b, tx]) => { setBills(b); setTransactions(tx); })
      .catch(() => toast({ title: "Couldn't load your recurring bills", description: 'Please try again in a moment.', variant: 'destructive' }))
      .finally(() => setLoading(false));
  }, []);

  // Real detection from transaction history — a merchant charged
  // repeatedly at a consistent amount and a regular interval — instead of
  // requiring every subscription be typed in by hand before it shows up
  // here at all.
  const detected = useMemo(
    () => detectRecurring(transactions, bills.map(b => b.name)).filter(d => !addedKeys.has(d.key)),
    [transactions, bills, addedKeys]
  );

  const addDetected = async (d) => {
    // Synchronous re-entry guard. `disabled={addingKey === d.key}` relies
    // on a React state update that hasn't re-rendered yet when a fast
    // double-tap fires, so both taps get through and create two identical
    // bills. Keyed by detection key so tapping Add on two *different*
    // rows quickly still works.
    if (addingRef.current.has(d.key)) return;
    addingRef.current.add(d.key);
    setAddingKey(d.key);
    try {
      await base44.entities.Bill.create({
        name: d.name, amount: d.amount, due_date: d.nextDate, category: d.category, is_recurring: true, is_paid: false,
      });
      setAddedKeys(prev => new Set(prev).add(d.key));
      toast({ title: 'Added to Bills', description: `${d.name} · $${fmt(d.amount)} ${d.intervalLabel.toLowerCase()}` });
    } catch {
      toast({ title: "Couldn't add this bill", description: 'Please try again in a moment.', variant: 'destructive' });
    }
    addingRef.current.delete(d.key);
    setAddingKey(null);
  };

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

      {/* Summary first — what you're already tracking. */}
      {recurring.length > 0 && (
        <div className="rounded-2xl p-5 mb-5 relative overflow-hidden" style={{ background: 'linear-gradient(135deg, var(--hero-from) 0%, var(--hero-via) 55%, var(--hero-to) 100%)', textShadow: '0 1px 10px rgba(0,0,0,0.35)' }}>
          <p className="text-white/60 text-[11px] font-semibold uppercase tracking-widest mb-2">Recurring cost</p>
          <p className="font-numeric text-white text-4xl font-black tracking-tight leading-none mb-1 tabular-nums">
            ${fmt(monthlyTotal)}<span className="text-lg font-bold text-white/70">/mo</span>
          </p>
          <p className="text-white/70 text-sm">
            That's <span className="font-numeric font-bold text-white">${fmt(annualTotal)}</span> a year across {recurring.length} recurring bill{recurring.length === 1 ? '' : 's'}.
          </p>
        </div>
      )}

      {/* Detected For You — real repeat charges found in transaction
          history, so nothing has to be typed in by hand before it shows
          up here. Sits outside the "has bills yet" branch on purpose:
          someone with nothing tracked yet is exactly who needs it most. */}
      {detected.length > 0 && (
        <div className="mb-5">
          <div className="flex items-center gap-1.5 mb-2 px-1">
            <Sparkles className="w-3.5 h-3.5 text-primary" />
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Detected For You</p>
          </div>
          <div className="sky-card rounded-2xl overflow-hidden">
            <div className="divide-y divide-border/50">
              {detected.map(d => (
                <div key={d.key} className="flex items-center gap-3 px-4 py-3">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center text-base shrink-0" style={{ backgroundColor: (CAT_COLORS[d.category] || '#94A3B8') + '22' }}>{CAT_ICONS[d.category] || '💸'}</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate">{d.name}</p>
                    <p className="text-xs text-muted-foreground">${fmt(d.amount)} · {d.intervalLabel} · seen {d.occurrences}×</p>
                  </div>
                  <button
                    onClick={() => addDetected(d)}
                    disabled={addingKey === d.key}
                    className="shrink-0 flex items-center gap-1 text-xs font-bold px-3 py-1.5 rounded-full bg-primary/10 text-primary hover:bg-primary/20 transition-colors disabled:opacity-50"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {recurring.length === 0 ? (
        <div className="sky-card rounded-2xl p-8 text-center border border-dashed border-border">
          <Repeat className="w-8 h-8 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-sm font-semibold text-foreground mb-1">No recurring bills tracked yet</p>
          <p className="text-xs text-muted-foreground mb-4">
            {detected.length > 0
              ? 'Tap Add on any subscription found above to start tracking it.'
              : "Mark a bill as recurring and it'll show up here, with your real monthly and yearly cost."}
          </p>
          <Link to="/bills" className="text-xs font-bold text-primary underline underline-offset-2">Go to Bills →</Link>
        </div>
      ) : (
        <>
          <div className="sky-card rounded-2xl overflow-hidden">
            <div className="divide-y divide-border/50">
              {recurring.map(b => (
                <div key={b.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center text-base shrink-0" style={{ backgroundColor: (CAT_COLORS[b.category] || '#94A3B8') + '22' }}>{CAT_ICONS[b.category] || '💸'}</div>
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
