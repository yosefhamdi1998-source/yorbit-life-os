import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Sparkles } from 'lucide-react';

const APP_VERSION = '1.0.0';

// Shows a "What's New" banner once per version — drives re-engagement after updates
const UPDATES = [
  { emoji: '🧠', text: 'AI Money Coach — get daily personalized advice' },
  { emoji: '📊', text: 'Spending donut chart — see where money goes' },
  { emoji: '🔔', text: 'Bill tracker — never miss a payment' },
];

export default function WhatsNewBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const seen = localStorage.getItem('whats_new_seen_v');
    if (seen !== APP_VERSION) {
      // Small delay so it doesn't pop instantly on load
      const t = setTimeout(() => setVisible(true), 2000);
      return () => clearTimeout(t);
    }
  }, []);

  const dismiss = () => {
    localStorage.setItem('whats_new_seen_v', APP_VERSION);
    setVisible(false);
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.25 }}
          className="mx-4 mb-3 rounded-2xl overflow-hidden border border-blue-100"
          style={{ background: 'linear-gradient(135deg, #EEF6FF 0%, #F5F0FF 100%)' }}
        >
          <div className="p-4">
            <div className="flex items-start justify-between mb-2">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-primary" />
                <p className="text-sm font-black text-gray-800">What's New in MoneyGlow</p>
              </div>
              <button onClick={dismiss} className="p-1 rounded-full hover:bg-black/5 shrink-0">
                <X className="w-3.5 h-3.5 text-gray-400" />
              </button>
            </div>
            <div className="space-y-1.5">
              {UPDATES.map(({ emoji, text }) => (
                <div key={text} className="flex items-center gap-2">
                  <span className="text-base shrink-0">{emoji}</span>
                  <p className="text-xs text-gray-700 font-medium">{text}</p>
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}