import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Plus, X, Pencil, Trash2, PiggyBank } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const ICONS = ['🎯', '🏖️', '🚗', '🏠', '🎓', '💍', '🛡️', '✈️', '💻', '💰', '🌍', '🎁'];
const COLORS = ['#059669', '#7C3AED', '#2563EB', '#F97316', '#EC4899', '#EF4444', '#F59E0B', '#0EA5E9'];

const DEFAULT_FORM = { name: '', target_amount: '', current_amount: '', icon: '🎯', color: '#059669', target_date: '', notes: '' };

export default function SavingsGoals({ goals, onRefresh }) {
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState(DEFAULT_FORM);
  const [saving, setSaving] = useState(false);

  const openCreate = () => { setForm(DEFAULT_FORM); setEditId(null); setShowForm(true); };
  const openEdit = (g) => {
    setForm({ name: g.name, target_amount: g.target_amount, current_amount: g.current_amount || 0, icon: g.icon || '🎯', color: g.color || '#059669', target_date: g.target_date || '', notes: g.notes || '' });
    setEditId(g.id);
    setShowForm(true);
  };

  const save = async () => {
    setSaving(true);
    const data = { ...form, target_amount: parseFloat(form.target_amount) || 0, current_amount: parseFloat(form.current_amount) || 0 };
    if (editId) await base44.entities.SavingsGoal.update(editId, data);
    else await base44.entities.SavingsGoal.create(data);
    setSaving(false);
    setShowForm(false);
    onRefresh();
  };

  const del = async (id) => {
    await base44.entities.SavingsGoal.delete(id);
    onRefresh();
  };

  return (
    <div>
      <div className="flex justify-end mb-4">
        <Button onClick={openCreate} variant="outline" size="sm">
          <Plus className="w-3.5 h-3.5 mr-1" /> Add Goal
        </Button>
      </div>

      {goals.length === 0 && !showForm && (
        <div className="text-center py-12 text-muted-foreground">
          <PiggyBank className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm font-medium">No savings goals yet</p>
          <p className="text-xs mt-1">Set a target for Vacation, Emergency Fund, and more</p>
        </div>
      )}

      {showForm && (
        <div className="bg-card border border-border rounded-2xl p-5 mb-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-sm">{editId ? 'Edit Goal' : 'New Savings Goal'}</h3>
            <button onClick={() => setShowForm(false)}><X className="w-4 h-4 text-muted-foreground" /></button>
          </div>

          {/* Icon picker */}
          <div className="flex flex-wrap gap-2 mb-4">
            {ICONS.map(ic => (
              <button
                key={ic}
                onClick={() => setForm(f => ({ ...f, icon: ic }))}
                className={`text-xl w-9 h-9 rounded-xl flex items-center justify-center transition-all ${form.icon === ic ? 'ring-2 ring-primary bg-primary/10' : 'bg-secondary'}`}
              >{ic}</button>
            ))}
          </div>

          {/* Color picker */}
          <div className="flex gap-2 mb-4">
            {COLORS.map(c => (
              <button
                key={c}
                onClick={() => setForm(f => ({ ...f, color: c }))}
                className={`w-6 h-6 rounded-full transition-all ${form.color === c ? 'ring-2 ring-offset-2 ring-foreground scale-110' : ''}`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input placeholder="Goal name (e.g. Vacation)" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            <Input type="number" placeholder="Target amount ($)" value={form.target_amount} onChange={e => setForm(f => ({ ...f, target_amount: e.target.value }))} />
            <Input type="number" placeholder="Amount saved so far ($)" value={form.current_amount} onChange={e => setForm(f => ({ ...f, current_amount: e.target.value }))} />
            <Input type="date" value={form.target_date} onChange={e => setForm(f => ({ ...f, target_date: e.target.value }))} />
            <Input placeholder="Notes (optional)" className="sm:col-span-2" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
          </div>
          <Button onClick={save} disabled={saving || !form.name || !form.target_amount} className="mt-4 w-full bg-emerald-600 hover:bg-emerald-700 text-white border-0">
            {saving ? 'Saving...' : editId ? 'Update Goal' : 'Create Goal'}
          </Button>
        </div>
      )}

      <div className="grid sm:grid-cols-2 gap-4">
        {goals.map(g => {
          const target = g.target_amount || 1;
          const current = g.current_amount || 0;
          const pct = Math.min((current / target) * 100, 100);
          const remaining = Math.max(target - current, 0);
          const done = pct >= 100;

          return (
            <div key={g.id} className="bg-card border border-border rounded-2xl p-4 relative overflow-hidden">
              {/* Subtle background tint */}
              <div className="absolute inset-0 opacity-5 rounded-2xl" style={{ backgroundColor: g.color || '#059669' }} />

              <div className="relative">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">{g.icon || '🎯'}</span>
                    <div>
                      <p className="font-semibold text-sm leading-tight">{g.name}</p>
                      {g.target_date && (
                        <p className="text-[11px] text-muted-foreground">by {g.target_date}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => openEdit(g)} className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors">
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => del(g.id)} className="p-1.5 rounded-lg hover:bg-red-500/10 text-muted-foreground hover:text-red-500 transition-colors">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="h-2.5 bg-secondary rounded-full overflow-hidden mb-2">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${pct}%`, backgroundColor: g.color || '#059669' }}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-base font-black">${current.toLocaleString()}</span>
                    <span className="text-xs text-muted-foreground"> / ${target.toLocaleString()}</span>
                  </div>
                  {done ? (
                    <span className="text-xs font-bold text-emerald-600 bg-emerald-500/10 px-2 py-0.5 rounded-full">🎉 Reached!</span>
                  ) : (
                    <span className="text-xs font-semibold" style={{ color: g.color || '#059669' }}>{pct.toFixed(0)}%</span>
                  )}
                </div>

                {!done && (
                  <p className="text-[11px] text-muted-foreground mt-1">${remaining.toLocaleString()} remaining</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}