import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { CheckSquare, Plus, Trash2, X, Circle, CheckCircle2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MobileSelect } from '@/components/ui/mobile-select';
import PageHeader from '@/components/PageHeader';
import { toast } from '@/components/ui/use-toast';
import { format, parseISO, isPast, isToday } from 'date-fns';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import PullToRefreshIndicator from '@/components/PullToRefreshIndicator';

const PRIORITY_OPTIONS = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'urgent', label: 'Urgent' },
];
const PRIORITY_COLOR = { low: 'text-muted-foreground', medium: 'text-blue-500', high: 'text-amber-500', urgent: 'text-red-500' };
const DEFAULT_FORM = () => ({ title: '', due_date: '', priority: 'medium', category: '' });

export default function Tasks() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(DEFAULT_FORM());
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState('active');

  const loadTasks = async (showSkeleton = false) => {
    if (showSkeleton) setLoading(true);
    try {
      const data = await base44.entities.Task.list('due_date', 200);
      setTasks(data);
    } catch {
      toast({ title: "Couldn't load tasks", description: 'Please try again in a moment.', variant: 'destructive' });
    } finally {
      if (showSkeleton) setLoading(false);
    }
  };

  useEffect(() => { loadTasks(true); }, []);
  const { pullY, refreshing, threshold } = usePullToRefresh(() => loadTasks(false));

  const closeForm = () => { setShowForm(false); setForm(DEFAULT_FORM()); };

  const saveTask = async () => {
    if (!form.title.trim()) return;
    setSaving(true);
    try {
      await base44.entities.Task.create({ ...form, due_date: form.due_date || null });
      toast({ title: 'Task added' });
      closeForm();
      loadTasks(false);
    } catch {
      toast({ title: "Couldn't save task", description: 'Please try again in a moment.', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const cycleStatus = async (task) => {
    const next = task.status === 'todo' ? 'in_progress' : task.status === 'in_progress' ? 'done' : 'todo';
    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: next } : t));
    try {
      await base44.entities.Task.update(task.id, { status: next });
    } catch {
      setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: task.status } : t));
      toast({ title: "Couldn't update task", description: 'Please try again in a moment.', variant: 'destructive' });
    }
  };

  const deleteTask = async (id) => {
    const existing = tasks.find(t => t.id === id);
    setTasks(prev => prev.filter(t => t.id !== id));
    try {
      await base44.entities.Task.delete(id);
      toast({ title: 'Task deleted' });
    } catch {
      if (existing) setTasks(prev => [existing, ...prev]);
      toast({ title: "Couldn't delete task", description: 'Please try again in a moment.', variant: 'destructive' });
    }
  };

  const visible = tasks.filter(t => filter === 'all' ? true : filter === 'done' ? t.status === 'done' : t.status !== 'done');
  const activeCount = tasks.filter(t => t.status !== 'done').length;

  if (loading) {
    return (
      <div className="py-4 space-y-2">
        {[1, 2, 3, 4].map(i => <div key={i} className="h-14 rounded-xl bg-secondary animate-pulse" />)}
      </div>
    );
  }

  return (
    <div className="py-4">
      <PullToRefreshIndicator pullY={pullY} refreshing={refreshing} threshold={threshold} />
      <PageHeader
        title="Tasks"
        subtitle={`${activeCount} to do`}
        icon={CheckSquare}
        gradient="gradient-tasks"
        action={<Button size="sm" onClick={() => setShowForm(true)} className="gap-1.5"><Plus className="w-4 h-4" /> Add Task</Button>}
      />

      {tasks.length > 0 && (
        <div className="flex gap-1.5 mb-4">
          {[{ k: 'active', l: 'Active' }, { k: 'done', l: 'Done' }, { k: 'all', l: 'All' }].map(({ k, l }) => (
            <button
              key={k}
              onClick={() => setFilter(k)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${filter === k ? 'bg-primary text-white' : 'bg-card border border-border text-muted-foreground'}`}
            >
              {l}
            </button>
          ))}
        </div>
      )}

      {showForm && (
        <div className="sky-card rounded-2xl p-4 mb-4">
          <div className="flex items-center justify-between mb-3">
            <p className="font-semibold text-sm">New Task</p>
            <button onClick={closeForm} className="p-2.5 -m-1 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg hover:bg-secondary transition-colors">
              <X className="w-5 h-5 text-muted-foreground" />
            </button>
          </div>
          <div className="space-y-2">
            <Input placeholder="What needs doing?" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} autoFocus />
            <div className="grid grid-cols-2 gap-2">
              <Input type="date" value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))} />
              <MobileSelect value={form.priority} onValueChange={v => setForm(f => ({ ...f, priority: v }))} options={PRIORITY_OPTIONS} />
            </div>
            <Input placeholder="Category (optional)" value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} />
          </div>
          <div className="flex gap-2 mt-3">
            <Button variant="outline" onClick={closeForm} className="flex-1">Cancel</Button>
            <Button onClick={saveTask} disabled={!form.title.trim() || saving} className="flex-1">
              {saving ? 'Saving…' : 'Add Task'}
            </Button>
          </div>
        </div>
      )}

      {tasks.length === 0 && !showForm ? (
        <div className="text-center py-16 px-4">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl gradient-tasks flex items-center justify-center">
            <CheckSquare className="w-8 h-8 text-white" />
          </div>
          <p className="font-bold mb-1">Nothing on your list</p>
          <p className="text-sm text-muted-foreground mb-5">Add a task to start tracking what's next.</p>
          <Button onClick={() => setShowForm(true)} className="gap-1.5"><Plus className="w-4 h-4" /> Add your first task</Button>
        </div>
      ) : (
        <div className="space-y-2">
          {visible.map(task => {
            const overdue = task.due_date && task.status !== 'done' && isPast(parseISO(task.due_date)) && !isToday(parseISO(task.due_date));
            return (
              <div key={task.id} className="flex items-center gap-3 sky-card rounded-xl px-3.5 py-3">
                <button onClick={() => cycleStatus(task)} className="shrink-0 p-1 -m-1" title="Cycle status" aria-label="Cycle status">
                  {task.status === 'done'
                    ? <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                    : task.status === 'in_progress'
                      ? <Loader2 className="w-5 h-5 text-blue-500" />
                      : <Circle className="w-5 h-5 text-muted-foreground" />}
                </button>
                <div className="min-w-0 flex-1">
                  <p className={`text-sm font-medium truncate ${task.status === 'done' ? 'line-through text-muted-foreground' : ''}`}>{task.title}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    {task.due_date && (
                      <span className={`text-xs ${overdue ? 'text-red-500 font-semibold' : 'text-muted-foreground'}`}>
                        {format(parseISO(task.due_date), 'MMM d')}
                      </span>
                    )}
                    {task.category && <span className="text-xs text-muted-foreground">· {task.category}</span>}
                    <span className={`text-xs font-semibold ${PRIORITY_COLOR[task.priority]}`}>· {task.priority}</span>
                  </div>
                </div>
                <button onClick={() => deleteTask(task.id)} className="shrink-0 p-2 -m-1 rounded-lg hover:bg-secondary text-muted-foreground hover:text-destructive transition-colors" title="Delete task" aria-label="Delete task">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            );
          })}
          {visible.length === 0 && (
            <p className="text-center text-sm text-muted-foreground py-10">Nothing here — nice work.</p>
          )}
        </div>
      )}
    </div>
  );
}
