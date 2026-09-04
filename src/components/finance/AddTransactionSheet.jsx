import { useState, useEffect } from 'react';
import { X, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MobileSelect } from '@/components/ui/mobile-select';
import { format } from 'date-fns';
import useSubmitLock from '@/hooks/useSubmitLock';
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES } from '@/lib/enums';

// From the single source of truth — `npm run check:enums` verifies both
// are valid subsets of transactions_category_check.
const EXPENSE_CATS = EXPENSE_CATEGORIES;
const INCOME_CATS = INCOME_CATEGORIES;
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

// Mirrors the database's own CHECK constraints on transactions
// (amount > 0 AND amount <= 10000000, char_length(title) <= 200).
// Without these the button stayed enabled for a negative, zero, or
// absurd amount, the insert was rejected server-side, and the user got
// "Couldn't save transaction. Please try again in a moment." — advice
// that is actively wrong, since trying again with the same input fails
// forever and nothing said which field was the problem.
const MAX_AMOUNT = 10000000;
const MAX_TITLE = 200;

function validate(form) {
  const amount = parseFloat(form.amount);
  if (!form.amount || Number.isNaN(amount)) return 'Enter an amount.';
  if (amount <= 0) return 'Amount has to be more than $0.';
  if (amount > MAX_AMOUNT) return `Amount has to be $${MAX_AMOUNT.toLocaleString()} or less.`;
  if ((form.title || '').length > MAX_TITLE) return `Description has to be ${MAX_TITLE} characters or fewer.`;
  return null;
}

export default function AddTransactionSheet({ open, onClose, onSave }) {
  const [form, setForm] = useState(DEFAULT_FORM());
  // Synchronous re-entry guard — `disabled={saving}` alone let a fast
  // triple-tap create three identical transactions (verified against the
  // database). See useSubmitLock for why state can't enforce this.
  const { saving, runGuarded } = useSubmitLock();
  const [error, setError] = useState('');

  // Mount/visibility are tracked explicitly and torn down on a timer rather
  // than relying on an exit animation to finish. An exit that never completes
  // used to leave the full-screen backdrop mounted and eating every tap,
  // which read as the whole app freezing.
  const [mounted, setMounted] = useState(open);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (open) {
      setMounted(true);
      const raf = requestAnimationFrame(() => setShown(true));
      return () => cancelAnimationFrame(raf);
    }
    setShown(false);
    const t = setTimeout(() => setMounted(false), 260);
    return () => clearTimeout(t);
  }, [open]);

  // Reset form when sheet opens
  useEffect(() => {
    if (open) { setForm(DEFAULT_FORM()); setError(''); }
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

  const handleSave = () => runGuarded(async () => {
    const problem = validate(form);
    if (problem) { setError(problem); return; }
    setError('');
    try {
      // Amount is the only thing worth insisting on. Requiring a description
      // too meant typing an amount, tapping Save and getting nothing, because
      // the button stayed disabled without saying why.
      const title = form.title.trim()
        || form.category.charAt(0).toUpperCase() + form.category.slice(1);
      await onSave({ ...form, title, amount: parseFloat(form.amount) });
      onClose();
    } catch {
      // Parent already shows the error toast
    }
  });

  if (!mounted) return null;

  return (
    <>
      <div
        className={`fixed inset-0 bg-black/40 z-40 transition-opacity duration-200 ${shown ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={onClose}
      />

      <div
        className={`fixed bottom-0 left-0 right-0 z-50 bg-card rounded-t-3xl shadow-2xl transition-transform duration-300 ease-out flex flex-col ${shown ? 'translate-y-0' : 'translate-y-full pointer-events-none'}`}
            // flex column + min-h-0 on the scrollable middle section (below)
            // is what makes that section shrink to exactly whatever space
            // header+footer don't use, automatically — no pixel math to get
            // wrong, no fixed subtraction that assumes a header height that
            // was never guaranteed.
            style={{ maxHeight: '92dvh', paddingBottom: 'env(safe-area-inset-bottom)' }}
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

            {/* Save/Cancel used to be the last thing inside this scroll area —
                correct in principle (they WERE reachable by scrolling), but
                relying on `92dvh` math to leave exactly enough room is
                fragile the moment a real phone's on-screen keyboard changes
                the visible viewport (dvh support for that is inconsistent
                across browsers, and this isn't something a desktop-browser
                automated test can fully reproduce). Pinning the actions as
                a sticky footer removes the whole "did I scroll far enough"
                question by construction — they're always in view, full
                stop, regardless of viewport quirks or how tall the form
                content gets. */}
            <div className="overflow-y-auto min-h-0 px-5" style={{ WebkitOverflowScrolling: 'touch', overscrollBehavior: 'contain' }}>

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
                  placeholder="Description (optional)"
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
              {/* Spacer so the last field never sits flush against the
                  sticky footer below. */}
              <div className="h-4" />
            </div>

            {/* Validation message sits with the actions, not buried up in
                the scroll area where it could be off-screen when Save is
                tapped. */}
            {error && (
              <div className="px-5 pt-2 shrink-0">
                <p className="text-xs font-semibold text-red-500">{error}</p>
              </div>
            )}

            {/* Actions — sticky, not scrolled-to. Outside the overflow-y-auto
                area entirely, same "always visible" treatment the header
                above already gets. */}
            <div className="flex gap-3 px-5 pt-3 pb-1 shrink-0 border-t border-border/50 bg-card">
              <Button
                variant="outline"
                onClick={onClose}
                className="flex-1 h-12"
              >
                Cancel
              </Button>
              <Button
                onClick={handleSave}
                disabled={!form.amount || saving}
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
    </>
  );
}