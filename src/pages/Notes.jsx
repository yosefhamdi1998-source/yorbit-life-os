import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { StickyNote, Plus, Pin, Trash2, X, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import PageHeader from '@/components/PageHeader';
import { toast } from '@/components/ui/use-toast';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import PullToRefreshIndicator from '@/components/PullToRefreshIndicator';

const COLORS = ['#FDE68A', '#BFDBFE', '#BBF7D0', '#FBCFE8', '#DDD6FE', '#FECACA'];
const DEFAULT_FORM = () => ({ title: '', content: '', color: COLORS[0] });

export default function Notes() {
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(DEFAULT_FORM());
  const [saving, setSaving] = useState(false);

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
  const openEdit = (note) => {
    setEditingId(note.id);
    setForm({ title: note.title, content: note.content || '', color: note.color || COLORS[0] });
    setShowForm(true);
  };
  const closeForm = () => { setShowForm(false); setEditingId(null); setForm(DEFAULT_FORM()); };

  const saveNote = async () => {
    if (!form.title.trim()) return;
    setSaving(true);
    try {
      if (editingId) {
        await base44.entities.Note.update(editingId, form);
        toast({ title: 'Note updated' });
      } else {
        await base44.entities.Note.create(form);
        toast({ title: 'Note added' });
      }
      closeForm();
      loadNotes(false);
    } catch {
      toast({ title: "Couldn't save note", description: 'Please try again in a moment.', variant: 'destructive' });
    } finally {
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

  const deleteNote = async (id) => {
    const existing = notes.find(n => n.id === id);
    setNotes(prev => prev.filter(n => n.id !== id));
    try {
      await base44.entities.Note.delete(id);
      toast({ title: 'Note deleted' });
    } catch {
      if (existing) setNotes(prev => [existing, ...prev]);
      toast({ title: "Couldn't delete note", description: 'Please try again in a moment.', variant: 'destructive' });
    }
  };

  const filtered = notes.filter(n =>
    !search.trim() ||
    n.title?.toLowerCase().includes(search.toLowerCase()) ||
    n.content?.toLowerCase().includes(search.toLowerCase())
  );
  const pinned = filtered.filter(n => n.is_pinned);
  const rest = filtered.filter(n => !n.is_pinned);

  if (loading) {
    return (
      <div className="p-4 max-w-3xl mx-auto space-y-3">
        {[1, 2, 3].map(i => <div key={i} className="h-20 rounded-2xl bg-secondary animate-pulse" />)}
      </div>
    );
  }

  return (
    <div className="p-4 max-w-3xl mx-auto">
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
        <div className="bg-card border border-border rounded-2xl p-4 mb-4">
          <div className="flex items-center justify-between mb-3">
            <p className="font-semibold text-sm">{editingId ? 'Edit Note' : 'New Note'}</p>
            <button onClick={closeForm} className="p-2.5 -m-1 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg hover:bg-secondary transition-colors">
              <X className="w-5 h-5 text-muted-foreground" />
            </button>
          </div>
          <div className="space-y-2">
            <Input placeholder="Title" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
            <Textarea placeholder="Write something…" rows={4} value={form.content} onChange={e => setForm(f => ({ ...f, content: e.target.value }))} />
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
                  <NoteCard key={note.id} note={note} onEdit={openEdit} onPin={togglePin} onDelete={deleteNote} />
                ))}
              </div>
            </div>
          )}
          {rest.length > 0 && (
            <div>
              {pinned.length > 0 && <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">All Notes</p>}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {rest.map(note => (
                  <NoteCard key={note.id} note={note} onEdit={openEdit} onPin={togglePin} onDelete={deleteNote} />
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

function NoteCard({ note, onEdit, onPin, onDelete }) {
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
            className="p-1.5 rounded-lg hover:bg-black/10 transition-colors"
            title="Delete note"
            aria-label="Delete note"
          >
            <Trash2 className="w-3.5 h-3.5 text-neutral-700" />
          </button>
        </div>
      </div>
      {note.content && <p className="text-xs text-neutral-800/80 leading-relaxed line-clamp-4 whitespace-pre-wrap break-words">{note.content}</p>}
    </div>
  );
}
