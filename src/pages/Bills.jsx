import { useState, useEffect, useRef, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { Receipt, Plus, X, CheckCircle, Clock, AlertTriangle, Pencil, Trash2, Search, ArrowUpDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MobileSelect } from '@/components/ui/mobile-select';
import PageHeader from '@/components/PageHeader';
import StatCard from '@/components/StatCard';
import { toast } from '@/components/ui/use-toast';
import { format, parseISO, differenceInDays, startOfDay } from 'date-fns';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import PullToRefreshIndicator from '@/components/PullToRefreshIndicator';
import useAutoOpenForm from '@/hooks/useAutoOpenForm';

const CAT_ICONS = { housing: '🏠', utilities: '💡', phone: '📱', insurance: '🛡️', subscription: '📺', credit_card: '💳', loan: '🏦', other: '💸' };

const BILL_CAT_OPTIONS = Object.entries(CAT_ICONS).map(([key, icon]) => ({
  value: key,
  label: `${icon} ${key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, ' ')}`,
}));

function fmt(n) { return (n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

export default function Bills() {
  const [bills, setBills] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  useAutoOpenForm(() => setShowForm(true));
  const [editingBill, setEditingBill] = useState(null);
  const [form, setForm] = useState({ name: '', amount: '', due_date: '', category: 'other', is_recurring: true });
  const [saving, setSaving] = useState(false);
  // Persisted recently-deleted bills (survive page reload); timers re-attached on mount
  const [deletedBills, setDeletedBills] = useState(() => {
    try { return JSON.parse(localStorage.getItem('bills_recently_deleted') || '[]'); } catch { return []; }
  });
  const timersRef = useRef({});
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [sortDir, setSortDir] = useState('asc'); // 'asc' = earliest first, 'desc' = latest first
  const initialLoadDone = useRef(false);

  const loadBills = async (showSkeleton = false) => {
    if (showSkeleton) setLoading(true);
    try {
      const data = await base44.entities.Bill.list('due_date', 50);
      setBills(data);
    } catch (error) {
      toast({ title: "Couldn't load bills", description: "Please check your connection and try again.", variant: 'destructive' });
    } finally {
      if (showSkeleton) setLoading(false);
    }
  };

  const refreshData = useCallback(async () => {
    try {
      const data = await base44.entities.Bill.list('due_date', 50);
      setBills(data);
    } catch (error) {
      toast({ title: "Couldn't load bills", description: "Please check your connection and try again.", variant: 'destructive' });
    }
  }, []);

  const { pullY, refreshing, threshold } = usePullToRefresh(refreshData);

  useEffect(() => {
    if (initialLoadDone.current) return;
    initialLoadDone.current = true;
    loadBills(true);
    // Auto-open form if navigated from FAB
    const params = new URLSearchParams(window.location.search);
    if (params.get('add') === 'true') {
      setShowForm(true);
      window.history.replaceState({}, '', window.location.pathname);
    }
    // Re-attach deletion timers for any persisted deleted bills
    const persisted = JSON.parse(localStorage.getItem('bills_recently_deleted') || '[]');
    persisted.forEach(entry => {
      const remaining = entry.expiresAt - Date.now();
      if (remaining <= 0) {
        // Already expired — delete for real now
        base44.entities.Bill.delete(entry.id).catch(() => {});
        setDeletedBills(prev => prev.filter(d => d.id !== entry.id));
      } else {
        timersRef.current[entry.id] = setTimeout(async () => {
          await base44.entities.Bill.delete(entry.id).catch(() => {});
          setDeletedBills(prev => {
            const next = prev.filter(d => d.id !== entry.id);
            localStorage.setItem('bills_recently_deleted', JSON.stringify(next));
            return next;
          });
        }, remaining);
      }
    });
  }, []);

  const openEdit = (bill) => {
    setEditingBill(bill);
    setForm({ name: bill.name, amount: String(bill.amount), due_date: bill.due_date, category: bill.category || 'other', is_recurring: bill.is_recurring ?? true });
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingBill(null);
    setForm({ name: '', amount: '', due_date: '', category: 'other', is_recurring: true });
  };

  const saveBill = async () => {
    if (!form.name || !form.amount || !form.due_date) return;
    setSaving(true);
    try {
      const payload = { ...form, amount: parseFloat(form.amount) };
      if (editingBill) {
        setBills(prev => prev.map(b => b.id === editingBill.id ? { ...b, ...payload } : b));
        await base44.entities.Bill.update(editingBill.id, payload);
        toast({ title: 'Bill updated', description: form.name });
      } else {
        await base44.entities.Bill.create({ ...payload, is_paid: false });
        toast({ title: 'Bill added', description: form.name });
      }
      closeForm();
      loadBills(false);
    } catch (error) {
      toast({ title: "Couldn't save bill", description: "Please try again in a moment.", variant: 'destructive' });
      // Revert optimistic update for edit
      if (editingBill) loadBills(false);
    } finally {
      setSaving(false);
    }
  };

  const togglePaid = async (bill) => {
    const newPaid = !bill.is_paid;
    setBills(prev => prev.map(b => b.id === bill.id ? { ...b, is_paid: newPaid } : b));
    try {
      await base44.entities.Bill.update(bill.id, { is_paid: newPaid });
    } catch (error) {
      // Revert on failure
      setBills(prev => prev.map(b => b.id === bill.id ? { ...b, is_paid: bill.is_paid } : b));
      toast({ title: "Couldn't update bill", description: "Please try again in a moment.", variant: 'destructive' });
    }
  };

  const RESTORE_WINDOW_MS = 30 * 60 * 1000; // 30 minutes

  const deleteBill = (id) => {
    const bill = bills.find(b => b.id === id);
    if (!bill) return;
    setBills(prev => prev.filter(b => b.id !== id));
    const expiresAt = Date.now() + RESTORE_WINDOW_MS;
    const entry = { id, bill, expiresAt };
    setDeletedBills(prev => {
      const next = [entry, ...prev];
      localStorage.setItem('bills_recently_deleted', JSON.stringify(next));
      return next;
    });
    timersRef.current[id] = setTimeout(async () => {
      await base44.entities.Bill.delete(id).catch(() => {});
      setDeletedBills(prev => {
        const next = prev.filter(d => d.id !== id);
        localStorage.setItem('bills_recently_deleted', JSON.stringify(next));
        return next;
      });
    }, RESTORE_WINDOW_MS);
  };

  const restoreBill = async (id) => {
    const entry = deletedBills.find(d => d.id === id);
    if (!entry) return;
    clearTimeout(timersRef.current[id]);
    delete timersRef.current[id];
    // deleteBill() only ever hides the row locally - the real DB delete is
    // deferred to the timer above, which we just canceled. So the original
    // row is still there; restoring just means un-hiding it, not recreating
    // it (recreating produced a permanent duplicate whenever the 30-minute
    // window hadn't elapsed yet, which is the common case for an "undo").
    setDeletedBills(prev => {
      const next = prev.filter(d => d.id !== id);
      localStorage.setItem('bills_recently_deleted', JSON.stringify(next));
      return next;
    });
    loadBills(false);
  };

  // Compare against local midnight so a bill due *today* is neither "overdue"
  // nor "due in 0 days" off-by-one (parseISO returns local midnight; comparing
  // against `new Date()` mid-day made today's bills count as overdue).
  const today = startOfDay(new Date());
  const filteredBills = bills.filter(b => {
    if (categoryFilter !== 'all' && b.category !== categoryFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const matchesName = b.name?.toLowerCase().includes(q);
      const matchesAmount = String(b.amount || '').includes(q);
      const matchesDate = (b.due_date || '').includes(q);
      if (!matchesName && !matchesAmount && !matchesDate) return false;
    }
    if (dateFrom && b.due_date && b.due_date < dateFrom) return false;
    if (dateTo && b.due_date && b.due_date > dateTo) return false;
    return true;
  });
  const unpaid = filteredBills.filter(b => !b.is_paid).sort((a, b) => {
    const diff = new Date(a.due_date) - new Date(b.due_date);
    return sortDir === 'asc' ? diff : -diff;
  });
  const paid = filteredBills.filter(b => b.is_paid);
  const totalDue = bills.filter(b => !b.is_paid).reduce((s, b) => s + (b.amount || 0), 0);
  const overdue = bills.filter(b => !b.is_paid && b.due_date && parseISO(b.due_date) < today).length;
  const dueSoon = bills.filter(b => {
    if (b.is_paid || !b.due_date) return false;
    try {
      const diff = differenceInDays(parseISO(b.due_date), today);
      return diff >= 0 && diff <= 7;
    } catch { return false; }
  }).length;

  const usedCategories = [...new Set(bills.map(b => b.category).filter(Boolean))];

  if (loading) return (
    <div className="py-6 space-y-4">
      <div className="h-16 rounded-2xl bg-secondary/60 animate-pulse" />
      <div className="grid grid-cols-3 gap-3">
        {[1,2,3].map(i => <div key={i} className="h-16 rounded-2xl bg-secondary/60 animate-pulse" />)}
      </div>
      <div className="space-y-3">
        {[1,2,3].map(i => <div key={i} className="h-16 rounded-2xl bg-secondary/60 animate-pulse" />)}
      </div>
    </div>
  );

  return (
    <div className="py-6 pb-8">
      <PullToRefreshIndicator pullY={pullY} refreshing={refreshing} threshold={threshold} />
      <PageHeader
        title="Bills"
        subtitle="Track upcoming and recurring bills"
        icon={Receipt}
        gradient="gradient-tasks"
        action={
          <Button size="sm" onClick={() => { setEditingBill(null); setShowForm(true); }} className="gap-1">
            <Plus className="w-3.5 h-3.5" /> Add Bill
          </Button>
        }
      />

      {/* Summary */}
      {bills.length > 0 && (
        <div className="grid grid-cols-3 gap-3 mb-4">
          <StatCard label="Total due" value={totalDue} prefix="$" />
          <StatCard label="Overdue" value={overdue} tone={overdue > 0 ? 'negative' : 'default'} />
          <StatCard label="Due this week" value={dueSoon} tone={dueSoon > 0 ? 'warning' : 'default'} />
        </div>
      )}

      {/* Two-column layout on desktop */}
      <div>

        {/* Left column: filters + form */}
        <div className="space-y-3 mb-4 lg:mb-0">
          {/* Search */}
          {bills.length > 0 && (
            <div className="space-y-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                <Input
                  placeholder="Search bills…"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <p className="text-[10px] text-muted-foreground font-medium mb-1">Due from</p>
                  <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="text-sm" />
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground font-medium mb-1">Due to</p>
                  <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="text-sm" />
                </div>
              </div>
              {(searchQuery || dateFrom || dateTo) && (
                <button
                  onClick={() => { setSearchQuery(''); setDateFrom(''); setDateTo(''); }}
                  className="text-xs text-primary font-semibold"
                >
                  Clear filters
                </button>
              )}
            </div>
          )}

          {/* Category Filter */}
          {usedCategories.length > 1 && (
            <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
              <button
                onClick={() => setCategoryFilter('all')}
                className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${categoryFilter === 'all' ? 'bg-primary text-white' : 'bg-card border border-border text-muted-foreground'}`}
              >
                All
              </button>
              {usedCategories.map(key => (
                <button
                  key={key}
                  onClick={() => setCategoryFilter(key)}
                  className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${categoryFilter === key ? 'bg-primary text-white' : 'bg-card border border-border text-muted-foreground'}`}
                >
                  {CAT_ICONS[key]} {key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, ' ')}
                </button>
              ))}
            </div>
          )}

          {/* Add / Edit form */}
          {showForm && (
            <div className="sky-card rounded-2xl p-4">
              <div className="flex items-center justify-between mb-3">
                <p className="font-semibold text-sm">{editingBill ? 'Edit Bill' : 'Add Bill'}</p>
                <button onClick={closeForm} className="p-2.5 -m-1 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg hover:bg-secondary active:bg-secondary/70 transition-colors"><X className="w-5 h-5 text-muted-foreground" /></button>
              </div>
              <div className="space-y-2">
                <Input placeholder="Bill name (e.g. Rent, Netflix)" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
                <div className="grid grid-cols-2 gap-2">
                  <Input type="number" placeholder="Amount ($)" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} min="0.01" max="10000000" />
                  <Input type="date" value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))} />
                </div>
                <MobileSelect
                  value={form.category}
                  onValueChange={v => setForm(f => ({ ...f, category: v }))}
                  options={BILL_CAT_OPTIONS}
                />
              </div>
              <div className="flex gap-2 mt-3">
                <Button variant="outline" onClick={closeForm} className="flex-1">Cancel</Button>
                <Button onClick={saveBill} disabled={!form.name || !form.amount || !form.due_date || saving} className="flex-1">
                  {saving ? 'Saving…' : editingBill ? 'Save Changes' : 'Add Bill'}
                </Button>
              </div>
            </div>
          )}

          {/* Recently Deleted */}
          {deletedBills.length > 0 && (
            <div>
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Recently Deleted</p>
              <div className="space-y-2">
                {deletedBills.map(entry => (
                  <div key={entry.id} className="bg-card border border-dashed border-red-200 rounded-2xl p-3 flex items-center gap-3 opacity-70">
                    <span className="text-xl shrink-0">{CAT_ICONS[entry.bill.category] || '💸'}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold line-through truncate text-muted-foreground">{entry.bill.name}</p>
                      <p className="text-xs text-muted-foreground">${fmt(entry.bill.amount)} · {entry.bill.due_date ? format(parseISO(entry.bill.due_date), 'MMM d') : '—'}</p>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => restoreBill(entry.id)} className="shrink-0 text-xs border-primary text-primary">
                      Restore
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right column: bill list */}
        <div>
          {bills.length === 0 ? (
            <div className="bg-card border border-dashed border-border rounded-2xl p-10 text-center">
              <Receipt className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
              <p className="text-sm font-semibold mb-1">No bills added yet</p>
              <p className="text-xs text-muted-foreground mb-4">Add your recurring bills to track what's coming up and avoid missed payments.</p>
              <Button size="sm" onClick={() => setShowForm(true)} className="gap-1"><Plus className="w-3.5 h-3.5" /> Add Bill</Button>
            </div>
          ) : (
            <div className="space-y-4">
              {unpaid.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Upcoming</p>
                    <button
                      onClick={() => setSortDir(d => d === 'asc' ? 'desc' : 'asc')}
                      className="flex items-center gap-1 text-xs text-primary font-semibold"
                    >
                      <ArrowUpDown className="w-3 h-3" />
                      {sortDir === 'asc' ? 'Earliest first' : 'Latest first'}
                    </button>
                  </div>
                  <div className="space-y-2">
                    {unpaid.map(bill => {
                      const daysUntil = bill.due_date ? differenceInDays(parseISO(bill.due_date), today) : 999;
                      const isOverdue = daysUntil < 0;
                      const isDueSoon = daysUntil >= 0 && daysUntil <= 7;
                      return (
                        <div key={bill.id} className={`bg-card border rounded-2xl p-4 ${isOverdue ? 'border-red-200' : isDueSoon ? 'border-amber-200' : 'border-border'}`}>
                          <div className="flex items-center gap-3">
                            <span className="text-xl shrink-0">{CAT_ICONS[bill.category] || '💸'}</span>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold truncate">{bill.name}</p>
                              <div className="flex items-center gap-1.5 mt-0.5">
                                {isOverdue ? (
                                  <span className="flex items-center gap-1 text-xs text-red-500 font-medium"><AlertTriangle className="w-3 h-3" />Overdue</span>
                                ) : isDueSoon ? (
                                  <span className="flex items-center gap-1 text-xs text-amber-500 font-medium"><Clock className="w-3 h-3" />{daysUntil === 0 ? 'Due today' : daysUntil === 1 ? 'Due tomorrow' : `Due in ${daysUntil} days`}</span>
                                ) : (
                                  <span className="text-xs text-muted-foreground">Due {format(parseISO(bill.due_date), 'MMM d')}</span>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <span className="font-bold text-sm">${fmt(bill.amount)}</span>
                              <button onClick={() => togglePaid(bill)} className="w-7 h-7 rounded-full border-2 border-border flex items-center justify-center hover:border-emerald-500 hover:bg-emerald-50 transition-all" title="Mark as paid" aria-label="Mark as paid">
                                <CheckCircle className="w-3.5 h-3.5 text-muted-foreground/40" />
                              </button>
                              <button onClick={() => openEdit(bill)} className="p-1 text-muted-foreground hover:text-primary transition-colors" title="Edit bill" aria-label="Edit bill">
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button onClick={() => deleteBill(bill.id)} className="p-1 text-muted-foreground hover:text-destructive transition-colors" title="Delete bill" aria-label="Delete bill">
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {paid.length > 0 && (
                <div>
                  <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Paid</p>
                  <div className="space-y-2">
                    {paid.map(bill => (
                      <div key={bill.id} className="sky-card rounded-2xl p-4 opacity-60">
                        <div className="flex items-center gap-3">
                          <span className="text-xl shrink-0">{CAT_ICONS[bill.category] || '💸'}</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold line-through truncate">{bill.name}</p>
                            <p className="text-xs text-muted-foreground">{bill.due_date ? format(parseISO(bill.due_date), 'MMM d') : '—'}</p>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <span className="font-bold text-sm">${fmt(bill.amount)}</span>
                            <button onClick={() => togglePaid(bill)} className="w-7 h-7 rounded-full bg-emerald-100 flex items-center justify-center" title="Mark as unpaid" aria-label="Mark as unpaid">
                              <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
                            </button>
                            <button onClick={() => openEdit(bill)} className="p-1 text-muted-foreground hover:text-primary transition-colors" title="Edit bill" aria-label="Edit bill">
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => deleteBill(bill.id)} className="p-1 text-muted-foreground hover:text-destructive transition-colors" title="Delete bill" aria-label="Delete bill">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {unpaid.length === 0 && paid.length === 0 && (
                <div className="text-center py-8 text-sm text-muted-foreground">No bills match your filters.</div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}