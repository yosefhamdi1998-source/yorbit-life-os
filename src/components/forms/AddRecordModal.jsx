import { useState } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export default function AddRecordModal({ form, record, onClose, onSave }) {
  const fields = form.fields || [];
  const [data, setData] = useState(() => {
    const init = {};
    fields.forEach(f => { init[f.id] = record?.data?.[f.id] ?? ''; });
    return init;
  });
  const [notes, setNotes] = useState(record?.notes || '');
  const [saving, setSaving] = useState(false);

  const setField = (id, value) => setData(prev => ({ ...prev, [id]: value }));

  const handleSave = async () => {
    setSaving(true);
    await onSave(data, notes);
    setSaving(false);
  };

  const isEditing = !!record;

  return (
    <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-4">
      <div className="bg-card border border-border rounded-3xl w-full max-w-lg max-h-[90vh] flex flex-col shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <h2 className="font-black text-lg">{isEditing ? 'Edit Record' : 'Add Record'}</h2>
          <Button variant="ghost" size="icon" onClick={onClose} className="min-h-[44px] min-w-[44px]">
            <X className="w-5 h-5" />
          </Button>
        </div>

        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">
          {fields.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">This form has no fields. Edit the form to add fields first.</p>
          )}
          {fields.map(field => (
            <div key={field.id}>
              <p className="text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wide">
                {field.label}{field.required && ' *'}
              </p>
              {field.type === 'text' && (
                <Input value={data[field.id] || ''} onChange={e => setField(field.id, e.target.value)} className="min-h-[44px]" />
              )}
              {field.type === 'number' && (
                <Input type="number" value={data[field.id] || ''} onChange={e => setField(field.id, e.target.value)} className="min-h-[44px]" />
              )}
              {field.type === 'date' && (
                <Input type="date" value={data[field.id] || ''} onChange={e => setField(field.id, e.target.value)} className="min-h-[44px]" />
              )}
              {field.type === 'boolean' && (
                <div className="flex gap-2">
                  {['Yes', 'No'].map(opt => (
                    <button
                      key={opt}
                      onClick={() => setField(field.id, opt === 'Yes')}
                      className={`flex-1 min-h-[44px] rounded-xl border text-sm font-semibold transition-all ${
                        data[field.id] === (opt === 'Yes') ? 'bg-primary text-primary-foreground border-primary' : 'bg-secondary border-border text-foreground'
                      }`}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              )}
              {field.type === 'select' && field.options?.length > 0 && (
                <Select value={data[field.id] || ''} onValueChange={v => setField(field.id, v)}>
                  <SelectTrigger className="min-h-[44px]">
                    <SelectValue placeholder="Select..." />
                  </SelectTrigger>
                  <SelectContent>
                    {field.options.map(opt => (
                      <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          ))}

          <div>
            <p className="text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wide">Notes (optional)</p>
            <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Any additional notes..." className="min-h-[44px]" />
          </div>
        </div>

        <div className="px-5 py-4 border-t border-border shrink-0" style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
          <Button className="w-full min-h-[44px]" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : isEditing ? 'Save Changes' : 'Add Record'}
          </Button>
        </div>
      </div>
    </div>
  );
}