import { useState } from 'react';
import { Plus, DollarSign, Target, Receipt, PiggyBank } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';

// `?add=1` is read by useAutoOpenForm on the destination page, so these land
// with the create form already open instead of dropping the user on a list
// and making them find the Add button.
const ACTIONS = [
  { icon: DollarSign, label: 'Add Transaction', path: '/finance?add=1', color: '#10b981' },
  { icon: PiggyBank, label: 'Set Budget', path: '/budget?add=1', color: '#3b82f6' },
  { icon: Target, label: 'New Goal', path: '/goals?add=1', color: '#7c3aed' },
  { icon: Receipt, label: 'Add Bill', path: '/bills?add=1', color: '#f59e0b' },
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
          {open && ACTIONS.map(({ icon: Icon, label, path, color }, i) => (
            <motion.button
              key={label}
              initial={{ opacity: 0, scale: 0.6, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.6, y: 10 }}
              transition={{ delay: i * 0.04, duration: 0.15 }}
              onClick={() => handleAction(path)}
              className="flex items-center gap-2.5 rounded-full shadow-md active:scale-95 transition-transform"
              style={{ paddingLeft: 14, paddingRight: 10, paddingTop: 8, paddingBottom: 8, background: 'white', border: '1px solid rgba(0,0,0,0.10)' }}
            >
              <span className="text-sm font-semibold whitespace-nowrap" style={{ color: '#1e293b' }}>{label}</span>
              <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{ background: color }}>
                <Icon className="w-3.5 h-3.5 text-white" />
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
          className="w-12 h-12 rounded-full shadow-lg flex items-center justify-center transition-all active:scale-95"
          style={{ pointerEvents: 'auto', background: 'linear-gradient(135deg, var(--hero-from) 0%, var(--hero-to) 100%)', boxShadow: '0 4px 16px rgba(37,99,235,0.35)' }}
        >
          <motion.div animate={{ rotate: open ? 45 : 0 }} transition={{ duration: 0.2 }}>
            <Plus className="w-5 h-5 text-white" strokeWidth={2.5} />
          </motion.div>
        </motion.button>
      </div>
    </>
  );
}