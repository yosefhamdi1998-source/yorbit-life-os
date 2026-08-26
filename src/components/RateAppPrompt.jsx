import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Star, X } from 'lucide-react';
import { APP_STORE_URL } from '@/lib/appStoreConfig';

// Shows a native-feeling rate prompt after user hits a milestone
// Persists dismissed state so it never annoys twice
export default function RateAppPrompt({ transactionCount }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const dismissed = localStorage.getItem('rate_prompt_dismissed');
    const rated = localStorage.getItem('rate_prompt_rated');
    if (dismissed || rated) return;
    // Trigger after 25th transaction logged — don't be annoying early on
    if (transactionCount >= 25) {
      const timer = setTimeout(() => setVisible(true), 1200);
      return () => clearTimeout(timer);
    }
  }, [transactionCount]);

  const handleRate = () => {
    localStorage.setItem('rate_prompt_rated', '1');
    setVisible(false);
    // In production Capacitor build this would call native StoreKit review API
    // For web fallback, open App Store page (if APP_STORE_ID is configured)
    if (APP_STORE_URL) window.open(APP_STORE_URL, '_blank');
  };

  const handleDismiss = () => {
    localStorage.setItem('rate_prompt_dismissed', '1');
    setVisible(false);
  };

  const handleMaybeLater = () => {
    // Allow re-prompt after 30 more transactions
    localStorage.setItem('rate_prompt_snoozed_at', String(transactionCount));
    setVisible(false);
  };

  return (
    <AnimatePresence>
      {visible && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 z-50 backdrop-blur-sm"
            onClick={handleMaybeLater}
          />
          {/* Sheet */}
          <motion.div
            initial={{ opacity: 0, y: 80, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 60, scale: 0.95 }}
            transition={{ type: 'spring', damping: 22, stiffness: 300 }}
            className="fixed bottom-0 left-0 right-0 z-50 mx-auto max-w-sm"
            style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 16px)' }}
          >
            <div className="bg-card rounded-t-3xl shadow-2xl px-6 pt-6 pb-4 mx-2 rounded-3xl mb-4">
              <button
                onClick={handleDismiss}
                className="absolute top-4 right-4 p-1.5 rounded-full bg-secondary text-muted-foreground"
              >
                <X className="w-3.5 h-3.5" />
              </button>

              <div className="text-center mb-5">
                <div className="text-5xl mb-3">🌟</div>
                <h2 className="text-xl font-black text-foreground mb-1">Loving MoneyGlow?</h2>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  You've logged {transactionCount} transactions! A quick rating helps us keep improving for you.
                </p>
              </div>

              {/* Stars */}
              <div className="flex justify-center gap-3 mb-5">
                {[1, 2, 3, 4, 5].map(i => (
                  <motion.button
                    key={i}
                    whileTap={{ scale: 0.85 }}
                    onClick={handleRate}
                    className="p-1"
                  >
                    <Star className="w-9 h-9 text-yellow-400 fill-yellow-400" />
                  </motion.button>
                ))}
              </div>

              <button
                onClick={handleRate}
                className="w-full h-12 rounded-2xl font-bold text-sm mb-3 text-white"
                style={{ background: 'linear-gradient(135deg, #2563EB 0%, #7C3AED 100%)' }}
              >
                Rate MoneyGlow ⭐
              </button>
              <button
                onClick={handleMaybeLater}
                className="w-full h-10 text-sm text-muted-foreground font-medium"
              >
                Maybe later
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}