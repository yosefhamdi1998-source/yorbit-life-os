import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { BookOpen, Plus, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import PageHeader from '@/components/PageHeader';
import { toast } from '@/components/ui/use-toast';
import { format, parseISO } from 'date-fns';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import PullToRefreshIndicator from '@/components/PullToRefreshIndicator';

const MOODS = [
  { value: 'great', emoji: '😄', label: 'Great' },
  { value: 'good', emoji: '🙂', label: 'Good' },
  { value: 'neutral', emoji: '😐', label: 'Neutral' },
  { value: 'bad', emoji: '😕', label: 'Bad' },
  { value: 'terrible', emoji: '😢', label: 'Terrible' },
];
const MOOD_EMOJI = Object.fromEntries(MOODS.map(m => [m.value, m.emoji]));
const todayStr = () => format(new Date(), 'yyyy-MM-dd');
const DEFAULT_FORM = () => ({ date: todayStr(), content: '', mood: 'good' });

export default function Journal() {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(DEFAULT_FORM());
  const [saving, setSaving] = useState(false);

  const loadEntries = async (showSkeleton = false) => {
    if (showSkeleton) setLoading(true);
    try {
      const data = await base44.entities.JournalEntry.list('-date', 200);
      setEntries(data);
    } catch {
      toast({ title: "Couldn't load journal entries", description: 'Please try again in a moment.', variant: 'destructive' });
    } finally {
      if (showSkeleton) setLoading(false);
    }
  };

  useEffect(() => { loadEntries(true); }, []);
  const { pullY, refreshing, threshold } = usePullToRefresh(() => loadEntries(false));

  const closeForm = () => { setShowForm(false); setForm(DEFAULT_FORM()); };

  const saveEntry = async () => {
    if (!form.content.trim()) return;
    setSaving(true);
    try {
      await base44.entities.JournalEntry.create(form);
      toast({ title: 'Entry saved' });
      closeForm();
      loadEntries(false);
    } catch {
      toast({ title: "Couldn't save entry", description: 'Please try again in a moment.', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const deleteEntry = async (id) => {
    const existing = entries.find(e => e.id === id);
    setEntries(prev => prev.filter(e => e.id !== id));
    try {
      await base44.entities.JournalEntry.delete(id);
      toast({ title: 'Entry deleted' });
    } catch {
      if (existing) setEntries(prev => [existing, ...prev]);
      toast({ title: "Couldn't delete entry", description: 'Please try again in a moment.', variant: 'destructive' });
    }
  };

  if (loading) {
    return (
      <div className="p-4 max-w-2xl mx-auto space-y-3">
        {[1, 2, 3].map(i => <div key={i} className="h-24 rounded-2xl bg-secondary animate-pulse" />)}
      </div>
    );
  }

  return (
    <div className="p-4 max-w-2xl mx-auto">
      <PullToRefreshIndicator pullY={pullY} refreshing={refreshing} threshold={threshold} />
      <PageHeader
        title="Journal"
        subtitle="A quick note on how today went"
        icon={BookOpen}
        gradient="gradient-journal"
        action={<Button size="sm" onClick={() => setShowForm(true)} className="gap-1.5"><Plus className="w-4 h-4" /> New Entry</Button>}
      />

      {showForm && (
        <div className="bg-card border border-border rounded-2xl p-4 mb-4">
          <div className="flex items-center justify-between mb-3">
            <p className="font-semibold text-sm">New Entry</p>
            <button onClick={closeForm} aria-label="Close" className="p-2.5 -m-1 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg hover:bg-secondary transition-colors">
              <X className="w-5 h-5 text-muted-foreground" />
            </button>
          </div>
          <div className="space-y-3">
            <div className="flex gap-2 justify-between">
              {MOODS.map(m => (
                <button
                  key={m.value}
                  onClick={() => setForm(f => ({ ...f, mood: m.value }))}
                  className="flex-1 flex flex-col items-center gap-1 py-2 rounded-xl transition-all"
                  style={{ background: form.mood === m.value ? 'hsl(var(--secondary))' : 'transparent', outline: form.mood === m.value ? '2px solid hsl(var(--primary))' : 'none' }}
                >
                  <span className="text-2xl">{m.emoji}</span>
                  <span className="text-[10px] font-medium text-muted-foreground">{m.label}</span>
                </button>
              ))}
            </div>
            <Textarea
              placeholder="What's on your mind today?"
              rows={5}
              value={form.content}
              onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
              autoFocus
            />
          </div>
          <div className="flex gap-2 mt-3">
            <Button variant="outline" onClick={closeForm} className="flex-1">Cancel</Button>
            <Button onClick={saveEntry} disabled={!form.content.trim() || saving} className="flex-1">
              {saving ? 'Saving…' : 'Save Entry'}
            </Button>
          </div>
        </div>
      )}

      {entries.length === 0 && !showForm ? (
        <div className="text-center py-16 px-4">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl gradient-journal flex items-center justify-center">
            <BookOpen className="w-8 h-8 text-white" />
          </div>
          <p className="font-bold mb-1">No entries yet</p>
          <p className="text-sm text-muted-foreground mb-5">A minute a day is enough to start.</p>
          <Button onClick={() => setShowForm(true)} className="gap-1.5"><Plus className="w-4 h-4" /> Write your first entry</Button>
        </div>
      ) : (
        <div className="space-y-2.5">
          {entries.map(entry => (
            <div key={entry.id} className="bg-card border border-border rounded-2xl p-4">
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-xl">{MOOD_EMOJI[entry.mood] || '📝'}</span>
                  <span className="text-xs font-semibold text-muted-foreground">{format(parseISO(entry.date), 'EEEE, MMM d')}</span>
                </div>
                <button onClick={() => deleteEntry(entry.id)} className="p-1.5 -m-1 rounded-lg hover:bg-secondary text-muted-foreground hover:text-destructive transition-colors shrink-0" title="Delete entry" aria-label="Delete entry">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
              <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">{entry.content}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
