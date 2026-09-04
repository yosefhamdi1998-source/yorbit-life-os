import { useState } from 'react';
import { Plus, DollarSign, Target, Receipt, PiggyBank, Upload } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';

// `?add=1` is read by useAutoOpenForm on the destination page, so these land
// with the create form already open instead of dropping the user on a list
// and making them find the Add button.
// Ordered by how often someone actually reaches for them, and each says
// what it's for — "New Goal" alone doesn't tell a first-time user whether
// that means a savings target or a to-do.
const ACTIONS = [
  { icon: DollarSign, label: 'Add Transaction', hint: 'Log money in or out', path: '/finance?add=1', color: '#10b981' },
  { icon: Upload, label: 'Upload Statement', hint: 'Import a CSV or PDF', path: '/csv-import', color: '#0ea5e9' },
  { icon: Receipt, label: 'Add Bill', hint: 'Track something due', path: '/bills?add=1', color: '#f59e0b' },
  { icon: PiggyBank, label: 'Set Budget', hint: 'Cap a category', path: '/budget?add=1', color: '#3b82f6' },
  { icon: Target, label: 'New Goal', hint: 'Save toward something', path: '/goals?add=1', color: '#a855f7' },
];

// Pages where FAB should NOT appear
const HIDDEN_PATHS = ['/onboarding', '/upgrade', '/settings', '/privacy-policy', '/terms-of-use', '/csv-import'];

export default function QuickAddFAB() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  if (HIDDEN_PATHS.some(p => location.pathname.startsWith(p))) return null;

  const handleAction = (path) => {
    setOpen(false);
    navigate(path);
  };

  return (
    <>
      {/* Backdrop */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-black/20 backdrop-blur-[2px] lg:hidden"
            onClick={() => setOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* Action items */}
      <div className="fixed bottom-[84px] right-4 z-50 flex flex-col items-end gap-2.5 lg:hidden" style={{ pointerEvents: open ? 'auto' : 'none' }}>
        <AnimatePresence>
          {/* Themed surfaces, not hardcoded white — these were bright white
              pills floating over a near-black app. Reversed stagger so the
              row nearest your thumb appears first. */}
          {open && ACTIONS.map(({ icon: Icon, label, hint, path, color }, i) => (
            <motion.button
              key={label}
              initial={{ opacity: 0, scale: 0.85, x: 12 }}
              animate={{ opacity: 1, scale: 1, x: 0 }}
              exit={{ opacity: 0, scale: 0.85, x: 12 }}
              transition={{ delay: (ACTIONS.length - 1 - i) * 0.035, duration: 0.16, ease: [0.25, 0.46, 0.45, 0.94] }}
              onClick={() => handleAction(path)}
              // `whitespace-nowrap` on labels below used to force this
              // button as wide as its longest line demanded, with nothing
              // stopping that from exceeding the viewport — fine at 390px+,
              // but "Add Transaction" / "Upload Statement" ran off the
              // right edge, unreadable, on a 375px-wide phone (iPhone
              // SE/mini and still common). max-w caps it to the viewport
              // with room for the right-4 inset either side; text wraps to
              // a second line on the rare screen where it's actually needed
              // instead of silently overflowing.
              className="flex items-center gap-3 rounded-2xl pl-4 pr-2.5 py-2.5 shadow-xl active:scale-[0.97] transition-transform border border-border bg-card max-w-[calc(100vw-32px)]"
            >
              <div className="text-right min-w-0">
                <p className="text-sm font-bold text-foreground leading-tight">{label}</p>
                <p className="text-[11px] text-muted-foreground leading-tight mt-0.5">{hint}</p>
              </div>
              <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: color }}>
                <Icon className="w-4 h-4 text-white" strokeWidth={2.4} />
              </div>
            </motion.button>
          ))}
        </AnimatePresence>

        {/* FAB button */}
        <motion.button
          whileTap={{ scale: 0.92 }}
          onClick={() => setOpen(o => !o)}
          aria-label={open ? 'Close quick actions' : 'Open quick actions'}
          aria-expanded={open}
          className="w-14 h-14 rounded-full shadow-lg flex items-center justify-center transition-all active:scale-95"
          // Neutral shadow — the old one was a hardcoded blue glow from
          // before the theme changed, which read as a stray blue halo
          // under the gold button.
          style={{ pointerEvents: 'auto', background: 'linear-gradient(135deg, var(--hero-from) 0%, var(--hero-to) 100%)', boxShadow: '0 6px 20px rgba(0,0,0,0.45)' }}
        >
          <motion.div animate={{ rotate: open ? 45 : 0 }} transition={{ duration: 0.2 }}>
            <Plus className="w-5 h-5 text-white" strokeWidth={2.5} />
          </motion.div>
        </motion.button>
      </div>
    </>
  );
}