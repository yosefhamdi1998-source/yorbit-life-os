import { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { differenceInDays, parseISO, format, addYears } from 'date-fns';
import { Target, Plus, X, Trash2, Pencil, Check } from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MobileSelect } from '@/components/ui/mobile-select';
import { toast } from '@/components/ui/use-toast';
import useAutoOpenForm from '@/hooks/useAutoOpenForm';

// Category presets — same idea as categoryVisuals.jsx (icon + color per
// key), but this is a distinct set of goal *types*, not spending categories.
const GOAL_PRESETS = {
  car: { icon: '🚗', color: '#3B82F6', label: 'Car' },
  house: { icon: '🏠', color: '#7C3AED', label: 'House' },
  vacation: { icon: '✈️', color: '#0EA5E9', label: 'Vacation' },
  debt: { icon: '💳', color: '#EF4444', label: 'Pay Off Debt' },
  emergency: { icon: '🛟', color: '#F59E0B', label: 'Emergency Fund' },
  custom: { icon: '🎯', color: '#10B981', label: 'Custom Goal' },
};
const PRESET_OPTIONS = Object.entries(GOAL_PRESETS).map(([value, p]) => ({ value, label: `${p.icon} ${p.label}` }));

function fmt(n) { return (n || 0).toLocaleString('en-US', { maximumFractionDigits: 0 }); }

// Weekly/monthly pace + ETA are always computed from live data, never
// stored — so they're correct the moment a contribution is added, not
// stale until someone re-saves the goal.
function computeProgress(goal) {
  const target = goal.target_amount || 0;
  const current = goal.current_amount || 0;
  const remaining = Math.max(0, target - current);
  const pct = target > 0 ? Math.min(100, Math.round((current / target) * 100)) : 0;
  if (remaining === 0) return { remaining: 0, pct: 100, weekly: 0, monthly: 0, etaLabel: 'Goal reached! 🎉', overdue: false };
  if (!goal.target_date) return { remaining, pct, weekly: null, monthly: null, etaLabel: null, overdue: false };
  const days = differenceInDays(parseISO(goal.target_date), new Date());
  if (days <= 0) return { remaining, pct, weekly: remaining, monthly: remaining, etaLabel: 'Past target date', overdue: true };
  const weekly = remaining / (days / 7);
  const monthly = remaining / (days / 30.44);
  return { remaining, pct, weekly, monthly, etaLabel: format(parseISO(goal.target_date), 'MMMM yyyy'), overdue: false };
}

const EMPTY_FORM = { name: '', preset: 'custom', target_amount: '', current_amount: '0', target_date: format(addYears(new Date(), 1), 'yyyy-MM-dd') };

// Mirrors the ceiling the transaction form enforces, so a fat-fingered
// extra zero is caught here instead of by a database CHECK that surfaces
// as a generic "please try again" the user can never succeed at.
const MAX_CONTRIBUTION = 10000000;

export default function Goals() {
  const [goals, setGoals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [contributingId, setContributingId] = useState(null);
  const [contributionAmt, setContributionAmt] = useState('');
  const [contributing, setContributing] = useState(false);
  const contribRef = useRef(false);
  useAutoOpenForm(() => { setEditingId(null); setForm(EMPTY_FORM); setShowForm(true); });

  const loadGoals = () => {
    base44.entities.SavingsGoal.list('-created_date')
      .then(setGoals)
      .catch(() => toast({ title: "Couldn't load your goals", description: 'Please try again in a moment.', variant: 'destructive' }))
      .finally(() => setLoading(false));
  };
  useEffect(loadGoals, []);

  const openNew = () => { setEditingId(null); setForm(EMPTY_FORM); setShowForm(true); };
  const openEdit = (goal) => {
    const presetKey = Object.keys(GOAL_PRESETS).find(k => GOAL_PRESETS[k].icon === goal.icon) || 'custom';
    setEditingId(goal.id);
    setForm({
      name: goal.name,
      preset: presetKey,
      target_amount: String(goal.target_amount || ''),
      current_amount: String(goal.current_amount || 0),
      target_date: goal.target_date || '',
    });
    setShowForm(true);
  };

  const save = async () => {
    if (!form.name.trim() || !form.target_amount || parseFloat(form.target_amount) <= 0) return;
    // Synchronous re-entry guard — see Bills.saveBill for why the
    // `disabled={saving}` state alone doesn't stop a fast double-tap.
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    const preset = GOAL_PRESETS[form.preset];
    const payload = {
      name: form.name.trim(),
      icon: preset.icon,
      color: preset.color,
      target_amount: parseFloat(form.target_amount),
      current_amount: parseFloat(form.current_amount) || 0,
      target_date: form.target_date || null,
    };
    try {
      if (editingId) {
        await base44.entities.SavingsGoal.update(editingId, payload);
        toast({ title: 'Goal updated', description: payload.name });
      } else {
        await base44.entities.SavingsGoal.create(payload);
        toast({ title: 'Goal created', description: payload.name });
      }
      setShowForm(false);
      setEditingId(null);
      setForm(EMPTY_FORM);
      loadGoals();
    } catch {
      toast({ title: "Couldn't save your goal", description: 'Please try again in a moment.', variant: 'destructive' });
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const deleteGoal = async (goal) => {
    if (!window.confirm(`Delete "${goal.name}"? This can't be undone.`)) return;
    try {
      await base44.entities.SavingsGoal.delete(goal.id);
      toast({ title: 'Goal deleted' });
      loadGoals();
    } catch {
      toast({ title: "Couldn't delete this goal", description: 'Please try again in a moment.', variant: 'destructive' });
    }
  };

  // A contribution is a read-modify-write on a stored running total, which
  // makes a double-tap here worse than the duplicate-row bug elsewhere:
  // both calls read the SAME stale `goal.current_amount` off this closure
  // and each writes `stale + amt`, so the second silently overwrites the
  // first. Two $100 taps on a $500 goal land on $600, not $700 — the money
  // doesn't duplicate, it disappears, and nothing in the UI says so.
  //
  // Two guards: a synchronous re-entry lock (state can't do this — see
  // useSubmitLock), and re-reading the goal immediately before writing so
  // the base amount isn't a value that's been sitting in a closure since
  // the last render.
  const addContribution = async (goal) => {
    const amt = parseFloat(contributionAmt);
    if (!contributionAmt || Number.isNaN(amt)) return;
    if (amt <= 0) {
      toast({ title: 'Enter an amount above $0', variant: 'destructive' });
      return;
    }
    if (amt > MAX_CONTRIBUTION) {
      toast({ title: `Contribution has to be $${MAX_CONTRIBUTION.toLocaleString()} or less`, variant: 'destructive' });
      return;
    }
    if (contribRef.current) return;
    contribRef.current = true;
    setContributing(true);
    try {
      const fresh = await base44.entities.SavingsGoal.list('-created_date');
      const live = fresh.find(g => g.id === goal.id);
      if (!live) {
        toast({ title: "That goal no longer exists", description: 'It may have been deleted on another device.', variant: 'destructive' });
        setGoals(fresh);
        setContributingId(null);
        setContributionAmt('');
        return;
      }
      await base44.entities.SavingsGoal.update(goal.id, { current_amount: (live.current_amount || 0) + amt });
      toast({ title: `+$${fmt(amt)} added`, description: goal.name });
      setContributingId(null);
      setContributionAmt('');
      loadGoals();
    } catch {
      toast({ title: "Couldn't add that contribution", description: 'Please try again in a moment.', variant: 'destructive' });
    } finally {
      contribRef.current = false;
      setContributing(false);
    }
  };

  if (loading) {
    return (
      <div className="py-4 space-y-3">
        <div className="h-16 rounded-2xl bg-secondary/60 animate-pulse" />
        {[1, 2].map(i => <div key={i} className="h-40 rounded-2xl bg-secondary/60 animate-pulse" />)}
      </div>
    );
  }

  return (
    <div className="py-4 pb-8">
      <PageHeader
        title="Goals"
        subtitle="What you're saving for"
        icon={Target}
        gradient="gradient-goals"
        action={
          <Button size="sm" onClick={openNew} className="bg-primary text-white gap-1">
            <Plus className="w-3.5 h-3.5" /> New Goal
          </Button>
        }
      />

      {showForm && (
        <div className="sky-card rounded-2xl p-5 mb-4">
          <div className="flex items-center justify-between mb-3">
            <p className="font-semibold text-sm">{editingId ? 'Edit Goal' : 'New Goal'}</p>
            <button onClick={() => setShowForm(false)} aria-label="Close" className="p-2.5 -m-1 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg hover:bg-secondary transition-colors">
              <X className="w-5 h-5 text-muted-foreground" />
            </button>
          </div>
          <div className="space-y-3">
            <MobileSelect value={form.preset} onValueChange={v => setForm(f => ({ ...f, preset: v }))} options={PRESET_OPTIONS} />
            <Input placeholder="Goal name (e.g. Down Payment)" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            <div className="grid grid-cols-2 gap-3">
              <Input type="number" placeholder="Target amount ($)" value={form.target_amount} onChange={e => setForm(f => ({ ...f, target_amount: e.target.value }))} min="1" />
              <Input type="number" placeholder="Already saved ($)" value={form.current_amount} onChange={e => setForm(f => ({ ...f, current_amount: e.target.value }))} min="0" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground font-medium mb-1 block">Target date (optional — we'll show a weekly/monthly plan if set)</label>
              <Input type="date" value={form.target_date} onChange={e => setForm(f => ({ ...f, target_date: e.target.value }))} />
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <Button variant="outline" onClick={() => setShowForm(false)} className="flex-1">Cancel</Button>
            <Button onClick={save} disabled={!form.name.trim() || !form.target_amount || saving} className="flex-1 bg-primary text-white">
              {saving ? 'Saving…' : editingId ? 'Save Changes' : 'Create Goal'}
            </Button>
          </div>
        </div>
      )}

      {goals.length === 0 && !showForm ? (
        <div
          className="rounded-3xl p-6 relative overflow-hidden text-center"
          style={{ background: 'linear-gradient(135deg, var(--hero-from) 0%, var(--hero-via) 55%, var(--hero-to) 100%)', textShadow: '0 1px 10px rgba(0,0,0,0.35)' }}
        >
          <div className="w-16 h-16 bg-white/20 rounded-3xl flex items-center justify-center mx-auto mb-4">
            <Target className="w-8 h-8 text-white" strokeWidth={1.6} />
          </div>
          <h3 className="text-xl font-black text-white mb-2">Set your first goal</h3>
          <p className="text-white/70 text-sm mb-6 leading-relaxed max-w-xs mx-auto">
            A car, a house, a vacation, an emergency fund — pick what you're saving for and we'll build you a weekly plan.
          </p>
          <Button onClick={openNew} className="bg-white text-primary font-bold hover:bg-white/90 border-0 gap-1">
            <Plus className="w-4 h-4" /> Create a Goal
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          {goals.map(goal => {
            const p = computeProgress(goal);
            const color = goal.color || '#10B981';
            return (
              <div key={goal.id} className="sky-card rounded-2xl p-4 lg:p-5">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-11 h-11 rounded-xl flex items-center justify-center text-xl shrink-0" style={{ backgroundColor: color + '1F' }}>
                    {goal.icon || '🎯'}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-foreground truncate">{goal.name}</p>
                    <p className="text-xs text-muted-foreground">
                      <span className="font-numeric font-semibold tabular-nums">${fmt(goal.current_amount)}</span> / ${fmt(goal.target_amount)}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => openEdit(goal)} className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors" aria-label={`Edit ${goal.name}`}>
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => deleteGoal(goal)} className="p-2 rounded-lg text-muted-foreground hover:text-destructive hover:bg-secondary transition-colors" aria-label={`Delete ${goal.name}`}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div className="h-2.5 bg-secondary rounded-full overflow-hidden mb-1.5">
                  <div className="h-full rounded-full transition-all duration-500" style={{ width: `${p.pct}%`, background: color }} />
                </div>
                <div className="flex items-center justify-between mb-3">
                  <span className="font-numeric text-xs font-bold tabular-nums" style={{ color }}>{p.pct}% Complete</span>
                  <span className="text-xs text-muted-foreground">${fmt(p.remaining)} to go</span>
                </div>

                {p.weekly !== null && p.remaining > 0 && (
                  <div className="grid grid-cols-2 gap-2.5 mb-3">
                    <div className={`rounded-xl px-3 py-2 ${p.overdue ? 'bg-red-500/10' : 'bg-secondary'}`}>
                      <p className="text-[10px] font-semibold uppercase text-muted-foreground">Weekly</p>
                      <p className="font-numeric text-sm font-bold text-foreground tabular-nums">${fmt(p.weekly)}/wk</p>
                    </div>
                    <div className={`rounded-xl px-3 py-2 ${p.overdue ? 'bg-red-500/10' : 'bg-secondary'}`}>
                      <p className="text-[10px] font-semibold uppercase text-muted-foreground">{p.overdue ? 'Status' : 'Reach goal by'}</p>
                      <p className="text-sm font-bold text-foreground">{p.etaLabel}</p>
                    </div>
                  </div>
                )}
                {p.remaining === 0 && (
                  <p className="text-sm font-bold text-emerald-500 mb-3">{p.etaLabel}</p>
                )}

                {contributingId === goal.id ? (
                  <div className="flex gap-2">
                    <Input
                      type="number" placeholder="Amount ($)" autoFocus
                      value={contributionAmt} onChange={e => setContributionAmt(e.target.value)}
                      className="flex-1" min="0.01"
                    />
                    <Button size="icon" onClick={() => addContribution(goal)} disabled={contributing} className="bg-primary hover:bg-primary/90 text-primary-foreground border-0 shrink-0" aria-label="Confirm contribution">
                      <Check className="w-4 h-4" />
                    </Button>
                    <Button size="icon" variant="outline" onClick={() => { setContributingId(null); setContributionAmt(''); }} className="shrink-0" aria-label="Cancel">
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                ) : (
                  <Button
                    variant="outline" size="sm"
                    onClick={() => { setContributingId(goal.id); setContributionAmt(''); }}
                    disabled={p.remaining === 0}
                    className="w-full gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add Money
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
