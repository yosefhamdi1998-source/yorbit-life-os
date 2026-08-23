import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Target, Plus, X, Flag, CheckCircle, AlertCircle, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FEATURES } from '@/lib/features';
import { format, differenceInMonths, parseISO } from 'date-fns';

const GOAL_PRESETS = [
  { label: 'Emergency Fund', icon: '🛡️' },
  { label: 'Vacation', icon: '✈️' },
  { label: 'Debt Payoff', icon: '💳' },
  { label: 'New Car', icon: '🚗' },
  { label: 'Home Down Payment', icon: '🏠' },
  { label: 'Custom Goal', icon: '🎯' },
];

function getGoalStatus(pct, monthsNeeded, monthsAvailable) {
  if (pct >= 100) return { label: 'Completed 🎉', color: 'text-emerald-500', bg: 'bg-emerald-500/10', icon: CheckCircle };
  if (!monthsAvailable) return { label: 'On Track', color: 'text-emerald-600', bg: 'bg-emerald-500/10', icon: CheckCircle };
  if (monthsNeeded <= monthsAvailable) return { label: 'On Track', color: 'text-emerald-600', bg: 'bg-emerald-500/10', icon: CheckCircle };
  if (monthsNeeded <= monthsAvailable * 1.3) return { label: 'Needs Attention', color: 'text-amber-600', bg: 'bg-amber-500/10', icon: Clock };
  return { label: 'Behind', color: 'text-red-500', bg: 'bg-red-500/10', icon: AlertCircle };
}

export default function FinancialGoals({ goals, onRefresh, monthIncome, monthExpenses }) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', target_amount: '', current_amount: '', target_date: '', icon: '🎯' });
  const [saving, setSaving] = useState(false);

  if (!FEATURES.financialGoals) return null;

  const monthlySaved = Math.max(0, monthIncome - monthExpenses);

  const save = async () => {
    if (!form.name || !form.target_amount || parseFloat(form.target_amount) <= 0) return;
    setSaving(true);
    await base44.entities.SavingsGoal.create({
      name: form.name,
      target_amount: parseFloat(form.target_amount),
      current_amount: parseFloat(form.current_amount) || 0,
      target_date: form.target_date || undefined,
      icon: form.icon,
    });
    setForm({ name: '', target_amount: '', current_amount: '', target_date: '', icon: '🎯' });
    setShowForm(false);
    setSaving(false);
    onRefresh();
  };

  const deleteGoal = async (id) => {
    await base44.entities.SavingsGoal.delete(id);
    onRefresh();
  };

  return (
    <div className="mb-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Flag className="w-4 h-4 text-blue-500" />
          <h3 className="font-bold text-sm">Financial Goals</h3>
        </div>
        <Button size="sm" variant="outline" onClick={() => setShowForm(!showForm)} className="h-8 text-xs gap-1">
          <Plus className="w-3.5 h-3.5" /> Add Goal
        </Button>
      </div>

      {showForm && (
        <div className="bg-card border border-border rounded-2xl p-4 mb-4">
          <div className="flex items-center justify-between mb-3">
            <p className="font-semibold text-sm">New Financial Goal</p>
            <button onClick={() => setShowForm(false)}><X className="w-4 h-4 text-muted-foreground" /></button>
          </div>

          <div className="flex gap-2 flex-wrap mb-3">
            {GOAL_PRESETS.map(p => (
              <button
                key={p.label}
                onClick={() => setForm(f => ({ ...f, name: p.label === 'Custom Goal' ? '' : p.label, icon: p.icon }))}
                className={`text-xs px-3 py-1.5 rounded-full border transition-all ${form.name === p.label ? 'border-primary bg-primary/10 text-primary font-semibold' : 'border-border bg-secondary'}`}
              >
                {p.icon} {p.label}
              </button>
            ))}
          </div>

          <div className="space-y-2">
            <Input placeholder="Goal name (e.g. Emergency Fund)" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            <div className="grid grid-cols-2 gap-2">
              <Input type="number" placeholder="Target amount ($)" value={form.target_amount} onChange={e => setForm(f => ({ ...f, target_amount: e.target.value }))} />
              <Input type="number" placeholder="Already saved ($)" value={form.current_amount} onChange={e => setForm(f => ({ ...f, current_amount: e.target.value }))} />
            </div>
            <Input type="date" placeholder="Target date (optional)" value={form.target_date} onChange={e => setForm(f => ({ ...f, target_date: e.target.value }))} />
          </div>

          <div className="flex gap-2 mt-3">
            <Button variant="outline" onClick={() => setShowForm(false)} className="flex-1">Cancel</Button>
            <Button
              onClick={save}
              disabled={!form.name || !form.target_amount || parseFloat(form.target_amount) <= 0 || saving}
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white border-0"
            >
              {saving ? 'Saving…' : 'Save Goal'}
            </Button>
          </div>
        </div>
      )}

      {goals.length === 0 && !showForm ? (
        <div className="bg-card border border-dashed border-border rounded-2xl p-6 text-center">
          <Target className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm font-medium mb-1">No goals set yet</p>
          <p className="text-xs text-muted-foreground mb-3">Pick one financial goal to work toward. We'll track your progress automatically.</p>
          <Button size="sm" onClick={() => setShowForm(true)} className="gap-1">
            <Plus className="w-3.5 h-3.5" /> Add Goal
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {goals.map(goal => {
            const current = goal.current_amount || 0;
            const pct = goal.target_amount > 0 ? Math.min(100, Math.round((current / goal.target_amount) * 100)) : 0;
            const remaining = Math.max(0, goal.target_amount - current);
            const monthsNeeded = monthlySaved > 0 ? Math.ceil(remaining / monthlySaved) : null;
            const monthsAvailable = goal.target_date ? differenceInMonths(parseISO(goal.target_date), new Date()) : null;
            const recommendedMonthly = monthsAvailable && monthsAvailable > 0 ? Math.ceil(remaining / monthsAvailable) : null;
            const status = getGoalStatus(pct, monthsNeeded, monthsAvailable);
            const StatusIcon = status.icon;

            return (
              <div key={goal.id} className="bg-card border border-border rounded-2xl p-4">
                <div className="flex items-start justify-between mb-1">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <span className="text-xl shrink-0">{goal.icon || '🎯'}</span>
                    <div className="min-w-0">
                      <p className="font-semibold text-sm truncate">{goal.name}</p>
                      <p className="text-xs text-muted-foreground">
                        ${(current || 0).toLocaleString()} saved · Goal: ${goal.target_amount.toLocaleString()}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ml-2">
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${status.bg} ${status.color}`}>{status.label}</span>
                    <button onClick={() => deleteGoal(goal.id)} className="text-muted-foreground hover:text-destructive transition-colors p-1">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div className="h-2 bg-secondary rounded-full overflow-hidden mb-2">
                  <div
                    className={`h-full rounded-full transition-all ${pct >= 100 ? 'bg-emerald-500' : pct >= 66 ? 'bg-blue-500' : pct >= 33 ? 'bg-primary' : 'bg-amber-500'}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>

                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span className="font-semibold text-foreground">{pct}% complete</span>
                  {remaining > 0 && <span>${remaining.toLocaleString()} remaining</span>}
                </div>

                {pct < 100 && (
                  <div className="mt-2 pt-2 border-t border-border/60 space-y-0.5">
                    {recommendedMonthly && (
                      <p className="text-xs text-muted-foreground">
                        💡 Contribute <span className="font-semibold text-foreground">${recommendedMonthly.toLocaleString()}/mo</span> to hit your {goal.target_date ? format(parseISO(goal.target_date), 'MMM yyyy') : ''} deadline.
                      </p>
                    )}
                    {monthsNeeded && !recommendedMonthly && (
                      <p className="text-xs text-muted-foreground">
                        At your current savings rate, you'll reach this in ~{monthsNeeded} month{monthsNeeded !== 1 ? 's' : ''}.
                      </p>
                    )}
                    {status.label === 'Behind' && (
                      <p className="text-xs text-amber-600 dark:text-amber-400">
                        ⚠️ Increase your monthly contribution by ${recommendedMonthly && monthlySaved > 0 ? Math.max(0, recommendedMonthly - monthlySaved).toLocaleString() : '—'} to hit your target date.
                      </p>
                    )}
                    {status.label === 'On Track' && monthsNeeded && (
                      <p className="text-xs text-emerald-600 dark:text-emerald-400">✅ You're on track to reach this goal.</p>
                    )}
                  </div>
                )}

                {pct >= 100 && (
                  <p className="text-xs text-emerald-500 font-semibold mt-2">🎉 Goal reached! Congratulations.</p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}