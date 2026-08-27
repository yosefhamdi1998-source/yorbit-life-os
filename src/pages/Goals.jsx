import { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { Target, Plus, Sparkles, Check, Trash2, X, PlusCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import PageHeader from '@/components/PageHeader';
import { toast } from '@/components/ui/use-toast';
import { format, parseISO } from 'date-fns';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import PullToRefreshIndicator from '@/components/PullToRefreshIndicator';
import confetti from 'canvas-confetti';

function celebrateGoal() {
  const colors = ['#2563EB', '#7C3AED', '#F59E0B', '#10B981'];
  confetti({ particleCount: 90, spread: 75, origin: { y: 0.65 }, colors, startVelocity: 45, ticks: 200 });
  setTimeout(() => confetti({ particleCount: 50, spread: 100, origin: { y: 0.6 }, colors, startVelocity: 30, ticks: 200 }), 150);
}

const CATEGORIES = ['career', 'health', 'finance', 'relationships', 'learning', 'personal', 'other'];
const CAT_COLORS = { career: 'bg-blue-500/10 text-blue-600', health: 'bg-orange-500/10 text-orange-600', finance: 'bg-green-500/10 text-green-600', relationships: 'bg-pink-500/10 text-pink-600', learning: 'bg-purple-500/10 text-purple-600', personal: 'bg-yellow-500/10 text-yellow-600', other: 'bg-gray-500/10 text-gray-600' };
const CAT_GRADIENTS = { career: 'gradient-goals', health: 'gradient-health', finance: 'gradient-finance', relationships: 'gradient-journal', learning: 'gradient-habits', personal: 'gradient-tasks', other: 'gradient-notes' };

export default function Goals() {
  const [goals, setGoals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', category: 'personal', target_date: '', milestones: [], status: 'active', target_amount: '', savings_amount: 0 });
  const [milestone, setMilestone] = useState('');
  const [saving, setSaving] = useState(false);
  const [aiLoading, setAiLoading] = useState(null);
  const [addMoneyGoalId, setAddMoneyGoalId] = useState(null);
  const [addMoneyAmount, setAddMoneyAmount] = useState('');
  const [newMilestone, setNewMilestone] = useState({});   // keyed by goal.id

  useEffect(() => { loadGoals(); }, []);

  const loadGoals = useCallback(async () => {
    try {
      const data = await base44.entities.Goal.list('-created_date');
      setGoals(data);
    } catch (error) {
      toast({ title: "Couldn't load goals", description: "Please check your connection and try again.", variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, []);

  const { pullY, refreshing, threshold } = usePullToRefresh(loadGoals);

  const save = async () => {
    if (!form.title.trim() || saving) return;
    setSaving(true);
    const data = { ...form, title: form.title.trim(), progress: 0, savings_amount: 0 };
    if (data.target_amount) data.target_amount = parseFloat(data.target_amount);
    else delete data.target_amount;
    if (!data.target_date) delete data.target_date;
    try {
      await base44.entities.Goal.create(data);
      toast({ title: 'Goal created', description: data.title });
      setShowForm(false);
      setForm({ title: '', description: '', category: 'personal', target_date: '', milestones: [], status: 'active', target_amount: '', savings_amount: 0 });
      loadGoals();
    } catch (error) {
      toast({ title: "Couldn't save goal", description: "Please try again in a moment.", variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const addMilestone = () => {
    if (!milestone.trim()) return;
    setForm(f => ({ ...f, milestones: [...f.milestones, { title: milestone.trim(), completed: false }] }));
    setMilestone('');
  };

  const toggleMilestone = async (goal, idx) => {
    const milestones = [...(goal.milestones || [])];
    milestones[idx] = { ...milestones[idx], completed: !milestones[idx].completed };
    const progress = Math.round((milestones.filter(m => m.completed).length / milestones.length) * 100);
    try {
      await base44.entities.Goal.update(goal.id, { milestones, progress });
      loadGoals();
    } catch (error) {
      toast({ title: "Couldn't update milestone", description: "Please try again in a moment.", variant: 'destructive' });
    }
  };

  const deleteGoal = async (id) => {
    const goal = goals.find(g => g.id === id);
    if (!window.confirm(`Delete "${goal?.title || 'this goal'}"? This cannot be undone.`)) return;
    try {
      await base44.entities.Goal.delete(id);
      toast({ title: 'Goal deleted' });
      loadGoals();
    } catch (error) {
      toast({ title: "Couldn't delete goal", description: "Please try again in a moment.", variant: 'destructive' });
    }
  };

  const completeGoal = async (goal) => {
    const completing = goal.status !== 'completed';
    try {
      await base44.entities.Goal.update(goal.id, { status: completing ? 'completed' : 'active' });
      if (completing) {
        celebrateGoal();
        toast({ title: '🎉 Goal completed!', description: goal.title });
      }
      loadGoals();
    } catch (error) {
      toast({ title: "Couldn't update goal", description: "Please try again in a moment.", variant: 'destructive' });
    }
  };

  const addMoney = async (goal) => {
    const amount = parseFloat(addMoneyAmount);
    if (!amount || amount <= 0) return;
    const savedAmount = (goal.savings_amount || 0) + amount;
    const newProgress = goal.target_amount > 0
      ? Math.min(100, Math.round((savedAmount / goal.target_amount) * 100))
      : goal.progress || 0;
    try {
      await base44.entities.Goal.update(goal.id, { savings_amount: savedAmount, progress: newProgress });
      const justFunded = newProgress >= 100 && (goal.progress || 0) < 100;
      if (justFunded) {
        celebrateGoal();
        toast({ title: '🎉 Fully funded!', description: `"${goal.title}" hit its target` });
      } else {
        toast({ title: 'Money added', description: `$${amount} toward "${goal.title}"` });
      }
      setAddMoneyGoalId(null);
      setAddMoneyAmount('');
      loadGoals();
    } catch (error) {
      toast({ title: "Couldn't add money to goal", description: "Please try again in a moment.", variant: 'destructive' });
    }
  };

  const addMilestoneToGoal = async (goal) => {
    const text = (newMilestone[goal.id] || '').trim();
    if (!text) return;
    const milestones = [...(goal.milestones || []), { title: text, completed: false }];
    const progress = milestones.filter(m => m.completed).length > 0
      ? Math.round((milestones.filter(m => m.completed).length / milestones.length) * 100)
      : goal.progress || 0;
    try {
      await base44.entities.Goal.update(goal.id, { milestones, progress });
      setNewMilestone(s => ({ ...s, [goal.id]: '' }));
      loadGoals();
    } catch (error) {
      toast({ title: "Couldn't add milestone", description: "Please try again in a moment.", variant: 'destructive' });
    }
  };

  const removeMilestone = async (goal, idx) => {
    const milestones = goal.milestones.filter((_, i) => i !== idx);
    const progress = milestones.length > 0
      ? Math.round((milestones.filter(m => m.completed).length / milestones.length) * 100)
      : 0;
    try {
      await base44.entities.Goal.update(goal.id, { milestones, progress });
      loadGoals();
    } catch (error) {
      toast({ title: "Couldn't remove milestone", description: "Please try again in a moment.", variant: 'destructive' });
    }
  };

  const getAINudge = async (goal) => {
    setAiLoading(goal.id);
    try {
      const completed = (goal.milestones || []).filter(m => m.completed).length;
      const total = (goal.milestones || []).length;
      const prompt = `Give a short, energizing motivational nudge (1-2 sentences) for this goal: "${goal.title}". Progress: ${goal.progress || 0}% (${completed}/${total} milestones). Target date: ${goal.target_date || 'not set'}. Be specific and punchy.`;
      const result = await base44.integrations.Core.InvokeLLM({ prompt });
      await base44.entities.Goal.update(goal.id, { ai_nudge: result });
      loadGoals();
    } catch (error) {
      toast({ title: "Couldn't get a nudge right now", description: error.message || 'Please try again in a moment.', variant: 'destructive' });
    } finally {
      setAiLoading(null);
    }
  };

  const active = goals.filter(g => g.status === 'active');
  const completed = goals.filter(g => g.status === 'completed');

  if (loading) {
    return (
      <div className="py-4 space-y-4">
        <div className="h-16 rounded-2xl bg-secondary/60 animate-pulse" />
        <div className="grid grid-cols-3 gap-2">
          <div className="h-16 rounded-2xl bg-secondary/60 animate-pulse" />
          <div className="h-16 rounded-2xl bg-secondary/60 animate-pulse" />
          <div className="h-16 rounded-2xl bg-secondary/60 animate-pulse" />
        </div>
        <div className="h-40 rounded-2xl bg-gradient-to-br from-blue-200/60 to-purple-200/60 animate-pulse" />
        <div className="h-40 rounded-2xl bg-secondary/60 animate-pulse" />
      </div>
    );
  }

  return (
    <div className="py-4">
      <PullToRefreshIndicator pullY={pullY} refreshing={refreshing} threshold={threshold} />
      <PageHeader
        title="Goals"
        subtitle="Set goals and track your progress"
        icon={Target}
        gradient="gradient-goals"
        action={
          <Button onClick={() => setShowForm(true)} className="gradient-primary text-white border-0">
            <Plus className="w-4 h-4 mr-1" /> New Goal
          </Button>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2 mb-5">
        <div className="bg-card border border-border rounded-2xl p-3 text-center">
          <p className="text-xl font-black text-blue-500">{active.length}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">Active</p>
        </div>
        <div className="bg-card border border-border rounded-2xl p-3 text-center">
          <p className="text-xl font-black text-green-500">{completed.length}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">Completed</p>
        </div>
        <div className="bg-card border border-border rounded-2xl p-3 text-center">
          <p className="text-xl font-black">
            {goals.length > 0 ? Math.round(goals.reduce((s, g) => s + (g.progress || 0), 0) / goals.length) : 0}%
          </p>
          <p className="text-[10px] text-muted-foreground mt-0.5">Avg Progress</p>
        </div>
      </div>

      {/* Form */}
      {showForm && (
        <div className="bg-card border border-border rounded-2xl p-5 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold">New Goal</h3>
            <Button variant="ghost" size="icon" onClick={() => setShowForm(false)} className="min-h-[44px] min-w-[44px]"><X className="w-5 h-5" /></Button>
          </div>
          <div className="space-y-3">
            <Input placeholder="Goal title" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} className="font-semibold" />
            <Textarea placeholder="Describe your goal..." value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2} />
            <div className="grid grid-cols-2 gap-3">
              <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</SelectItem>)}
                </SelectContent>
              </Select>
              <Input type="date" value={form.target_date} onChange={e => setForm(f => ({ ...f, target_date: e.target.value }))} />
            </div>
            <Input type="number" placeholder="Target amount ($) — optional" value={form.target_amount} onChange={e => setForm(f => ({ ...f, target_amount: e.target.value }))} inputMode="decimal" />
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">Milestones</p>
              <div className="flex gap-2 mb-2">
                <Input placeholder="Add a milestone" value={milestone} onChange={e => setMilestone(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addMilestone()} />
                <Button onClick={addMilestone} variant="outline" size="sm">Add</Button>
              </div>
              <div className="space-y-1">
                {form.milestones.map((m, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    <Check className="w-3.5 h-3.5 text-muted-foreground" />
                    <span>{m.title}</span>
                    <button onClick={() => setForm(f => ({ ...f, milestones: f.milestones.filter((_, j) => j !== i) }))} className="ml-auto text-muted-foreground hover:text-destructive">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
            <Button onClick={save} disabled={!form.title.trim() || saving} className="gradient-primary text-white border-0 w-full">
              {saving ? 'Creating…' : 'Create Goal'}
            </Button>
          </div>
        </div>
      )}

      {/* Active goals */}
      <div className="space-y-4 mb-8">
        {active.map(goal => {
          const milestones = goal.milestones || [];
          const completedCount = milestones.filter(m => m.completed).length;
          const progress = goal.progress || 0;

          return (
            <div key={goal.id} className="bg-card border border-border rounded-2xl overflow-hidden glow-card">
              <div className="p-5">
                <div className="flex items-start gap-3">
                  <div className={`w-10 h-10 ${CAT_GRADIENTS[goal.category] || 'gradient-goals'} rounded-xl flex items-center justify-center shrink-0`}>
                    <Target className="w-5 h-5 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-bold text-sm leading-snug">{goal.title}</h3>
                      <Badge className={`${CAT_COLORS[goal.category] || 'bg-gray-100'} text-[10px] px-1.5 py-0 shrink-0`} variant="secondary">
                        {goal.category}
                      </Badge>
                    </div>
                    {goal.description && <p className="text-sm text-muted-foreground mt-1">{goal.description}</p>}
                    {goal.target_date && <p className="text-xs text-muted-foreground mt-1">🎯 {format(parseISO(goal.target_date), 'MMM d, yyyy')}</p>}

                    {/* Progress bar */}
                    <div className="mt-3">
                      <div className="flex justify-between text-xs text-muted-foreground mb-1">
                        <span>
                          {goal.target_amount > 0
                            ? `$${(goal.savings_amount || 0).toLocaleString()} saved of $${goal.target_amount.toLocaleString()}`
                            : milestones.length > 0 ? `${completedCount}/${milestones.length} milestones` : 'No milestones'}
                        </span>
                        <span className="font-bold text-foreground">{progress}%</span>
                      </div>
                      <div className="h-2 bg-secondary rounded-full overflow-hidden">
                        <div className={`h-full rounded-full transition-all gradient-goals`} style={{ width: `${progress}%` }} />
                      </div>
                    </div>

                    {/* AI nudge */}
                    {goal.ai_nudge && (
                      <div className="mt-3 bg-blue-500/10 rounded-xl p-2.5">
                        <p className="text-xs flex items-start gap-1 text-blue-600">
                          <Sparkles className="w-3 h-3 shrink-0 mt-0.5" />{goal.ai_nudge}
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Add Money inline */}
                {addMoneyGoalId === goal.id && (
                  <div className="mt-3 flex gap-2 items-center">
                    <Input
                      type="number"
                      placeholder="Amount ($)"
                      value={addMoneyAmount}
                      onChange={e => setAddMoneyAmount(e.target.value)}
                      className="h-8 text-sm"
                      autoFocus
                      inputMode="decimal"
                      onKeyDown={e => e.key === 'Enter' && addMoney(goal)}
                    />
                    <Button size="sm" onClick={() => addMoney(goal)} disabled={!addMoneyAmount} className="h-8 bg-emerald-600 hover:bg-emerald-700 text-white border-0 shrink-0">Add</Button>
                    <Button size="sm" variant="ghost" onClick={() => { setAddMoneyGoalId(null); setAddMoneyAmount(''); }} className="h-8 shrink-0">✕</Button>
                  </div>
                )}

                {/* Actions */}
                <div className="flex items-center gap-1.5 mt-3 flex-wrap">
                  <Button variant="outline" size="sm" onClick={() => { setAddMoneyGoalId(goal.id); setAddMoneyAmount(''); }} className="text-xs h-7 px-2 text-emerald-700 border-emerald-200 bg-emerald-50 hover:bg-emerald-100">
                    <PlusCircle className="w-3 h-3 mr-1" /> Add Money
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => getAINudge(goal)} disabled={aiLoading === goal.id} className="text-xs h-7 px-2 ml-auto">
                    <Sparkles className="w-3 h-3 mr-1" />{aiLoading === goal.id ? '…' : 'Motivate me'}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => completeGoal(goal)} className="text-xs h-7 px-2">
                    <Check className="w-3 h-3 mr-1" />Complete
                  </Button>
                  <button onClick={() => deleteGoal(goal.id)} className="text-muted-foreground hover:text-destructive" title="Delete goal" aria-label="Delete goal">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Milestones — always visible */}
              <div className="border-t border-border px-5 py-4">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Milestones</p>
                <div className="space-y-2 mb-3">
                  {milestones.length === 0 && (
                    <p className="text-xs text-muted-foreground italic">No milestones yet — add your first step below.</p>
                  )}
                  {milestones.map((m, i) => (
                    <div key={i} className="flex items-center gap-3 group">
                      <button
                        onClick={() => toggleMilestone(goal, i)}
                        aria-label={m.completed ? `Mark "${m.title}" incomplete` : `Mark "${m.title}" complete`}
                        className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${m.completed ? 'bg-primary border-primary' : 'border-muted-foreground hover:border-primary'}`}
                      >
                        {m.completed && <Check className="w-3 h-3 text-white" />}
                      </button>
                      <span className={`text-sm flex-1 ${m.completed ? 'line-through text-muted-foreground' : 'text-foreground'}`}>{m.title}</span>
                      <button onClick={() => removeMilestone(goal, i)} aria-label={`Remove milestone "${m.title}"`} className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
                {/* Add milestone inline */}
                <div className="flex gap-2">
                  <Input
                    placeholder="Add a step…"
                    value={newMilestone[goal.id] || ''}
                    onChange={e => setNewMilestone(s => ({ ...s, [goal.id]: e.target.value }))}
                    onKeyDown={e => e.key === 'Enter' && addMilestoneToGoal(goal)}
                    className="h-8 text-sm"
                  />
                  <Button size="sm" variant="outline" onClick={() => addMilestoneToGoal(goal)} className="h-8 shrink-0">
                    <Plus className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Completed */}
      {completed.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">🎉 Completed</p>
          <div className="space-y-2">
            {completed.map(goal => (
              <div key={goal.id} className="bg-card border border-border/50 rounded-2xl p-4 opacity-60">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-green-500/20 rounded-xl flex items-center justify-center">
                    <Check className="w-4 h-4 text-green-500" />
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-sm line-through">{goal.title}</p>
                  </div>
                  <button onClick={() => completeGoal(goal)} className="text-xs text-muted-foreground hover:text-foreground">Reopen</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {goals.length === 0 && !showForm && (
        <div
          className="rounded-3xl p-6 relative overflow-hidden text-center"
          style={{ background: 'linear-gradient(135deg, #2563eb 0%, #60a5fa 100%)' }}
        >
          <div className="w-16 h-16 bg-white/20 rounded-3xl flex items-center justify-center mx-auto mb-4">
            <Target className="w-8 h-8 text-white" strokeWidth={1.6} />
          </div>
          <h3 className="text-xl font-black text-white mb-2">Set your first goal</h3>
          <p className="text-white/70 text-sm mb-6 leading-relaxed max-w-xs mx-auto">
            Research shows people with written goals are 3× more likely to achieve them. Start yours today.
          </p>
          <div className="grid grid-cols-2 gap-2 mb-5 max-w-xs mx-auto">
            {[
              { emoji: '🏖️', label: 'Emergency Fund' },
              { emoji: '🚗', label: 'New Car' },
              { emoji: '🏠', label: 'Down Payment' },
              { emoji: '✈️', label: 'Dream Vacation' },
            ].map(({ emoji, label }) => (
              <button
                key={label}
                onClick={() => { setForm(f => ({ ...f, title: label })); setShowForm(true); }}
                className="rounded-2xl px-3 py-2.5 text-sm font-semibold text-white text-left transition-all active:scale-95"
                style={{ background: 'rgba(255,255,255,0.18)' }}
              >
                {emoji} {label}
              </button>
            ))}
          </div>
          <Button
            onClick={() => setShowForm(true)}
            className="bg-white text-blue-600 font-bold hover:bg-white/90 border-0 gap-1"
          >
            <Plus className="w-4 h-4" /> Create Custom Goal
          </Button>
        </div>
      )}
    </div>
  );
}