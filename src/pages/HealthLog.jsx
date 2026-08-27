import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { HeartPulse, Plus, Trash2, X, Moon, Footprints, Droplet, Dumbbell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import PageHeader from '@/components/PageHeader';
import { toast } from '@/components/ui/use-toast';
import { format, parseISO } from 'date-fns';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import PullToRefreshIndicator from '@/components/PullToRefreshIndicator';

const todayStr = () => format(new Date(), 'yyyy-MM-dd');
const DEFAULT_FORM = () => ({
  date: todayStr(), weight: '', sleep_hours: '', water_intake: '', steps: '',
  workout: '', workout_duration: '', mood: '', energy: '', notes: '',
});

export default function HealthLog() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(DEFAULT_FORM());
  const [saving, setSaving] = useState(false);

  const loadLogs = async (showSkeleton = false) => {
    if (showSkeleton) setLoading(true);
    try {
      const data = await base44.entities.HealthLog.list('-date', 200);
      setLogs(data);
    } catch {
      toast({ title: "Couldn't load health logs", description: 'Please try again in a moment.', variant: 'destructive' });
    } finally {
      if (showSkeleton) setLoading(false);
    }
  };

  useEffect(() => { loadLogs(true); }, []);
  const { pullY, refreshing, threshold } = usePullToRefresh(() => loadLogs(false));

  const closeForm = () => { setShowForm(false); setForm(DEFAULT_FORM()); };

  // Prefill from the existing log for a date (if any) so "Log Today" edits
  // today's entry instead of silently creating a duplicate for the same day.
  const formFromLog = (log) => ({
    date: log.date,
    weight: log.weight ?? '',
    sleep_hours: log.sleep_hours ?? '',
    water_intake: log.water_intake ?? '',
    steps: log.steps ?? '',
    workout: log.workout || '',
    workout_duration: log.workout_duration ?? '',
    mood: log.mood ?? '',
    energy: log.energy ?? '',
    notes: log.notes || '',
  });

  const openForm = () => {
    const existing = logs.find(l => l.date === todayStr());
    setForm(existing ? formFromLog(existing) : DEFAULT_FORM());
    setShowForm(true);
  };

  const handleDateChange = (date) => {
    const existing = logs.find(l => l.date === date);
    setForm(f => (existing ? formFromLog(existing) : { ...f, date }));
  };

  const num = (v) => (v === '' || v == null ? null : parseFloat(v));

  const hasAnyValue = [form.weight, form.sleep_hours, form.water_intake, form.steps, form.workout, form.workout_duration, form.mood, form.energy, form.notes]
    .some(v => String(v || '').trim() !== '');

  const saveLog = async () => {
    if (!hasAnyValue) return;
    setSaving(true);
    try {
      const payload = {
        date: form.date,
        weight: num(form.weight),
        sleep_hours: num(form.sleep_hours),
        water_intake: num(form.water_intake),
        steps: num(form.steps),
        workout: form.workout || null,
        workout_duration: num(form.workout_duration),
        mood: num(form.mood),
        energy: num(form.energy),
        notes: form.notes || null,
      };
      // One log per day: update the existing entry for this date instead of
      // creating a duplicate.
      const existing = logs.find(l => l.date === form.date);
      if (existing) {
        await base44.entities.HealthLog.update(existing.id, payload);
        toast({ title: 'Log updated' });
      } else {
        await base44.entities.HealthLog.create(payload);
        toast({ title: 'Log saved' });
      }
      closeForm();
      loadLogs(false);
    } catch {
      toast({ title: "Couldn't save log", description: 'Please try again in a moment.', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const deleteLog = async (id) => {
    const existing = logs.find(l => l.id === id);
    setLogs(prev => prev.filter(l => l.id !== id));
    try {
      await base44.entities.HealthLog.delete(id);
      toast({ title: 'Log deleted' });
    } catch {
      if (existing) setLogs(prev => [existing, ...prev]);
      toast({ title: "Couldn't delete log", description: 'Please try again in a moment.', variant: 'destructive' });
    }
  };

  if (loading) {
    return (
      <div className="p-4 max-w-2xl mx-auto space-y-3">
        {[1, 2, 3].map(i => <div key={i} className="h-20 rounded-2xl bg-secondary animate-pulse" />)}
      </div>
    );
  }

  return (
    <div className="p-4 max-w-2xl mx-auto">
      <PullToRefreshIndicator pullY={pullY} refreshing={refreshing} threshold={threshold} />
      <PageHeader
        title="Health Log"
        subtitle="Sleep, steps, weight, and how you feel"
        icon={HeartPulse}
        gradient="gradient-health"
        action={<Button size="sm" onClick={openForm} className="gap-1.5"><Plus className="w-4 h-4" /> Log Today</Button>}
      />

      {showForm && (
        <div className="bg-card border border-border rounded-2xl p-4 mb-4">
          <div className="flex items-center justify-between mb-3">
            <p className="font-semibold text-sm">Log an Entry</p>
            <button onClick={closeForm} aria-label="Close" className="p-2.5 -m-1 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg hover:bg-secondary transition-colors">
              <X className="w-5 h-5 text-muted-foreground" />
            </button>
          </div>
          <div className="space-y-2">
            <Input type="date" value={form.date} onChange={e => handleDateChange(e.target.value)} />
            <div className="grid grid-cols-2 gap-2">
              <Input type="number" placeholder="Weight (lbs)" value={form.weight} onChange={e => setForm(f => ({ ...f, weight: e.target.value }))} />
              <Input type="number" placeholder="Sleep (hrs)" value={form.sleep_hours} onChange={e => setForm(f => ({ ...f, sleep_hours: e.target.value }))} />
              <Input type="number" placeholder="Water (cups)" value={form.water_intake} onChange={e => setForm(f => ({ ...f, water_intake: e.target.value }))} />
              <Input type="number" placeholder="Steps" value={form.steps} onChange={e => setForm(f => ({ ...f, steps: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Input placeholder="Workout (e.g. Run)" value={form.workout} onChange={e => setForm(f => ({ ...f, workout: e.target.value }))} />
              <Input type="number" placeholder="Minutes" value={form.workout_duration} onChange={e => setForm(f => ({ ...f, workout_duration: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Input type="number" min="1" max="10" placeholder="Mood (1-10)" value={form.mood} onChange={e => setForm(f => ({ ...f, mood: e.target.value }))} />
              <Input type="number" min="1" max="10" placeholder="Energy (1-10)" value={form.energy} onChange={e => setForm(f => ({ ...f, energy: e.target.value }))} />
            </div>
            <Textarea placeholder="Notes (optional)" rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
          </div>
          <div className="flex gap-2 mt-3">
            <Button variant="outline" onClick={closeForm} className="flex-1">Cancel</Button>
            <Button onClick={saveLog} disabled={saving || !hasAnyValue} className="flex-1">{saving ? 'Saving…' : 'Save Log'}</Button>
          </div>
        </div>
      )}

      {logs.length === 0 && !showForm ? (
        <div className="text-center py-16 px-4">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl gradient-health flex items-center justify-center">
            <HeartPulse className="w-8 h-8 text-white" />
          </div>
          <p className="font-bold mb-1">No logs yet</p>
          <p className="text-sm text-muted-foreground mb-5">Track sleep, steps, and how you're feeling day to day.</p>
          <Button onClick={openForm} className="gap-1.5"><Plus className="w-4 h-4" /> Log today</Button>
        </div>
      ) : (
        <div className="space-y-2.5">
          {logs.map(log => (
            <div key={log.id} className="bg-card border border-border rounded-2xl p-4">
              <div className="flex items-center justify-between mb-2.5">
                <span className="text-xs font-semibold text-muted-foreground">{format(parseISO(log.date), 'EEEE, MMM d')}</span>
                <button onClick={() => deleteLog(log.id)} className="p-1.5 -m-1 rounded-lg hover:bg-secondary text-muted-foreground hover:text-destructive transition-colors" title="Delete log" aria-label="Delete log">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs">
                {log.sleep_hours != null && <Stat icon={Moon} label={`${log.sleep_hours}h sleep`} />}
                {log.steps != null && <Stat icon={Footprints} label={`${log.steps.toLocaleString()} steps`} />}
                {log.water_intake != null && <Stat icon={Droplet} label={`${log.water_intake} cups`} />}
                {log.workout && <Stat icon={Dumbbell} label={`${log.workout}${log.workout_duration ? ` · ${log.workout_duration}min` : ''}`} />}
                {log.weight != null && <span className="text-muted-foreground">⚖️ {log.weight} lbs</span>}
                {log.mood != null && <span className="text-muted-foreground">🙂 Mood {log.mood}/10</span>}
                {log.energy != null && <span className="text-muted-foreground">⚡ Energy {log.energy}/10</span>}
              </div>
              {log.notes && <p className="text-xs text-muted-foreground mt-2 whitespace-pre-wrap break-words">{log.notes}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Stat({ icon: Icon, label }) {
  return (
    <span className="flex items-center gap-1 text-muted-foreground">
      <Icon className="w-3.5 h-3.5" /> {label}
    </span>
  );
}
