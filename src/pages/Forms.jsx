import { useState, useEffect, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useToast } from '@/components/ui/use-toast';
import { Plus, Search, FileText, Pencil, Trash2, ArrowLeft, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import PageHeader from '@/components/PageHeader';
import CreateFormModal from '@/components/forms/CreateFormModal';
import EditFormModal from '@/components/forms/EditFormModal';
import AddRecordModal from '@/components/forms/AddRecordModal';

export default function Forms() {
  const { toast } = useToast();
  const [forms, setForms] = useState([]);
  const [selectedForm, setSelectedForm] = useState(null);
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [recordsLoading, setRecordsLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [editForm, setEditForm] = useState(null);
  const [recordModal, setRecordModal] = useState(null); // { record } | {} for new

  const loadForms = async () => {
    try {
      const data = await base44.entities.CustomForm.list('-created_date', 100);
      setForms(data);
    } catch {
      toast({ title: "Couldn't load forms", description: 'Please try again in a moment.', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const loadRecords = async (formId) => {
    setRecordsLoading(true);
    try {
      const data = await base44.entities.CustomRecord.filter({ form_id: formId }, '-created_date', 200);
      setRecords(data);
    } catch {
      toast({ title: "Couldn't load records", description: 'Please try again in a moment.', variant: 'destructive' });
    } finally {
      setRecordsLoading(false);
    }
  };

  useEffect(() => { loadForms(); }, []);

  const openForm = (form) => {
    setSelectedForm(form);
    setSearch('');
    loadRecords(form.id);
  };

  const handleCreateForm = async (formData) => {
    try {
      const res = await base44.entities.CustomForm.create(formData);
      setForms(prev => [res, ...prev]);
      setShowCreate(false);
      toast({ title: 'Form created', description: formData.name });
    } catch {
      toast({ title: "Couldn't create form", description: 'Please try again in a moment.', variant: 'destructive' });
    }
  };

  const handleEditForm = async (formData) => {
    try {
      const res = await base44.entities.CustomForm.update(editForm.id, formData);
      setForms(prev => prev.map(f => f.id === editForm.id ? { ...f, ...res } : f));
      if (selectedForm?.id === editForm.id) setSelectedForm({ ...selectedForm, ...res });
      setEditForm(null);
      toast({ title: 'Form updated', description: formData.name });
    } catch {
      toast({ title: "Couldn't update form", description: 'Please try again in a moment.', variant: 'destructive' });
    }
  };

  const handleDeleteForm = async (form) => {
    if (!confirm(`Delete "${form.name}" and all its records?`)) return;
    try {
      // custom_records has ON DELETE CASCADE on form_id, so deleting the form alone
      // is enough — no need to delete its records first.
      await base44.entities.CustomForm.delete(form.id);
      setForms(prev => prev.filter(f => f.id !== form.id));
      if (selectedForm?.id === form.id) setSelectedForm(null);
      toast({ title: 'Form deleted' });
    } catch {
      toast({ title: "Couldn't delete form", description: 'Please try again in a moment.', variant: 'destructive' });
    }
  };

  const handleSaveRecord = async (data, notes) => {
    try {
      const isEditing = !!recordModal.record;
      const res = isEditing
        ? await base44.entities.CustomRecord.update(recordModal.record.id, { form_id: selectedForm.id, data, notes })
        : await base44.entities.CustomRecord.create({ form_id: selectedForm.id, data, notes });
      setRecords(prev => isEditing
        ? prev.map(r => r.id === recordModal.record.id ? { ...r, ...res } : r)
        : [res, ...prev]);
      setRecordModal(null);
      toast({ title: isEditing ? 'Record updated' : 'Record added' });
    } catch {
      toast({ title: "Couldn't save record", description: 'Please try again in a moment.', variant: 'destructive' });
    }
  };

  const handleDeleteRecord = async (record) => {
    if (!confirm('Delete this record?')) return;
    try {
      await base44.entities.CustomRecord.delete(record.id);
      setRecords(prev => prev.filter(r => r.id !== record.id));
      toast({ title: 'Record deleted' });
    } catch {
      toast({ title: "Couldn't delete record", description: 'Please try again in a moment.', variant: 'destructive' });
    }
  };

  const renderFieldValue = (field, value) => {
    if (field.type === 'boolean') return value ? 'Yes' : 'No';
    if (field.type === 'date' && value) return value;
    if (value === '' || value == null) return '—';
    return String(value);
  };

  const filteredRecords = useMemo(() => {
    if (!search.trim()) return records;
    const q = search.toLowerCase();
    return records.filter(r => {
      const text = (r.notes || '').toLowerCase();
      const fieldText = (selectedForm.fields || []).map(f => renderFieldValue(f, r.data?.[f.id])).join(' ').toLowerCase();
      return text.includes(q) || fieldText.includes(q);
    });
  }, [records, search, selectedForm]);

  // Detail view
  if (selectedForm) {
    return (
      <div className="p-4 lg:p-6 max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-5 gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Button variant="ghost" size="icon" onClick={() => setSelectedForm(null)} className="min-h-[44px] min-w-[44px] shrink-0">
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div className="w-11 h-11 rounded-2xl gradient-primary flex items-center justify-center text-xl shrink-0">
              {selectedForm.icon || '📋'}
            </div>
            <div className="min-w-0">
              <h1 className="text-xl font-black tracking-tight truncate">{selectedForm.name}</h1>
              {selectedForm.description && <p className="text-xs text-muted-foreground truncate">{selectedForm.description}</p>}
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Button variant="ghost" size="icon" onClick={() => setEditForm(selectedForm)} className="min-h-[44px] min-w-[44px]">
              <Pencil className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => handleDeleteForm(selectedForm)} className="min-h-[44px] min-w-[44px] text-muted-foreground hover:text-destructive">
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        </div>

        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search records..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-10 min-h-[44px]"
          />
        </div>

        <Button onClick={() => setRecordModal({})} className="w-full mb-4 min-h-[44px] gap-1.5">
          <Plus className="w-4 h-4" /> Add Record
        </Button>

        {recordsLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => <div key={i} className="h-24 rounded-2xl bg-card border border-border animate-pulse" />)}
          </div>
        ) : filteredRecords.length === 0 ? (
          <div className="text-center py-16">
            <FileText className="w-12 h-12 mx-auto text-muted-foreground/40 mb-3" />
            <p className="font-semibold text-muted-foreground">{search ? 'No records match your search' : 'No records yet'}</p>
            {!search && <p className="text-sm text-muted-foreground/70 mt-1">Tap "Add Record" to get started</p>}
          </div>
        ) : (
          <div className="space-y-3">
            {filteredRecords.map(record => (
              <div key={record.id} className="bg-card border border-border rounded-2xl p-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {(selectedForm.fields || []).filter(f => f.label?.trim()).map(field => (
                    <div key={field.id}>
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{field.label}</p>
                      <p className="text-sm font-medium mt-0.5">{renderFieldValue(field, record.data?.[field.id])}</p>
                    </div>
                  ))}
                </div>
                {record.notes && <p className="text-sm text-muted-foreground mt-3 pt-3 border-t border-border">{record.notes}</p>}
                <div className="flex justify-end gap-1 mt-3">
                  <Button variant="ghost" size="icon" onClick={() => setRecordModal({ record })} className="min-h-[40px] min-w-[40px]">
                    <Pencil className="w-4 h-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => handleDeleteRecord(record)} className="min-h-[40px] min-w-[40px] text-muted-foreground hover:text-destructive">
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {recordModal && (
          <AddRecordModal
            form={selectedForm}
            record={recordModal.record}
            onClose={() => setRecordModal(null)}
            onSave={handleSaveRecord}
          />
        )}
        {editForm && (
          <EditFormModal form={editForm} onClose={() => setEditForm(null)} onSave={handleEditForm} />
        )}
      </div>
    );
  }

  // List view
  return (
    <div className="p-4 lg:p-6 max-w-4xl mx-auto">
      <PageHeader
        title="Forms"
        subtitle="Build custom forms & track anything"
        icon={FileText}
        gradient="gradient-primary"
        action={
          <Button size="icon" onClick={() => setShowCreate(true)} className="min-h-[44px] min-w-[44px]">
            <Plus className="w-5 h-5" />
          </Button>
        }
      />

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[1, 2, 3, 4].map(i => <div key={i} className="h-28 rounded-2xl bg-card border border-border animate-pulse" />)}
        </div>
      ) : forms.length === 0 ? (
        <div className="text-center py-20">
          <div className="w-16 h-16 rounded-3xl gradient-primary flex items-center justify-center mx-auto mb-4">
            <FileText className="w-8 h-8 text-white" />
          </div>
          <h2 className="font-black text-lg">Create your first form</h2>
          <p className="text-sm text-muted-foreground mt-1 max-w-xs mx-auto">Build a custom form for anything — contacts, inventory, workouts, and more.</p>
          <Button onClick={() => setShowCreate(true)} className="mt-5 min-h-[44px] gap-1.5">
            <Plus className="w-4 h-4" /> New Form
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {forms.map(form => (
            <button
              key={form.id}
              onClick={() => openForm(form)}
              className="bg-card border border-border rounded-2xl p-4 text-left hover:shadow-md transition-shadow active:scale-[0.98] flex items-start gap-3"
            >
              <div className="w-11 h-11 rounded-2xl gradient-primary flex items-center justify-center text-xl shrink-0">
                {form.icon || '📋'}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <h3 className="font-bold truncate">{form.name}</h3>
                  {form.is_favorite && <Star className="w-3.5 h-3.5 text-accent fill-accent shrink-0" />}
                </div>
                {form.description && <p className="text-xs text-muted-foreground truncate mt-0.5">{form.description}</p>}
                <p className="text-xs text-muted-foreground/70 mt-1">{(form.fields || []).length} field{(form.fields || []).length === 1 ? '' : 's'}</p>
              </div>
            </button>
          ))}
        </div>
      )}

      {showCreate && (
        <CreateFormModal onClose={() => setShowCreate(false)} onCreate={handleCreateForm} />
      )}
    </div>
  );
}