import { useState, useEffect } from 'react';
import { X, Plus, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MobileSelect } from '@/components/ui/mobile-select';
import { format } from 'date-fns';

const CAT_ICONS = { housing: '🏠', food: '🍔', transport: '🚗', entertainment: '🎬', health: '💊', shopping: '🛍️', education: '📚', savings: '💰', salary: '💵', freelance: '💻', investment: '📈', other: '💸' };
const CATEGORIES = ['housing', 'food', 'transport', 'entertainment', 'health', 'shopping', 'education', 'other'];

const OPTIONS = CATEGORIES.map(c => ({
  value: c,
  label: `${CAT_ICONS[c] || ''} ${c.charAt(0).toUpperCase() + c.slice(1)}`,
}));

const DEFAULTS = () => ({ amount: '', category: 'food' });

export default function QuickAddTransactionSheet({ open, onClose, onSave }) {
  const [form, setForm] = useState(DEFAULTS());
  const [saving, setSaving] = useState(false);

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

  useEffect(() => {
    if (open) setForm(DEFAULTS());
  }, [open]);

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

  const handleSave = async () => {
    if (!form.amount) return;
    setSaving(true);
    try {
      const label = form.category.charAt(0).toUpperCase() + form.category.slice(1);
      await onSave({
        title: label,
        amount: parseFloat(form.amount),
        type: 'expense',
        category: form.category,
        date: format(new Date(), 'yyyy-MM-dd'),
      });
      onClose();
    } catch {
      // Parent already shows the error toast
    } finally {
      setSaving(false);
    }
  };

  if (!mounted) return null;

  return (
    <>
      <div
        className={`fixed inset-0 bg-black/40 z-40 transition-opacity duration-200 ${shown ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={onClose}
      />

      <div
        className={`fixed bottom-0 left-0 right-0 z-50 bg-card rounded-t-3xl shadow-2xl transition-transform duration-300 ease-out ${shown ? 'translate-y-0' : 'translate-y-full pointer-events-none'}`}
            style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
          >
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full bg-border" />
            </div>

            <div className="px-5 pb-6">
              <div className="flex items-center justify-between mb-5 pt-1">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl gradient-primary flex items-center justify-center">
                    <Zap className="w-4 h-4 text-white" />
                  </div>
                  <div>
                    <h3 className="text-base font-black leading-none">Quick Add</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">Fast expense entry</p>
                  </div>
                </div>
                <button onClick={onClose} aria-label="Close" className="w-11 h-11 rounded-full bg-secondary flex items-center justify-center active:scale-95 transition-transform shrink-0">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-3">
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-lg font-bold text-muted-foreground">$</span>
                  <Input
                    type="number"
                    placeholder="0.00"
                    value={form.amount}
                    onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                    min="0"
                    inputMode="decimal"
                    autoFocus
                    className="h-14 text-2xl font-black pl-10"
                  />
                </div>
                <MobileSelect
                  value={form.category}
                  onValueChange={v => setForm(f => ({ ...f, category: v }))}
                  options={OPTIONS}
                />
              </div>

              <Button
                onClick={handleSave}
                disabled={!form.amount || saving}
                className="w-full h-12 mt-4 text-white gap-1.5 bg-primary hover:bg-primary/90"
              >
                {saving ? 'Saving…' : <><Plus className="w-4 h-4" /> Add</>}
              </Button>
            </div>
      </div>
    </>
  );
}