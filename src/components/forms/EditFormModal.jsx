import { useState } from 'react';
import { X, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const EMOJIS = ['📋', '📝', '💰', '❤️', '🚗', '🏠', '👤', '🌍', '📅', '🎯', '💊', '🏋️', '📚', '✈️', '🍽️', '💼', '🎵', '🐾', '🌱', '⚽'];
const FIELD_TYPES = [
  { value: 'text', label: 'Text' },
  { value: 'number', label: 'Number' },
  { value: 'date', label: 'Date' },
  { value: 'boolean', label: 'Yes / No' },
  { value: 'select', label: 'Dropdown' },
];

export default function EditFormModal({ form, onClose, onSave }) {
  const [name, setName] = useState(form.name);
  const [icon, setIcon] = useState(form.icon || '📋');
  const [description, setDescription] = useState(form.description || '');
  const [fields, setFields] = useState(form.fields?.length ? form.fields : [{ id: crypto.randomUUID(), label: '', type: 'text', required: false }]);
  const [saving, setSaving] = useState(false);

  const addField = () => setFields(prev => [...prev, { id: crypto.randomUUID(), label: '', type: 'text', required: false }]);
  const removeField = (id) => setFields(prev => prev.filter(f => f.id !== id));
  const updateField = (id, key, value) => setFields(prev => prev.map(f => f.id === id ? { ...f, [key]: value } : f));

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    await onSave({ name: name.trim(), icon, description, fields: fields.filter(f => f.label.trim()) });
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-4">
      <div className="bg-card border border-border rounded-3xl w-full max-w-lg max-h-[90vh] flex flex-col shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <h2 className="font-black text-lg">Edit Form</h2>
          <Button variant="ghost" size="icon" onClick={onClose} className="min-h-[44px] min-w-[44px]">
            <X className="w-5 h-5" />
          </Button>
        </div>

        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-5">
          <div>
            <p className="text-xs font-semibold text-muted-foreground mb-2">ICON</p>
            <div className="flex flex-wrap gap-2">
              {EMOJIS.map(e => (
                <button key={e} onClick={() => setIcon(e)}
                  className={`text-xl w-10 h-10 rounded-xl flex items-center justify-center transition-all ${icon === e ? 'bg-primary/20 ring-2 ring-primary' : 'bg-secondary hover:bg-secondary/70'}`}>
                  {e}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold text-muted-foreground mb-2">FORM NAME</p>
            <Input value={name} onChange={e => setName(e.target.value)} className="min-h-[44px]" />
          </div>

          <div>
            <p className="text-xs font-semibold text-muted-foreground mb-2">DESCRIPTION</p>
            <Input value={description} onChange={e => setDescription(e.target.value)} className="min-h-[44px]" />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-muted-foreground">FIELDS</p>
              <Button variant="ghost" size="sm" onClick={addField} className="gap-1 text-xs min-h-[36px]">
                <Plus className="w-3 h-3" /> Add Field
              </Button>
            </div>
            <div className="space-y-2">
              {fields.map((field, i) => (
                <div key={field.id} className="flex items-center gap-2">
                  <Input placeholder={`Field ${i + 1}`} value={field.label}
                    onChange={e => updateField(field.id, 'label', e.target.value)} className="flex-1 min-h-[44px]" />
                  <Select value={field.type} onValueChange={v => updateField(field.id, 'type', v)}>
                    <SelectTrigger className="w-32 min-h-[44px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {FIELD_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {fields.length > 1 && (
                    <Button variant="ghost" size="icon" onClick={() => removeField(field.id)}
                      className="min-h-[44px] min-w-[44px] text-muted-foreground hover:text-destructive">
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="px-5 py-4 border-t border-border shrink-0">
          <Button className="w-full min-h-[44px]" disabled={!name.trim() || saving} onClick={handleSave}>
            {saving ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </div>
    </div>
  );
}