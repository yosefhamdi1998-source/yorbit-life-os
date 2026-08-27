import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MobileSelect } from '@/components/ui/mobile-select';
import { format } from 'date-fns';

const EXPENSE_CATS = ['housing', 'food', 'transport', 'entertainment', 'health', 'shopping', 'education', 'other'];
const INCOME_CATS = ['salary', 'freelance', 'investment', 'other'];
const CAT_ICONS = { housing: '🏠', food: '🍔', transport: '🚗', entertainment: '🎬', health: '💊', shopping: '🛍️', education: '📚', savings: '💰', salary: '💵', freelance: '💻', investment: '📈', other: '💸' };

function getCatOptions(type) {
  return (type === 'income' ? INCOME_CATS : EXPENSE_CATS).map(c => ({
    value: c,
    label: `${CAT_ICONS[c] || ''} ${c.charAt(0).toUpperCase() + c.slice(1)}`,
  }));
}

const DEFAULT_FORM = () => ({
  title: '',
  amount: '',
  type: 'expense',
  category: 'food',
  date: format(new Date(), 'yyyy-MM-dd'),
  notes: '',
});

export default function AddTransactionSheet({ open, onClose, onSave }) {
  const [form, setForm] = useState(DEFAULT_FORM());
  const [saving, setSaving] = useState(false);

  // Reset form when sheet opens
  useEffect(() => {
    if (open) setForm(DEFAULT_FORM());
  }, [open]);

  // Lock body scroll when open — overflow hidden avoids iOS touch-event issues
  useEffect(() => {
    if (open) {
      document.documentElement.style.overflow = 'hidden';
    } else {
      document.documentElement.style.overflow = '';
    }
    return () => {
      document.documentElement.style.overflow = '';
    };
  }, [open]);

  const catOptions = getCatOptions(form.type);

  const handleTypeChange = (type) => {
    setForm(f => ({
      ...f,
      type,
      category: type === 'income' ? 'salary' : 'food',
    }));
  };

  const handleSave = async () => {
    if (!form.title.trim() || !form.amount) return;
    setSaving(true);
    try {
      await onSave({ ...form, amount: parseFloat(form.amount) });
      onClose();
    } catch {
      // Parent already shows the error toast
    } finally {
      setSaving(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            className="fixed inset-0 bg-black/40 z-40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />

          {/* Sheet */}
          <motion.div
            className="fixed bottom-0 left-0 right-0 z-50 bg-card rounded-t-3xl shadow-2xl"
            style={{ maxHeight: '92dvh', paddingBottom: 'env(safe-area-inset-bottom)' }}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 320 }}
          >
            {/* Handle */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full bg-border" />
            </div>

            {/* Header — outside scroll area so close button is always tappable */}
            <div className="flex items-center justify-between px-5 pt-2 pb-3 shrink-0">
              <div>
                <h3 className="text-lg font-black">New Transaction</h3>
                <p className="text-xs text-muted-foreground mt-0.5">Log income or an expense</p>
              </div>
              <button
                onClick={onClose}
                className="w-11 h-11 rounded-full bg-secondary flex items-center justify-center active:scale-95 transition-transform shrink-0"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="overflow-y-auto px-5 pb-6" style={{ maxHeight: 'calc(92dvh - 96px)', WebkitOverflowScrolling: 'touch', overscrollBehavior: 'contain' }}>

              {/* Type toggle */}
              <div className="flex rounded-xl overflow-hidden border border-border mb-4">
                {[
                  { value: 'expense', label: '💸 Expense' },
                  { value: 'income', label: '💵 Income' },
                ].map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => handleTypeChange(opt.value)}
                    className={`flex-1 py-3 text-sm font-bold transition-all ${
                      form.type === opt.value
                        ? opt.value === 'income'
                          ? 'bg-emerald-600 text-white'
                          : 'bg-foreground text-background'
                        : 'text-muted-foreground hover:bg-secondary'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              {/* Fields */}
              <div className="space-y-3">
                <Input
                  placeholder="Description (e.g. Grocery run)"
                  value={form.title}
                  onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  className="h-12 text-base"
                />
                <Input
                  type="number"
                  placeholder="Amount ($)"
                  value={form.amount}
                  onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                  min="0.01"
                  max="10000000"
                  inputMode="decimal"
                  className="h-12 text-base"
                />
                <MobileSelect
                  value={form.category}
                  onValueChange={v => setForm(f => ({ ...f, category: v }))}
                  options={catOptions}
                />
                <Input
                  type="date"
                  value={form.date}
                  onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                  className="h-12"
                />
                <Input
                  placeholder="Notes (optional)"
                  value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  className="h-12"
                />
              </div>

              {/* Actions */}
              <div className="flex gap-3 mt-5">
                <Button
                  variant="outline"
                  onClick={onClose}
                  className="flex-1 h-12"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleSave}
                  disabled={!form.title.trim() || !form.amount || saving}
                  className={`flex-1 h-12 text-white border-0 gap-1.5 ${
                    form.type === 'income'
                      ? 'bg-emerald-600 hover:bg-emerald-700'
                      : 'bg-primary hover:bg-primary/90'
                  }`}
                >
                  {saving ? 'Saving…' : <><Plus className="w-4 h-4" /> Save Transaction</>}
                </Button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}