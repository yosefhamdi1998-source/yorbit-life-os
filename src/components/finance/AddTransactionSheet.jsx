import { useState, useEffect } from 'react';
import { X, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MobileSelect } from '@/components/ui/mobile-select';
import { format } from 'date-fns';
import useSubmitLock from '@/hooks/useSubmitLock';

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
  // Synchronous re-entry guard — `disabled={saving}` alone let a fast
  // triple-tap create three identical transactions (verified against the
  // database). See useSubmitLock for why state can't enforce this.
  const { saving, runGuarded } = useSubmitLock();

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

  const handleSave = () => runGuarded(async () => {
    if (!form.amount) return;
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