import { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { StickyNote, Plus, Pin, Trash2, X, Search, Calendar } from 'lucide-react';
import { format, parseISO, startOfDay, differenceInCalendarDays } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import PageHeader from '@/components/PageHeader';
import { toast } from '@/components/ui/use-toast';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import PullToRefreshIndicator from '@/components/PullToRefreshIndicator';
import useDeleteLock from '@/hooks/useDeleteLock';
import useAutoOpenForm from '@/hooks/useAutoOpenForm';

const COLORS = ['#FDE68A', '#BFDBFE', '#BBF7D0', '#FBCFE8', '#DDD6FE', '#FECACA'];
// Defaults to today, because that's right nearly every time — but it's a
// real editable field, so a note about last Tuesday's call can say so.
const DEFAULT_FORM = () => ({
  title: '',
  content: '',
  color: COLORS[0],
  note_date: format(new Date(), 'yyyy-MM-dd'),
});

// "Today" / "Yesterday" / "Tue, Aug 25" — parseISO so a yyyy-MM-dd string
// isn't read as UTC midnight and shown as the day before in any timezone
// behind UTC. Same treatment the transaction list uses.
function noteDateLabel(dateStr) {
  if (!dateStr) return null;
  try {
    const d = parseISO(dateStr);
    const today = startOfDay(new Date());
    const diff = differenceInCalendarDays(today, startOfDay(d));
    if (diff === 0) return 'Today';
    if (diff === 1) return 'Yesterday';
    return format(d, d.getFullYear() === today.getFullYear() ? 'EEE, MMM d' : 'MMM d, yyyy');
  } catch {
    return dateStr;
  }
}

export default function Notes() {
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const { runGuarded: guardDelete, isDeleting } = useDeleteLock();
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(DEFAULT_FORM());
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  const loadNotes = async (showSkeleton = false) => {
    if (showSkeleton) setLoading(true);
    try {
      const data = await base44.entities.Note.list('-created_date', 200);
      setNotes(data);
    } catch {
      toast({ title: "Couldn't load notes", description: 'Please try again in a moment.', variant: 'destructive' });
    } finally {
      if (showSkeleton) setLoading(false);
    }
  };

  useEffect(() => { loadNotes(true); }, []);
  const { pullY, refreshing, threshold } = usePullToRefresh(() => loadNotes(false));

  const openNew = () => { setEditingId(null); setForm(DEFAULT_FORM()); setShowForm(true); };
  // Lands here from the quick-add button with the form already open, same
  // as Transactions/Bills/Budget/Goals do.
  useAutoOpenForm(openNew);
  const openEdit = (note) => {
    setEditingId(note.id);
    setForm({
      title: note.title,
      content: note.content || '',
      color: note.color || COLORS[0],
      note_date: note.note_date || '',
    });
    setShowForm(true);
  };
  const closeForm = () => { setShowForm(false); setEditingId(null); setForm(DEFAULT_FORM()); };

  const saveNote = async () => {
    if (!form.title.trim()) return;
    // Synchronous re-entry guard — `disabled={saving}` alone can't stop a
    // fast double-tap, because React batches the state update and taps in
    // the same tick all run before the button re-renders as disabled.
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    // An empty date input gives '' — the column is a nullable date, and ''
    // is not a valid date, so it has to go in as null rather than being
    // passed through and rejected.
    const payload = { ...form, note_date: form.note_date || null };
    try {
      if (editingId) {
        await base44.entities.Note.update(editingId, payload);
        toast({ title: 'Note updated' });
      } else {
        await base44.entities.Note.create(payload);
        toast({ title: 'Note added' });
      }
      closeForm();
      loadNotes(false);
    } catch {
      toast({ title: "Couldn't save note", description: 'Please try again in a moment.', variant: 'destructive' });
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const togglePin = async (note) => {
    setNotes(prev => prev.map(n => n.id === note.id ? { ...n, is_pinned: !n.is_pinned } : n));
    try {
      await base44.entities.Note.update(note.id, { is_pinned: !note.is_pinned });
    } catch {
      setNotes(prev => prev.map(n => n.id === note.id ? { ...n, is_pinned: note.is_pinned } : n));
      toast({ title: "Couldn't update note", description: 'Please try again in a moment.', variant: 'destructive' });
    }
  };

  // Guarded — see useDeleteLock. Optimistic removal plus rollback means a
  // double-tap can resurrect a row the first delete legitimately removed.
  const deleteNote = (id) => guardDelete(id, async () => {
    const existing = notes.find(n => n.id === id);
    setNotes(prev => prev.filter(n => n.id !== id));
    try {
      await base44.entities.Note.delete(id);
      toast({ title: 'Note deleted' });
    } catch {
      if (existing) setNotes(prev => [existing, ...prev]);
      toast({ title: "Couldn't delete note", description: 'Please try again in a moment.', variant: 'destructive' });
    }
  });

  // Sorted by the note's OWN date when it has one, newest first, falling
  // back to when it was written. Sorting purely by created_date put a note
  // dated next Friday below one jotted five minutes earlier about
  // yesterday, which is not how anyone reads a dated list.
  const filtered = notes
    .filter(n =>
      !search.trim() ||
      n.title?.toLowerCase().includes(search.toLowerCase()) ||
      n.content?.toLowerCase().includes(search.toLowerCase())
    )
    .slice()
    .sort((a, b) => (b.note_date || b.created_date || '').localeCompare(a.note_date || a.created_date || ''));
  const pinned = filtered.filter(n => n.is_pinned);
  const rest = filtered.filter(n => !n.is_pinned);

  if (loading) {
    return (
      <div className="py-4 space-y-3">
        {[1, 2, 3].map(i => <div key={i} className="h-20 rounded-2xl bg-secondary animate-pulse" />)}
      </div>
    );
  }

  return (
    <div className="py-4">
      <PullToRefreshIndicator pullY={pullY} refreshing={refreshing} threshold={threshold} />
      <PageHeader
        title="Notes"
        subtitle="Quick thoughts, ideas, and reminders"
        icon={StickyNote}
        gradient="gradient-notes"
        action={<Button size="sm" onClick={openNew} className="gap-1.5"><Plus className="w-4 h-4" /> New Note</Button>}
      />

      {notes.length > 0 && (
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search notes…" value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
      )}

      {showForm && (
        <div className="sky-card rounded-2xl p-4 mb-4">
          <div className="flex items-center justify-between mb-3">
            <p className="font-semibold text-sm">{editingId ? 'Edit Note' : 'New Note'}</p>
            <button onClick={closeForm} aria-label="Close" className="p-2.5 -m-1 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg hover:bg-secondary transition-colors">
              <X className="w-5 h-5 text-muted-foreground" />
            </button>
          </div>
          <div className="space-y-2.5">
            <div>
              <label htmlFor="note-subject" className="text-xs font-semibold text-muted-foreground mb-1.5 block">Subject</label>
              <Input
                id="note-subject"
                placeholder="What's this about?"
                value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              />
            </div>
            <div>
              <label htmlFor="note-date" className="text-xs font-semibold text-muted-foreground mb-1.5 block">Date</label>
              <Input
                id="note-date"
                type="date"
                value={form.note_date || ''}
                onChange={e => setForm(f => ({ ...f, note_date: e.target.value }))}
              />
            </div>
            <div>
              <label htmlFor="note-body" className="text-xs font-semibold text-muted-foreground mb-1.5 block">Note</label>
              <Textarea id="note-body" placeholder="Write something…" rows={4} value={form.content} onChange={e => setForm(f => ({ ...f, content: e.target.value }))} />
            </div>
            <div className="flex gap-2 pt-1">
              {COLORS.map(c => (
                <button
                  key={c}
                  onClick={() => setForm(f => ({ ...f, color: c }))}
                  className="w-7 h-7 rounded-full shrink-0 transition-transform active:scale-90"
                  style={{ background: c, outline: form.color === c ? '2px solid hsl(var(--foreground))' : 'none', outlineOffset: 2 }}
                />
              ))}
            </div>
          </div>
          <div className="flex gap-2 mt-3">
            <Button variant="outline" onClick={closeForm} className="flex-1">Cancel</Button>
            <Button onClick={saveNote} disabled={!form.title.trim() || saving} className="flex-1">
              {saving ? 'Saving…' : editingId ? 'Save Changes' : 'Add Note'}
            </Button>
          </div>
        </div>
      )}

      {notes.length === 0 && !showForm ? (
        <div className="text-center py-16 px-4">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl gradient-notes flex items-center justify-center">
            <StickyNote className="w-8 h-8 text-white" />
          </div>
          <p className="font-bold mb-1">No notes yet</p>
          <p className="text-sm text-muted-foreground mb-5">Jot down ideas, reminders, or anything worth keeping.</p>
          <Button onClick={openNew} className="gap-1.5"><Plus className="w-4 h-4" /> Write your first note</Button>
        </div>
      ) : (
        <div className="space-y-5">
          {pinned.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">📌 Pinned</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {pinned.map(note => (
                  <NoteCard key={note.id} note={note} onEdit={openEdit} onPin={togglePin} onDelete={deleteNote} deleting={isDeleting(note.id)} />
                ))}
              </div>
            </div>
          )}
          {rest.length > 0 && (
            <div>
              {pinned.length > 0 && <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">All Notes</p>}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {rest.map(note => (
                  <NoteCard key={note.id} note={note} onEdit={openEdit} onPin={togglePin} onDelete={deleteNote} deleting={isDeleting(note.id)} />
                ))}
              </div>
            </div>
          )}
          {filtered.length === 0 && (
            <p className="text-center text-sm text-muted-foreground py-10">No notes match "{search}"</p>
          )}
        </div>
      )}
    </div>
  );
}

function NoteCard({ note, onEdit, onPin, onDelete, deleting }) {
  return (
    <div
      className="rounded-2xl p-4 border border-black/5 cursor-pointer transition-transform active:scale-[0.98]"
      style={{ background: note.color || '#FDE68A' }}
      onClick={() => onEdit(note)}
    >
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <p className="font-bold text-sm text-neutral-900 leading-snug break-words">{note.title}</p>
        <div className="flex items-center gap-0.5 shrink-0">
          <button
            onClick={(e) => { e.stopPropagation(); onPin(note); }}
            className="p-1.5 rounded-lg hover:bg-black/10 transition-colors"
            title={note.is_pinned ? 'Unpin' : 'Pin'}
            aria-label={note.is_pinned ? 'Unpin note' : 'Pin note'}
          >
            <Pin className={`w-3.5 h-3.5 text-neutral-700 ${note.is_pinned ? 'fill-neutral-700' : ''}`} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(note.id); }}
            disabled={deleting}
            className="p-1.5 rounded-lg hover:bg-black/10 transition-colors"
            title="Delete note"
            aria-label="Delete note"
          >
            <Trash2 className="w-3.5 h-3.5 text-neutral-700" />
          </button>
        </div>
      </div>
      {note.note_date && (
        <p className="flex items-center gap-1 text-[11px] font-semibold text-neutral-700/75 mb-1.5">
          <Calendar className="w-3 h-3" />
          {noteDateLabel(note.note_date)}
        </p>
      )}
      {note.content && <p className="text-xs text-neutral-800/80 leading-relaxed line-clamp-4 whitespace-pre-wrap break-words">{note.content}</p>}
    </div>
  );
}
