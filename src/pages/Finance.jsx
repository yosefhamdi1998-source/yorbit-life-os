import { useState, useEffect, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { DollarSign, Plus, X, Trash2, Search, Upload, Receipt, Link2, BarChart3, TrendingUp, TrendingDown, PiggyBank, Percent, ChevronRight, ChevronDown, Pencil, StickyNote, ArrowUp, ArrowDown, Check, ListChecks, SlidersHorizontal } from 'lucide-react';
import { prettyMerchant } from '@/lib/merchantName';
// X kept for NW form close button
import AddTransactionSheet from '@/components/finance/AddTransactionSheet';
import { FEATURES } from '@/lib/features';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MobileSelect } from '@/components/ui/mobile-select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import SpendingByCategoryChart from '@/components/finance/SpendingByCategoryChart';
import IncomeExpenseTrendChart from '@/components/finance/IncomeExpenseTrendChart';
import NetWorthHistoryChart from '@/components/finance/NetWorthHistoryChart';
import PullToRefreshIndicator from '@/components/PullToRefreshIndicator';
import StatCard from '@/components/StatCard';
import PageHeader from '@/components/PageHeader';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import { useNavigate, Link } from 'react-router-dom';
import { subMonths, subDays, format, parseISO, startOfDay, differenceInCalendarDays } from 'date-fns';
import { toast } from '@/components/ui/use-toast';
import useDeleteLock from '@/hooks/useDeleteLock';
import { getSimpleMode } from '@/lib/simpleMode';
import useAutoOpenForm from '@/hooks/useAutoOpenForm';
import { PERIODS, filterByPeriod, getLatestTransactionDate, rangeLabel } from '@/lib/periods';
import { NET_WORTH_CATEGORIES } from '@/lib/enums';
import { composeNetWorth, freshnessLabel } from '@/lib/netWorth';

const EXPENSE_CATS = ['housing', 'food', 'transport', 'entertainment', 'health', 'shopping', 'education', 'savings', 'investment', 'other'];
const INCOME_CATS = ['salary', 'freelance', 'investment', 'other'];
const CAT_COLORS = { housing: '#7C3AED', food: '#F97316', transport: '#3B82F6', entertainment: '#EC4899', health: '#EF4444', shopping: '#F59E0B', education: '#10B981', savings: '#059669', salary: '#22C55E', freelance: '#6366F1', investment: '#0EA5E9', other: '#94A3B8' };
const CAT_ICONS = { housing: '🏠', food: '🍔', transport: '🚗', entertainment: '🎬', health: '💊', shopping: '🛍️', education: '📚', savings: '💰', salary: '💵', freelance: '💻', investment: '📈', other: '💸' };

const TX_TYPE_OPTIONS = [
  { value: 'expense', label: '💸 Expense' },
  { value: 'income', label: '💵 Income' },
];

const NW_TYPE_OPTIONS = [
  { value: 'asset', label: '✅ Asset' },
  { value: 'liability', label: '❌ Liability' },
];

// From the single source of truth, verified against
// net_worth_entries_category_check by `npm run check:enums`.
const NW_CAT_OPTIONS = NET_WORTH_CATEGORIES.map(c => ({
  value: c,
  label: c.charAt(0).toUpperCase() + c.slice(1).replace(/_/g, ' '),
}));
const NW_CAT_ICONS = { cash: '💵', investment: '📈', property: '🏠', vehicle: '🚗', crypto: '🪙', loan: '🏦', mortgage: '🏡', credit_card: '💳', other: '💼' };

function getCatOptions(type) {
  return (type === 'income' ? INCOME_CATS : EXPENSE_CATS).map(c => ({
    value: c,
    label: `${CAT_ICONS[c] || ''} ${c.charAt(0).toUpperCase() + c.slice(1)}`,
  }));
}

function fmt(n) { return (n || 0).toLocaleString('en-US', { maximumFractionDigits: 0 }); }

// "Today" / "Yesterday" / "Tue, Aug 25" / "Tue, Aug 25, 2024" — parseISO so
// a yyyy-MM-dd string isn't read as UTC midnight and shown as the previous
// day. The year only shows up for a date outside the current calendar
// year — with 3 years of bank-sync/statement-import history now routine,
// "Nov 2" alone is genuinely ambiguous once a list holds more than one
// November, so a same-year date stays short while anything older gets
// disambiguated instead of silently guessed at.
function dateHeading(dateStr) {
  if (!dateStr || dateStr === 'unknown') return 'No date';
  try {
    const d = parseISO(dateStr);
    const today = startOfDay(new Date());
    const diff = differenceInCalendarDays(today, startOfDay(d));
    if (diff === 0) return 'Today';
    if (diff === 1) return 'Yesterday';
    return format(d, d.getFullYear() === today.getFullYear() ? 'EEE, MMM d' : 'EEE, MMM d, yyyy');
  } catch {
    return dateStr;
  }
}

// ─── Transaction Row ──────────────────────────────────────────────────────────
// Shared between date-grouped rendering (sorted by date, date already reads
// as the section header) and flat rendering (sorted by amount, so each row
// carries its own date since there's no header to lean on).
function TransactionRow({ tx, showDate, selectMode, selected, onToggleSelect, confirmId, setConfirmId, editingNoteId, noteDraft, setNoteDraft, savingNoteId, startEditNote, cancelEditNote, saveNote, onDelete }) {
  const isTemp = tx.id?.startsWith('temp-');
  return (
    <div className={`${isTemp ? 'opacity-50' : ''} ${selectMode && selected ? 'bg-primary/5' : ''}`}>
      <div
        className={`flex items-center gap-3 px-4 py-3 group ${selectMode ? 'cursor-pointer' : ''}`}
        onClick={selectMode ? () => onToggleSelect(tx.id) : undefined}
      >
        {selectMode && (
          <div
            className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${selected ? 'bg-primary border-primary' : 'border-border'}`}
            aria-hidden="true"
          >
            {selected && <Check className="w-3 h-3 text-primary-foreground" strokeWidth={3} />}
          </div>
        )}
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 text-base"
          style={{ backgroundColor: (CAT_COLORS[tx.category] || '#94A3B8') + '22' }}
        >
          {CAT_ICONS[tx.category] || '💸'}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold truncate">{prettyMerchant(tx.title)}</p>
          <p className="text-xs text-muted-foreground capitalize truncate">
            {tx.category}{showDate ? ` · ${dateHeading(tx.date)}` : ''}
          </p>
        </div>
        <span className={`font-bold text-sm shrink-0 tabular-nums ${tx.type === 'income' ? 'text-emerald-600 dark:text-emerald-400' : 'text-foreground'}`}>
          {tx.type === 'income' ? '+' : '−'}${tx.amount?.toFixed(2)}
        </span>
        {!isTemp && !selectMode && (
          <>
            <button
              onClick={() => startEditNote(tx)}
              className="text-muted-foreground/50 hover:text-primary transition-colors shrink-0 p-2 rounded-lg"
              title={tx.notes ? 'Edit note' : 'Add note'}
              aria-label={tx.notes ? 'Edit note' : 'Add note'}
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setConfirmId(confirmId === tx.id ? null : tx.id)}
              className="text-muted-foreground/50 hover:text-destructive transition-colors shrink-0 p-2 -mr-2 rounded-lg"
              title="Delete transaction"
              aria-label="Delete transaction"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </>
        )}
      </div>

      {/* Existing note, shown as a second line — tap to edit (disabled while selecting, so a tap there selects the row instead). */}
      {tx.notes && editingNoteId !== tx.id && (
        selectMode ? (
          <p className="w-full text-left px-4 pb-2.5 -mt-1 flex items-start gap-1.5">
            <StickyNote className="w-3 h-3 mt-0.5 shrink-0 text-primary/60" />
            <span className="text-xs text-muted-foreground truncate">{tx.notes}</span>
          </p>
        ) : (
          <button onClick={() => startEditNote(tx)} className="w-full text-left px-4 pb-2.5 -mt-1 flex items-start gap-1.5 group/note">
            <StickyNote className="w-3 h-3 mt-0.5 shrink-0 text-primary/60" />
            <span className="text-xs text-muted-foreground truncate group-hover/note:text-foreground transition-colors">{tx.notes}</span>
          </button>
        )
      )}

      {/* Inline note editor — same expand-below-the-row pattern as the delete confirmation. */}
      {!selectMode && editingNoteId === tx.id && (
        <div className="px-4 pb-3 flex items-center gap-2">
          <Input
            autoFocus
            placeholder="Add a note…"
            value={noteDraft}
            onChange={e => setNoteDraft(e.target.value)}
            className="h-8 text-xs flex-1"
            onKeyDown={e => { if (e.key === 'Enter') saveNote(tx); if (e.key === 'Escape') cancelEditNote(); }}
          />
          <Button size="sm" variant="outline" className="h-8 text-xs shrink-0" onClick={cancelEditNote}>Cancel</Button>
          <Button
            size="sm"
            className="h-8 text-xs shrink-0 bg-primary hover:bg-primary/90 text-primary-foreground border-0"
            onClick={() => saveNote(tx)}
            disabled={savingNoteId === tx.id}
          >
            {savingNoteId === tx.id ? 'Saving…' : 'Save'}
          </Button>
        </div>
      )}

      {!selectMode && confirmId === tx.id && (
        <div className="flex items-center justify-between px-4 pb-3 gap-2">
          <p className="text-xs text-muted-foreground">Delete this transaction?</p>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setConfirmId(null)}>Cancel</Button>
            <Button
              size="sm"
              variant="destructive"
              className="h-7 text-xs"
              onClick={() => { onDelete(tx.id); setConfirmId(null); }}
            >
              Delete
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Transaction List ─────────────────────────────────────────────────────────
function TransactionList({ transactions, onDelete, onAdd, onUpdateNote }) {
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [dateRange, setDateRange] = useState('all');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [amountMin, setAmountMin] = useState('');
  const [amountMax, setAmountMax] = useState('');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [sortBy, setSortBy] = useState('date');
  const [sortDir, setSortDir] = useState('desc');
  const [confirmId, setConfirmId] = useState(null);
  const [editingNoteId, setEditingNoteId] = useState(null);
  const [noteDraft, setNoteDraft] = useState('');
  const [savingNoteId, setSavingNoteId] = useState(null);
  const [visibleCount, setVisibleCount] = useState(60);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState(() => new Set());

  // Same "anchor to the latest transaction, not literal today" rule as the
  // rest of the app (src/lib/periods.js) — so "Week" here means the same
  // thing it means on Home and Save More instead of drifting to $0/empty
  // for anyone whose data trails today's real date.
  const latestTxDate = useMemo(() => getLatestTransactionDate(transactions), [transactions]);

  // "other" is dropped from the chip list on request — it's a catch-all
  // bucket, not a meaningful thing to filter by, and cutting it (plus
  // switching these rows from horizontal scroll to wrap below) is what
  // gets the category row to fit without a scroller.
  const categoryOptions = useMemo(() => {
    return [...new Set(transactions.map(t => t.category).filter(c => c && c !== 'other'))].sort();
  }, [transactions]);

  const filtered = useMemo(() => {
    let list = transactions;
    if (typeFilter === 'income') list = list.filter(t => t.type === 'income');
    else if (typeFilter === 'expense') list = list.filter(t => t.type === 'expense');
    if (categoryFilter !== 'all') list = list.filter(t => t.category === categoryFilter);
    if (dateRange !== 'all') list = filterByPeriod(list, dateRange, latestTxDate);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(t => t.title?.toLowerCase().includes(q) || t.notes?.toLowerCase().includes(q));
    }
    // Advanced Search: amount range and an exact date range, both additive
    // on top of whatever's already narrowed above — e.g. "Spending" +
    // "$50–$200" + "Jan 1–Jan 31" all apply together.
    const min = parseFloat(amountMin);
    const max = parseFloat(amountMax);
    if (!isNaN(min)) list = list.filter(t => (t.amount || 0) >= min);
    if (!isNaN(max)) list = list.filter(t => (t.amount || 0) <= max);
    if (customFrom) list = list.filter(t => t.date && t.date >= customFrom);
    if (customTo) list = list.filter(t => t.date && t.date <= customTo);
    return list;
  }, [transactions, typeFilter, categoryFilter, dateRange, search, latestTxDate, amountMin, amountMax, customFrom, customTo]);

  const sorted = useMemo(() => {
    const list = [...filtered];
    list.sort((a, b) => {
      const cmp = sortBy === 'amount' ? (a.amount || 0) - (b.amount || 0) : (a.date || '').localeCompare(b.date || '');
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return list;
  }, [filtered, sortBy, sortDir]);

  // Changing any filter/sort should show the newest matches again, not
  // whatever page you'd scrolled down to under the old list.
  useEffect(() => { setVisibleCount(60); }, [typeFilter, categoryFilter, dateRange, search, sortBy, sortDir, amountMin, amountMax, customFrom, customTo]);

  // Rows are already sorted; bucket the currently-revealed slice by day,
  // preserving order — but only when sorted by date, since grouping by day
  // stops meaning anything once rows are ordered by amount instead.
  const grouped = useMemo(() => {
    if (sortBy !== 'date') return null;
    const buckets = new Map();
    for (const tx of sorted.slice(0, visibleCount)) {
      const key = tx.date || 'unknown';
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(tx);
    }
    return [...buckets.entries()];
  }, [sorted, visibleCount, sortBy]);
  const visibleFlat = sortBy === 'amount' ? sorted.slice(0, visibleCount) : null;

  const toggleSort = (key) => {
    if (sortBy === key) setSortDir(d => (d === 'desc' ? 'asc' : 'desc'));
    else { setSortBy(key); setSortDir('desc'); }
  };

  const startEditNote = (tx) => { setConfirmId(null); setEditingNoteId(tx.id); setNoteDraft(tx.notes || ''); };
  const cancelEditNote = () => { setEditingNoteId(null); setNoteDraft(''); };
  const saveNote = async (tx) => {
    setSavingNoteId(tx.id);
    try {
      await onUpdateNote(tx.id, noteDraft.trim());
      setEditingNoteId(null);
    } catch {
      // parent already toasts the failure
    } finally {
      setSavingNoteId(null);
    }
  };

  const toggleSelect = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const toggleSelectMode = () => {
    setSelectMode(m => !m);
    setSelectedIds(new Set());
  };
  // Net, signed total — same convention as every amount shown on each row
  // (income adds, expense subtracts), so a mixed selection reads correctly
  // and an all-expense selection just reads as "how much these cost."
  const selectedTotal = useMemo(() => {
    let sum = 0;
    for (const tx of transactions) {
      if (selectedIds.has(tx.id)) sum += tx.type === 'income' ? (tx.amount || 0) : -(tx.amount || 0);
    }
    return sum;
  }, [transactions, selectedIds]);

  const rowProps = { selectMode, onToggleSelect: toggleSelect, confirmId, setConfirmId: (id) => { setEditingNoteId(null); setConfirmId(id); }, editingNoteId, noteDraft, setNoteDraft, savingNoteId, startEditNote, cancelEditNote, saveNote, onDelete };

  const noFiltersActive = typeFilter === 'all' && categoryFilter === 'all' && dateRange === 'all' && !search.trim()
    && !amountMin && !amountMax && !customFrom && !customTo;
  const advancedFilterCount = [amountMin, amountMax, customFrom, customTo].filter(Boolean).length;
  const clearAdvanced = () => { setAmountMin(''); setAmountMax(''); setCustomFrom(''); setCustomTo(''); };

  if (transactions.length === 0) {
    return (
      <div className="bg-card border border-dashed border-border rounded-2xl p-8 text-center">
        <DollarSign className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
        <p className="text-sm font-semibold mb-1">No transactions yet</p>
        <p className="text-xs text-muted-foreground mb-4">Add your first transaction to unlock charts, budgets, and AI insights.</p>
        <Button size="sm" onClick={onAdd} className="gap-1"><Plus className="w-3.5 h-3.5" /> Add Transaction</Button>
      </div>
    );
  }

  return (
    <div>
      <div className="space-y-2 mb-4">
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground font-medium">
            {noFiltersActive
              ? `${transactions.length} transaction${transactions.length === 1 ? '' : 's'} total`
              : `${sorted.length} of ${transactions.length} transactions`}
          </p>
          <button
            onClick={toggleSelectMode}
            className={`shrink-0 text-xs font-semibold px-2.5 py-1 -mr-2.5 rounded-full transition-colors flex items-center gap-1 ${selectMode ? 'text-destructive' : 'text-primary'}`}
          >
            {selectMode ? <><X className="w-3.5 h-3.5" /> Cancel</> : <><ListChecks className="w-3.5 h-3.5" /> Select</>}
          </button>
        </div>

        {/* Sticky while scrolling the list below, so the running total stays
            visible as you keep tapping rows further down the page. */}
        {selectMode && (
          <div className="sticky z-10 top-[calc(env(safe-area-inset-top)+56px)] lg:top-0 sky-card rounded-xl px-4 py-2.5 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="text-sm font-bold shrink-0">{selectedIds.size} selected</span>
              {selectedIds.size > 0 && (
                <button onClick={() => setSelectedIds(new Set())} className="text-xs font-medium text-primary shrink-0">Clear</button>
              )}
            </div>
            <span className={`font-numeric font-black text-base tabular-nums shrink-0 ${selectedIds.size === 0 ? 'text-muted-foreground' : selectedTotal >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-foreground'}`}>
              {selectedIds.size > 0 ? `${selectedTotal >= 0 ? '+' : '−'}$${Math.abs(selectedTotal).toFixed(2)}` : 'Tap rows to add'}
            </span>
          </div>
        )}

        <div className="flex gap-2">
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Search by merchant or description…" value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
          </div>
          <button
            onClick={() => setShowAdvanced(v => !v)}
            className={`relative shrink-0 flex items-center gap-1.5 px-3 rounded-md border text-xs font-semibold transition-all ${showAdvanced || advancedFilterCount > 0 ? 'bg-primary text-primary-foreground border-primary' : 'bg-secondary border-border text-muted-foreground hover:text-foreground'}`}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            Advanced
            {advancedFilterCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-destructive text-white text-[9px] font-bold flex items-center justify-center">{advancedFilterCount}</span>
            )}
          </button>
        </div>

        {showAdvanced && (
          <div className="sky-card rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Advanced Search</p>
              {advancedFilterCount > 0 && (
                <button onClick={clearAdvanced} className="text-xs font-semibold text-primary hover:underline">Clear</button>
              )}
            </div>
            <div>
              <label className="text-xs text-muted-foreground font-medium mb-1.5 block">Amount range ($)</label>
              <div className="grid grid-cols-2 gap-2">
                <Input type="number" placeholder="Min" value={amountMin} onChange={e => setAmountMin(e.target.value)} min="0" />
                <Input type="number" placeholder="Max" value={amountMax} onChange={e => setAmountMax(e.target.value)} min="0" />
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground font-medium mb-1.5 block">Exact date range</label>
              <div className="grid grid-cols-2 gap-2">
                <Input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} />
                <Input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} />
              </div>
            </div>
          </div>
        )}

        {/* Wrapping instead of horizontal-scrolling: every chip stays
            visible on screen at once, no swipe/scroller needed to see
            the rest of the row. */}
        <div className="flex flex-wrap gap-2">
          {[{ key: 'all', label: 'All' }, { key: 'expense', label: 'Spending' }, { key: 'income', label: 'Income' }].map(f => (
            <button
              key={f.key}
              onClick={() => setTypeFilter(f.key)}
              className={`text-xs px-3 py-1.5 rounded-full border transition-all ${typeFilter === f.key ? 'bg-primary text-primary-foreground border-primary' : 'bg-secondary border-border text-muted-foreground'}`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {categoryOptions.length > 0 && (
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setCategoryFilter('all')}
              className={`text-xs px-3 py-1.5 rounded-full border transition-all ${categoryFilter === 'all' ? 'bg-primary text-primary-foreground border-primary' : 'bg-secondary border-border text-muted-foreground'}`}
            >
              All categories
            </button>
            {categoryOptions.map(cat => (
              <button
                key={cat}
                onClick={() => setCategoryFilter(cat)}
                className={`text-xs px-3 py-1.5 rounded-full border capitalize transition-all flex items-center gap-1 ${categoryFilter === cat ? 'bg-primary text-primary-foreground border-primary' : 'bg-secondary border-border text-muted-foreground'}`}
              >
                <span>{CAT_ICONS[cat] || '💸'}</span>{cat}
              </button>
            ))}
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setDateRange('all')}
            className={`text-xs px-3 py-1.5 rounded-full border transition-all ${dateRange === 'all' ? 'bg-primary text-primary-foreground border-primary' : 'bg-secondary border-border text-muted-foreground'}`}
          >
            All time
          </button>
          {PERIODS.map(p => (
            <button
              key={p.key}
              onClick={() => setDateRange(p.key)}
              className={`text-xs px-3 py-1.5 rounded-full border transition-all ${dateRange === p.key ? 'bg-primary text-primary-foreground border-primary' : 'bg-secondary border-border text-muted-foreground'}`}
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground shrink-0">Sort</span>
          {[{ key: 'date', label: 'Date' }, { key: 'amount', label: 'Amount' }].map(s => (
            <button
              key={s.key}
              onClick={() => toggleSort(s.key)}
              className={`text-xs px-3 py-1.5 rounded-full border transition-all flex items-center gap-1 ${sortBy === s.key ? 'bg-primary text-primary-foreground border-primary' : 'bg-secondary border-border text-muted-foreground'}`}
            >
              {s.label}
              {sortBy === s.key && (sortDir === 'desc' ? <ArrowDown className="w-3 h-3" /> : <ArrowUp className="w-3 h-3" />)}
            </button>
          ))}
        </div>
      </div>

      {sorted.length === 0 ? (
        <div className="bg-card border border-dashed border-border rounded-2xl p-6 text-center">
          <p className="text-sm text-muted-foreground">No transactions match your filters.</p>
        </div>
      ) : (
        // One card holding the rows, rather than a stack of floating cards:
        // the eye follows a single edge down the list instead of
        // re-finding it on every row.
        <div className="sky-card rounded-2xl overflow-hidden">
          {sortBy === 'date' ? (
            grouped.map(([date, txs]) => (
              <div key={date}>
                <div className="px-4 py-2 bg-secondary/40 border-y border-border/50 first:border-t-0">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {dateHeading(date)}
                  </p>
                </div>
                <div className="divide-y divide-border/50">
                  {txs.map(tx => <TransactionRow key={tx.id} tx={tx} showDate={false} selected={selectedIds.has(tx.id)} {...rowProps} />)}
                </div>
              </div>
            ))
          ) : (
            <div className="divide-y divide-border/50">
              {visibleFlat.map(tx => <TransactionRow key={tx.id} tx={tx} showDate selected={selectedIds.has(tx.id)} {...rowProps} />)}
            </div>
          )}
          {visibleCount < sorted.length && (
            <div className="p-3 border-t border-border/50">
              <Button
                variant="outline"
                className="w-full text-sm"
                onClick={() => setVisibleCount(c => c + 60)}
              >
                Load more ({sorted.length - visibleCount} left)
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Finance Page ────────────────────────────────────────────────────────
export default function Finance() {
  const { runGuarded: guardDelete, isDeleting } = useDeleteLock();
  const navigate = useNavigate();
  const [transactions, setTransactions] = useState([]);
  const [budgets, setBudgets] = useState([]);
  const [netWorth, setNetWorth] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showTxForm, setShowTxForm] = useState(false);
  useAutoOpenForm(() => setShowTxForm(true));
  const [showNWForm, setShowNWForm] = useState(false);
  const [summaryPeriod, setSummaryPeriod] = useState('month'); // 'biweekly' | 'month' | 'year-YYYY'

  const [nwForm, setNwForm] = useState({ name: '', type: 'asset', value: '', category: 'cash' });

  // showSkeleton only on the initial load — refreshes after a save/delete or
  // pull-to-refresh update in place instead of flashing the full-page skeleton.
  const loadData = async (showSkeleton = false) => {
    if (showSkeleton) setLoading(true);
    const timeout = setTimeout(() => setLoading(false), 5000);
    try {
      const [tx, b, nw, accts] = await Promise.all([
        base44.entities.Transaction.list('-date', 50000),
        base44.entities.Budget.list(),
        base44.entities.NetWorthEntry.list(),
        base44.entities.ConnectedAccount.list('-created_date', 50).catch(() => []),
      ]);
      clearTimeout(timeout);
      setTransactions(tx); setBudgets(b); setNetWorth(nw); setAccounts(accts || []);
    } catch (error) {
      toast({ title: "Couldn't load your data", description: "Please try again in a moment.", variant: 'destructive' });
    } finally {
      clearTimeout(timeout);
      setLoading(false);
    }
  };

  useEffect(() => { loadData(true); }, []);

  const { pullY, refreshing, threshold } = usePullToRefresh(loadData);

  // ── Optimistic add ──────────────────────────────────────────────────────────
  const saveTx = async (txData) => {
    const optimistic = { ...txData, id: `temp-${Date.now()}` };
    setTransactions(prev => [optimistic, ...prev]);
    try {
      await base44.entities.Transaction.create(txData);
      toast({ title: 'Transaction added', description: `$${txData.amount} · ${txData.category}` });
      loadData(); // replace temp with real record
    } catch (error) {
      setTransactions(prev => prev.filter(t => t.id !== optimistic.id));
      toast({ title: "Couldn't save transaction", description: "Please try again in a moment.", variant: 'destructive' });
      throw error; // re-throw so the sheet stays open for retry
    }
  };

  // ── Optimistic note edit ────────────────────────────────────────────────────
  const updateTxNotes = async (id, notes) => {
    const existing = transactions.find(t => t.id === id);
    setTransactions(prev => prev.map(t => (t.id === id ? { ...t, notes } : t)));
    try {
      await base44.entities.Transaction.update(id, { notes });
    } catch (error) {
      setTransactions(prev => prev.map(t => (t.id === id ? { ...t, notes: existing?.notes } : t)));
      toast({ title: "Couldn't save note", description: "Please try again in a moment.", variant: 'destructive' });
      throw error; // re-throw so the row's editor stays open for retry
    }
  };

  // ── Optimistic delete ───────────────────────────────────────────────────────
  // Guarded — see useDeleteLock. Optimistic removal plus rollback means a
  // double-tap can resurrect a row the first delete legitimately removed.
  const deleteTx = (id) => guardDelete(id, async () => {
    const existing = transactions.find(t => t.id === id);
    setTransactions(prev => prev.filter(t => t.id !== id));
    try {
      await base44.entities.Transaction.delete(id);
      toast({ title: 'Transaction deleted' });
    } catch (error) {
      if (existing) setTransactions(prev => [existing, ...prev]);
      toast({ title: "Couldn't delete transaction", description: "Please try again in a moment.", variant: 'destructive' });
    }
  });

  const [nwSaving, setNwSaving] = useState(false);
  const saveNW = async () => {
    if (!nwForm.name || !nwForm.value) return;
    setNwSaving(true);
    try {
      await base44.entities.NetWorthEntry.create({ ...nwForm, value: parseFloat(nwForm.value) });
      setShowNWForm(false);
      setNwForm({ name: '', type: 'asset', value: '', category: 'cash' });
      toast({ title: 'Entry added' });
      await loadData();
    } catch (err) {
      toast({ title: "Couldn't save entry", description: "Please try again in a moment.", variant: 'destructive' });
    } finally {
      setNwSaving(false);
    }
  };

  const deleteNW = (id) => guardDelete(id, async () => {
    const existing = netWorth.find(n => n.id === id);
    if (!window.confirm(`Delete ${existing?.name || 'this entry'}?`)) return;
    setNetWorth(prev => prev.filter(n => n.id !== id));
    try {
      await base44.entities.NetWorthEntry.delete(id);
      toast({ title: 'Entry deleted' });
    } catch (error) {
      if (existing) setNetWorth(prev => [existing, ...prev]);
      toast({ title: "Couldn't delete entry", description: "Please try again in a moment.", variant: 'destructive' });
    }
  });

  // Anchored to the latest transaction on record, not the literal calendar
  // date — someone who just bulk-imported statements that stop in a past
  // month/year (a new user, or a fresh CSV/PDF import) would otherwise see
  // "This Month"/"This Year" come back empty against literal today, while
  // Weekly (already anchored below) correctly showed real data — exactly
  // the "week looks right, month looks wrong" bug.
  const latestTxDate = useMemo(() => {
    let latest = null;
    for (const t of transactions) {
      if (t.date && (!latest || t.date > latest)) latest = t.date;
    }
    return latest ? parseISO(latest) : new Date();
  }, [transactions]);
  const thisMonth = format(latestTxDate, 'yyyy-MM');
  const thisYearNum = latestTxDate.getFullYear();
  const thisYear = String(thisYearNum);
  const lastMonthStr = format(subMonths(new Date(), 1), 'yyyy-MM');

  const monthTx = transactions.filter(t => t.date?.startsWith(thisMonth));
  const lastMonthTx = transactions.filter(t => t.date?.startsWith(lastMonthStr));
  const monthExpenses = monthTx.filter(t => t.type === 'expense').reduce((s, t) => s + (t.amount || 0), 0);
  const monthIncome = monthTx.filter(t => t.type === 'income').reduce((s, t) => s + (t.amount || 0), 0);
  const lastMonthExpenses = lastMonthTx.filter(t => t.type === 'expense').reduce((s, t) => s + (t.amount || 0), 0);
  // Live bank balances + manual entries, with the label deciding itself.
  const worth = composeNetWorth(accounts, netWorth);
  const totalAssets = netWorth.filter(n => n.type === 'asset').reduce((s, n) => s + (n.value || 0), 0);
  const totalLiabilities = netWorth.filter(n => n.type === 'liability').reduce((s, n) => s + (n.value || 0), 0);
  const netSaved = monthIncome - monthExpenses;
  // >= 1 not > 0: a fraction-of-a-cent "income" row shouldn't blow this up
  // into a five-figure percentage.

  // Summary row: trailing windows from shortest to longest, plus a whole
  // calendar year (this year and the 2 before it) — the rest of the page
  // (transaction list, spending chart) stays month-scoped, since that's
  // what "Spending" and "Net Worth" tabs are already built around.
  //
  // "Monthly" here means trailing 30 days, NOT the calendar month — every
  // chip in this row anchors to the same latestTxDate and covers strictly
  // more days than the one before it (7 / 14 / 30 / 90 / 180). Calendar
  // "this month" was used here originally, which made Monthly show LESS
  // than Bi-Weekly for the first few days of any new month (a real
  // reported bug: Bi-Weekly $1,067 spent, Monthly only $115 — technically
  // correct math, but a longer-labeled window showing less data than a
  // shorter one reads as broken). Home's hero keeps the calendar-month
  // definition on purpose (that's the one place "this month" should mean
  // the actual month); this row is a pure trailing-window comparison tool,
  // so every step should nest inside the next.
  // Labels come from the shared vocabulary so this row cannot drift from the
  // Dashboard's again - "Monthly" here versus "Month" there versus "1M" on
  // the chart below it was three spellings of one span on adjacent screens.
  const PERIOD_OPTIONS = [
    { key: 'weekly', label: rangeLabel('weekly') },
    { key: 'biweekly', label: rangeLabel('biweekly') },
    { key: 'month', label: rangeLabel('month') },
    { key: '3month', label: rangeLabel('3month') },
    { key: '6month', label: rangeLabel('6month') },
  ];
  // Only years that actually contain transactions — the trailing-4-years
  // list always offered 2023/2024 even for an account whose real data only
  // spans 2025-2026, and picking one of those showed a flat empty summary
  // that read as broken rather than as "you have nothing from then."
  const YEAR_OPTIONS = [...new Set(transactions.map(t => t.date?.slice(0, 4)).filter(Boolean))]
    .map(Number).sort((a, b) => b - a)
    .map(y => ({ value: `year-${y}`, label: `${y}` }));
  const isYearPeriod = summaryPeriod.startsWith('year-');
  const TRAILING_DAYS = { weekly: 6, biweekly: 13, month: 29, '3month': 89, '6month': 179 };
  const summaryTx = useMemo(() => {
    if (TRAILING_DAYS[summaryPeriod] != null) {
      const cutoff = startOfDay(subDays(latestTxDate, TRAILING_DAYS[summaryPeriod]));
      return transactions.filter(t => t.date && parseISO(t.date) >= cutoff);
    }
    if (summaryPeriod.startsWith('year-')) {
      const y = summaryPeriod.slice(5);
      return transactions.filter(t => t.date?.startsWith(y));
    }
    return monthTx;
  }, [summaryPeriod, transactions, monthTx, latestTxDate]);
  const summaryIncome = summaryTx.filter(t => t.type === 'income').reduce((s, t) => s + (t.amount || 0), 0);
  const summaryExpenses = summaryTx.filter(t => t.type === 'expense').reduce((s, t) => s + (t.amount || 0), 0);
  const summaryNetSaved = summaryIncome - summaryExpenses;
  // >= 1 not > 0: a fraction-of-a-cent "income" row shouldn't blow this up
  // into a five-figure percentage.
  const summarySavingsRate = summaryIncome >= 1 ? Math.round((summaryNetSaved / summaryIncome) * 100) : 0;

  const catData = EXPENSE_CATS.map(cat => ({
    name: cat,
    spent: monthTx.filter(t => t.type === 'expense' && t.category === cat).reduce((s, t) => s + (t.amount || 0), 0),
    budget: budgets.find(b => b.category === cat && b.month === thisMonth)?.monthly_limit || 0,
  })).filter(d => d.spent > 0);

  if (loading) {
    return (
      <div className="py-4">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 rounded-2xl bg-secondary animate-pulse" />
          <div className="space-y-2 flex-1">
            <div className="w-20 h-4 rounded bg-secondary animate-pulse" />
            <div className="w-36 h-3 rounded bg-secondary animate-pulse" />
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
          {[1,2,3,4].map(i => <div key={i} className="h-20 rounded-2xl bg-secondary animate-pulse" />)}
        </div>
        <div className="h-28 rounded-2xl bg-secondary animate-pulse mb-3" />
        <div className="h-28 rounded-2xl bg-secondary animate-pulse" />
      </div>
    );
  }

  return (
    <div className="py-4 pb-8">
      <PullToRefreshIndicator pullY={pullY} refreshing={refreshing} threshold={threshold} />

      {/* Header */}
      <PageHeader
        title="Money"
        // Was a hardcoded "September 2026" no matter which period pill below
        // was selected — Monthly here is a rolling 30 days, not the
        // calendar month, so that label actively claimed the wrong window.
        // A neutral subtitle can't go stale or contradict the pills.
        subtitle="Every transaction, all in one place"
        icon={DollarSign}
        gradient="gradient-primary"
        action={
          <>
            <Button variant="ghost" size="icon" onClick={() => navigate('/spending-summary')} className="h-8 w-8 text-primary" title="Spending Summary" aria-label="Spending Summary">
              <BarChart3 className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => navigate('/bills')} className="h-8 w-8 text-muted-foreground" title="Bills" aria-label="Bills">
              <Receipt className="w-4 h-4" />
            </Button>
            {FEATURES.bankSync && (
              <Button variant="ghost" size="icon" onClick={() => navigate('/bank-sync')} className="h-8 w-8 text-blue-600" title="Connect Bank" aria-label="Connect Bank">
                <Link2 className="w-4 h-4" />
              </Button>
            )}
            <Button variant="ghost" size="icon" onClick={() => navigate('/csv-import')} className="h-8 w-8 text-amber-600" title="Import CSV" aria-label="Import CSV">
              <Upload className="w-4 h-4" />
            </Button>
            <Button onClick={() => setShowTxForm(true)} className="bg-primary hover:bg-primary/90 text-primary-foreground border-0 gap-1 shrink-0 h-8 px-3 text-sm rounded-xl">
              <Plus className="w-3.5 h-3.5" /> Add
            </Button>
          </>
        }
      />

      {/* Summary — 2-col on mobile, 4-col on sm+ */}
      <div className="flex items-center gap-1.5 mb-3 overflow-x-auto pb-1">
        {PERIOD_OPTIONS.map(p => (
          <button
            key={p.key}
            onClick={() => setSummaryPeriod(p.key)}
            className={`shrink-0 text-xs font-semibold px-3 py-1.5 rounded-full border transition-all ${summaryPeriod === p.key ? 'bg-primary text-primary-foreground border-primary' : 'bg-secondary border-border text-muted-foreground'}`}
          >
            {p.label}
          </button>
        ))}
        {/* "Yearly" sits inline with the other three, same pill styling —
            it's a real <select> underneath (opens the native picker on
            mobile), just skinned to match instead of looking like a
            separate control shoved off to the side. */}
        <div className="relative shrink-0">
          <select
            value={isYearPeriod ? summaryPeriod : ''}
            onChange={e => setSummaryPeriod(e.target.value)}
            className={`appearance-none text-xs font-semibold pl-3 pr-6 py-1.5 rounded-full border transition-all cursor-pointer ${isYearPeriod ? 'bg-primary text-primary-foreground border-primary' : 'bg-secondary border-border text-muted-foreground'}`}
            style={{ WebkitTapHighlightColor: 'transparent' }}
          >
            {/* Explicit colors on the options themselves — the native dropdown
                popup is opaque and browser-styled, so it ignores the <select>'s
                own Tailwind text color and was rendering invisible white-on-white. */}
            <option value="" disabled style={{ background: 'hsl(var(--popover))', color: 'hsl(var(--popover-foreground))' }}>Yearly</option>
            {YEAR_OPTIONS.map(y => (
              <option key={y.value} value={y.value} style={{ background: 'hsl(var(--popover))', color: 'hsl(var(--popover-foreground))' }}>{y.label}</option>
            ))}
          </select>
          <ChevronDown className={`absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 pointer-events-none ${isYearPeriod ? 'text-primary-foreground' : 'text-muted-foreground'}`} />
        </div>
        <Link to="/spending-summary" className="shrink-0 ml-1 text-xs text-primary font-semibold flex items-center gap-0.5">
          Older <ChevronRight className="w-3 h-3" />
        </Link>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <StatCard label="Income" value={summaryIncome} prefix="$" tone="positive" icon={TrendingUp} />
        <StatCard label="Spending" value={summaryExpenses} prefix="$" tone="negative" icon={TrendingDown} />
        <StatCard label="Net saved" value={summaryNetSaved} prefix="$" tone={summaryNetSaved >= 0 ? 'default' : 'negative'} icon={PiggyBank} />
        <StatCard label="Savings rate" value={summarySavingsRate} suffix="%" tone={summarySavingsRate >= 20 ? 'positive' : 'warning'} icon={Percent} />
      </div>

      {/* Add Transaction Bottom Sheet */}
      <AddTransactionSheet
        open={showTxForm}
        onClose={() => setShowTxForm(false)}
        onSave={saveTx}
      />

      <Tabs defaultValue="transactions">
        <TabsList className="mb-5 w-full grid grid-cols-3 text-xs">
          <TabsTrigger value="transactions">Transactions</TabsTrigger>
          <TabsTrigger value="overview">Spending</TabsTrigger>
          <TabsTrigger value="networth">Net Worth</TabsTrigger>
        </TabsList>

        {/* TRANSACTIONS TAB */}
        <TabsContent value="transactions">
          <TransactionList transactions={transactions} onDelete={deleteTx} onAdd={() => setShowTxForm(true)} onUpdateNote={updateTxNotes} />
        </TabsContent>

        {/* OVERVIEW / SPENDING TAB */}
        <TabsContent value="overview">
          <IncomeExpenseTrendChart transactions={transactions} simple={getSimpleMode()} />
          {catData.length > 0 ? (
            <>
              <SpendingByCategoryChart catData={catData} totalExpenses={monthExpenses} />

              {monthIncome > 0 && (
                <div className="sky-card rounded-2xl p-4 mb-4">
                  <p className="font-bold text-sm mb-3">Money Snapshot</p>
                  <div className="space-y-2.5">
                    {[
                      { label: 'Income', value: monthIncome, color: 'bg-emerald-500', textColor: 'text-emerald-500', pct: 100 },
                      { label: 'Spending', value: monthExpenses, color: 'bg-red-500', textColor: 'text-red-500', pct: Math.min(100, (monthExpenses / monthIncome) * 100) },
                      ...(netSaved > 0 ? [{ label: 'Net Saved', value: netSaved, color: 'bg-blue-500', textColor: 'text-blue-500', pct: Math.min(100, (netSaved / monthIncome) * 100) }] : []),
                    ].map(({ label, value, color, textColor, pct }) => (
                      <div key={label} className="flex items-center gap-3">
                        <span className={`text-xs font-medium w-20 shrink-0 ${textColor}`}>{label}</span>
                        <div className="flex-1 h-2.5 bg-secondary rounded-full overflow-hidden">
                          <div className={`h-full ${color} rounded-full`} style={{ width: `${pct}%` }} />
                        </div>
                        <span className={`text-xs font-bold w-16 text-right shrink-0 ${textColor}`}>${fmt(value)}</span>
                      </div>
                    ))}
                  </div>
                  {lastMonthExpenses > 0 && (
                    <p className={`text-xs mt-3 ${monthExpenses > lastMonthExpenses ? 'text-amber-600' : 'text-emerald-600'}`}>
                      {monthExpenses > lastMonthExpenses
                        ? `⚠️ Spending up ${Math.round(((monthExpenses - lastMonthExpenses) / lastMonthExpenses) * 100)}% vs last month`
                        : `✅ Spending down ${Math.round(((lastMonthExpenses - monthExpenses) / lastMonthExpenses) * 100)}% vs last month`}
                    </p>
                  )}
                </div>
              )}
            </>
          ) : (
            <div className="sky-card border border-dashed border-blue-200 rounded-2xl p-8 text-center mb-4">
              <DollarSign className="w-10 h-10 text-primary/30 mx-auto mb-3" />
              <p className="text-sm font-semibold mb-1">No spending data yet</p>
              <p className="text-xs text-muted-foreground mb-4">Add a few transactions to see your spending breakdown.</p>
              <Button size="sm" onClick={() => setShowTxForm(true)} className="gap-1 bg-primary text-white shadow-sm shadow-primary/20">
                <Plus className="w-3.5 h-3.5" /> Add Transaction
              </Button>
            </div>
          )}
        </TabsContent>

        {/* NET WORTH TAB */}
        <TabsContent value="networth">
          {/* The headline names itself honestly: "Cash on Hand" while only
              bank accounts are known, becoming "Net Worth" once the user has
              added something outside the bank. Calling connected checking
              and savings a net worth, with crypto and a car missing, is a
              confidently wrong number on the screen people trust most. */}
          <div className="sky-card rounded-2xl p-4 mb-4">
            <div className="flex items-center justify-between mb-1">
              <div>
                <p className="text-sm font-bold">{worth.label}</p>
                <p className="text-[11px] text-muted-foreground">{worth.sublabel}</p>
              </div>
              <Button onClick={() => setShowNWForm(true)} variant="outline" size="sm" className="h-8 text-xs gap-1">
                <Plus className="w-3 h-3" /> Add Entry
              </Button>
            </div>
            <p className={`text-2xl font-black ${worth.total >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
              ${fmt(worth.total)}
            </p>

            {/* Live bank money, separated from anything hand-entered. */}
            {worth.cash.liveCount > 0 && (
              <div className="mt-3 pt-3 border-t border-border/60 space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    From your banks
                  </span>
                  <span className="font-bold tabular-nums">${fmt(worth.cash.net)}</span>
                </div>
                {worth.cash.updatedAt && (
                  <p className="text-[10px] text-muted-foreground">
                    Updated {freshnessLabel(worth.cash.updatedAt)}
                  </p>
                )}
              </div>
            )}

            {/* A balance we have never captured is UNKNOWN, not zero.
                Silently treating it as $0 understates cash and reads to the
                user as money having vanished. */}
            {worth.cash.unknownCount > 0 && (
              <p className="mt-2 text-[11px] text-amber-600 dark:text-amber-500">
                {worth.cash.unknownCount} account{worth.cash.unknownCount === 1 ? '' : 's'} not included yet
                ({worth.cash.unknownNames.join(', ')}) — refresh it on Bank Sync to pull the balance.
              </p>
            )}

            {worth.manual.count > 0 && (
              <div className="mt-2 flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50" />
                  Added by you
                </span>
                <span className="font-bold tabular-nums">${fmt(worth.manual.net)}</span>
              </div>
            )}

            {/* Nudge, not nag: only when something is actually months old. */}
            {worth.manual.staleCount > 0 && (
              <p className="mt-2 text-[11px] text-amber-600 dark:text-amber-500">
                {worth.manual.staleCount === 1
                  ? `${worth.manual.staleNames[0]} hasn't been updated in months — still accurate?`
                  : `${worth.manual.staleCount} entries haven't been updated in months — still accurate?`}
              </p>
            )}

            {!worth.isCompleteNetWorth && (
              <p className="mt-3 text-[11px] text-muted-foreground leading-relaxed">
                This is money in your connected bank accounts. Add a car, crypto,
                or a loan to turn it into a real net worth.
              </p>
            )}
          </div>

          <NetWorthHistoryChart entries={netWorth} />

          {showNWForm && (
            <div className="sky-card rounded-2xl p-5 mb-4">
              <div className="flex items-center justify-between mb-3">
                <p className="font-semibold text-sm">Add Entry</p>
                <button onClick={() => setShowNWForm(false)} aria-label="Close" className="p-2.5 -m-1 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg hover:bg-secondary active:bg-secondary/70 transition-colors"><X className="w-5 h-5 text-muted-foreground" /></button>
              </div>
              <div className="space-y-3">
                <Input placeholder="Name (e.g. Savings Account)" value={nwForm.name} onChange={e => setNwForm(f => ({ ...f, name: e.target.value }))} />
                <Input type="number" placeholder="Value ($)" value={nwForm.value} onChange={e => setNwForm(f => ({ ...f, value: e.target.value }))} />
                <div className="grid grid-cols-2 gap-3">
                  <MobileSelect
                    value={nwForm.type}
                    onValueChange={v => setNwForm(f => ({ ...f, type: v }))}
                    options={NW_TYPE_OPTIONS}
                  />
                  <MobileSelect
                    value={nwForm.category}
                    onValueChange={v => setNwForm(f => ({ ...f, category: v }))}
                    options={NW_CAT_OPTIONS}
                  />
                </div>
              </div>
              <div className="flex gap-2 mt-3">
                <Button variant="outline" onClick={() => setShowNWForm(false)} className="flex-1">Cancel</Button>
                <Button onClick={saveNW} disabled={!nwForm.name || !nwForm.value || nwSaving} className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground border-0">
                  {nwSaving ? 'Saving…' : 'Save'}
                </Button>
              </div>
            </div>
          )}

          <div className="grid sm:grid-cols-2 gap-4">
            {[
              { type: 'asset', label: 'Assets', total: totalAssets, color: 'text-emerald-600', emptyMsg: 'No assets added yet' },
              { type: 'liability', label: 'Liabilities', total: totalLiabilities, color: 'text-red-500', emptyMsg: 'No liabilities added yet' },
            ].map(({ type, label, total, color, emptyMsg }) => (
              <div key={type}>
                <h4 className={`font-bold text-sm ${color} mb-3`}>{label} · ${fmt(total)}</h4>
                <div className="space-y-2">
                  {netWorth.filter(n => n.type === type).map(n => (
                    <div key={n.id} className="sky-card rounded-xl p-3 flex items-center gap-3">
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 text-base ${type === 'asset' ? 'bg-emerald-500/10' : 'bg-red-500/10'}`}>
                        {NW_CAT_ICONS[n.category] || '💼'}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold truncate">{n.name}</p>
                        <p className="text-xs text-muted-foreground capitalize truncate">{(n.category || '').replace(/_/g, ' ')}</p>
                      </div>
                      <span className={`font-bold text-sm shrink-0 tabular-nums ${color}`}>{type === 'liability' ? '-' : ''}${fmt(n.value)}</span>
                      <button
                        onClick={() => deleteNW(n.id)}
                        className="p-2 -m-1 -mr-2 rounded-lg text-muted-foreground/50 hover:text-destructive hover:bg-secondary transition-colors shrink-0"
                        title="Delete entry"
                        aria-label={`Delete ${n.name}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                  {netWorth.filter(n => n.type === type).length === 0 && (
                    <div className="bg-card border border-dashed border-border rounded-xl p-4 text-center">
                      <p className="text-xs text-muted-foreground">{emptyMsg}</p>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}