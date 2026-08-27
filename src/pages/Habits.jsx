import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Flame, Plus, Trash2, X, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MobileSelect } from '@/components/ui/mobile-select';
import PageHeader from '@/components/PageHeader';
import { toast } from '@/components/ui/use-toast';
import { format, subDays } from 'date-fns';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import PullToRefreshIndicator from '@/components/PullToRefreshIndicator';

const ICONS = ['💧', '🏃', '📖', '🧘', '🥗', '😴', '✍️', '🚭'];
const FREQ_OPTIONS = [{ value: 'daily', label: 'Daily' }, { value: 'weekly', label: 'Weekly' }];
const DEFAULT_FORM = () => ({ name: '', description: '', frequency: 'daily', icon: ICONS[0], target_days_per_week: 7 });
const todayStr = () => format(new Date(), 'yyyy-MM-dd');

// Consecutive days up to and including today present in `completions`.
function computeStreak(completions) {
  const set = new Set(completions || []);
  let streak = 0;
  let cursor = new Date();
  while (set.has(format(cursor, 'yyyy-MM-dd'))) {
    streak++;
    cursor = subDays(cursor, 1);
  }
  return streak;
}

export default function Habits() {
  const [habits, setHabits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(DEFAULT_FORM());
  const [saving, setSaving] = useState(false);

  const loadHabits = async (showSkeleton = false) => {
    if (showSkeleton) setLoading(true);
    try {
      const data = await base44.entities.Habit.list('-created_date', 100);
      setHabits(data);
    } catch {
      toast({ title: "Couldn't load habits", description: 'Please try again in a moment.', variant: 'destructive' });
    } finally {
      if (showSkeleton) setLoading(false);
    }
  };

  useEffect(() => { loadHabits(true); }, []);
  const { pullY, refreshing, threshold } = usePullToRefresh(() => loadHabits(false));

  const closeForm = () => { setShowForm(false); setForm(DEFAULT_FORM()); };

  const saveHabit = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      await base44.entities.Habit.create({ ...form, completions: [], streak: 0 });
      toast({ title: 'Habit added' });
      closeForm();
      loadHabits(false);
    } catch {
      toast({ title: "Couldn't save habit", description: 'Please try again in a moment.', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const toggleToday = async (habit) => {
    const today = todayStr();
    const has = (habit.completions || []).includes(today);
    const completions = has ? habit.completions.filter(d => d !== today) : [...(habit.completions || []), today];
    const streak = computeStreak(completions);
    setHabits(prev => prev.map(h => h.id === habit.id ? { ...h, completions, streak } : h));
    try {
      await base44.entities.Habit.update(habit.id, { completions, streak });
    } catch {
      setHabits(prev => prev.map(h => h.id === habit.id ? habit : h));
      toast({ title: "Couldn't update habit", description: 'Please try again in a moment.', variant: 'destructive' });
    }
  };

  const deleteHabit = async (id) => {
    const existing = habits.find(h => h.id === id);
    setHabits(prev => prev.filter(h => h.id !== id));
    try {
      await base44.entities.Habit.delete(id);
      toast({ title: 'Habit deleted' });
    } catch {
      if (existing) setHabits(prev => [existing, ...prev]);
      toast({ title: "Couldn't delete habit", description: 'Please try again in a moment.', variant: 'destructive' });
    }
  };

  if (loading) {
    return (
      <div className="p-4 max-w-2xl mx-auto space-y-3">
        {[1, 2, 3].map(i => <div key={i} className="h-20 rounded-2xl bg-secondary animate-pulse" />)}
      </div>
    );
  }

  const today = todayStr();

  return (
    <div className="p-4 max-w-2xl mx-auto">
      <PullToRefreshIndicator pullY={pullY} refreshing={refreshing} threshold={threshold} />
      <PageHeader
        title="Habits"
        subtitle="Show up daily, build the streak"
        icon={Flame}
        gradient="gradient-habits"
        action={<Button size="sm" onClick={() => setShowForm(true)} className="gap-1.5"><Plus className="w-4 h-4" /> New Habit</Button>}
      />

      {showForm && (
        <div className="bg-card border border-border rounded-2xl p-4 mb-4">
          <div className="flex items-center justify-between mb-3">
            <p className="font-semibold text-sm">New Habit</p>
            <button onClick={closeForm} className="p-2.5 -m-1 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg hover:bg-secondary transition-colors">
              <X className="w-5 h-5 text-muted-foreground" />
            </button>
          </div>
          <div className="space-y-2">
            <Input placeholder="e.g. Drink water, Read 10 pages" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} autoFocus />
            <Input placeholder="Description (optional)" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
            <MobileSelect value={form.frequency} onValueChange={v => setForm(f => ({ ...f, frequency: v }))} options={FREQ_OPTIONS} />
            <div className="flex gap-2 pt-1">
              {ICONS.map(icon => (
                <button
                  key={icon}
                  onClick={() => setForm(f => ({ ...f, icon }))}
                  className="w-9 h-9 rounded-xl flex items-center justify-center text-lg shrink-0 transition-all"
                  style={{ background: form.icon === icon ? 'hsl(var(--primary))' : 'hsl(var(--secondary))' }}
                >
                  {icon}
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-2 mt-3">
            <Button variant="outline" onClick={closeForm} className="flex-1">Cancel</Button>
            <Button onClick={saveHabit} disabled={!form.name.trim() || saving} className="flex-1">
              {saving ? 'Saving…' : 'Add Habit'}
            </Button>
          </div>
        </div>
      )}

      {habits.length === 0 && !showForm ? (
        <div className="text-center py-16 px-4">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl gradient-habits flex items-center justify-center">
            <Flame className="w-8 h-8 text-white" />
          </div>
          <p className="font-bold mb-1">No habits yet</p>
          <p className="text-sm text-muted-foreground mb-5">Start one small habit and watch the streak build.</p>
          <Button onClick={() => setShowForm(true)} className="gap-1.5"><Plus className="w-4 h-4" /> Start a habit</Button>
        </div>
      ) : (
        <div className="space-y-2.5">
          {habits.map(habit => {
            const doneToday = (habit.completions || []).includes(today);
            return (
              <div key={habit.id} className="flex items-center gap-3 bg-card border border-border rounded-2xl px-4 py-3.5">
                <div className="w-10 h-10 rounded-xl bg-secondary flex items-center justify-center text-lg shrink-0">{habit.icon || '✅'}</div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold truncate">{habit.name}</p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    {habit.streak > 0 && (
                      <span className="flex items-center gap-0.5 text-xs font-bold text-amber-500">
                        <Flame className="w-3 h-3 fill-amber-500" /> {habit.streak} day{habit.streak === 1 ? '' : 's'}
                      </span>
                    )}
                    <span className="text-xs text-muted-foreground capitalize">{habit.streak > 0 ? '· ' : ''}{habit.frequency}</span>
                  </div>
                </div>
                <button
                  onClick={() => toggleToday(habit)}
                  className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 transition-all active:scale-90 ${doneToday ? 'bg-emerald-500' : 'bg-secondary border-2 border-dashed border-border'}`}
                  title={doneToday ? "Done today — tap to undo" : 'Mark done today'}
                >
                  {doneToday && <Check className="w-4 h-4 text-white" strokeWidth={3} />}
                </button>
                <button onClick={() => deleteHabit(habit.id)} className="shrink-0 p-2 -m-1 rounded-lg hover:bg-secondary text-muted-foreground hover:text-destructive transition-colors" title="Delete habit" aria-label="Delete habit">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
