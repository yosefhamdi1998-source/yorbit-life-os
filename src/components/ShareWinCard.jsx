import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Share2, X, TrendingUp, Sparkles } from 'lucide-react';

function fmt(n) {
  return (n || 0).toLocaleString('en-US', { maximumFractionDigits: 0 });
}

export default function ShareWinCard({ monthIncome, monthExpenses, savingsRate, month }) {
  const [open, setOpen] = useState(false);
  const netSaved = monthIncome - monthExpenses;

  if (netSaved <= 0 || monthIncome === 0) return null;

  const handleShare = async () => {
    const text = `💰 I saved $${fmt(netSaved)} this month with Yoglow!\nSavings rate: ${savingsRate}% 🚀\n\nTrack your money smarter: yoglow.app`;
    if (navigator.share) {
      await navigator.share({ title: 'My Yoglow Win 🎉', text });
    } else {
      await navigator.clipboard.writeText(text);
    }
    setOpen(false);
  };

  return (
    <>
      {/* Inline card on dashboard */}
      <div
        className="rounded-2xl p-4 flex items-center gap-3 cursor-pointer active:scale-[0.98] transition-transform"
        style={{ background: 'linear-gradient(135deg, #064e3b 0%, #065f46 100%)' }}
        onClick={() => setOpen(true)}
      >
        <div className="w-10 h-10 rounded-2xl bg-white/15 flex items-center justify-center shrink-0">
          <TrendingUp className="w-5 h-5 text-emerald-300" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-white font-bold text-sm leading-tight">You saved ${fmt(netSaved)} this month! 🎉</p>
          <p className="text-emerald-200/70 text-xs mt-0.5">Tap to share your win</p>
        </div>
        <Share2 className="w-4 h-4 text-emerald-300 shrink-0" />
      </div>

      {/* Share sheet */}
      <AnimatePresence>
        {open && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/50 z-50 backdrop-blur-sm"
              onClick={() => setOpen(false)}
            />
            <motion.div
              initial={{ opacity: 0, y: 60 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 40 }}
              transition={{ type: 'spring', damping: 24, stiffness: 320 }}
              className="fixed bottom-0 left-0 right-0 z-50 max-w-sm mx-auto"
              style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 16px)' }}
            >
              <div className="bg-card rounded-3xl shadow-2xl p-6 mx-2 mb-4">
                <div className="flex items-center justify-between mb-4">
                  <p className="font-black text-lg">Share Your Win 🏆</p>
                  <button onClick={() => setOpen(false)} className="p-1.5 rounded-full bg-secondary">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Preview card */}
                <div
                  className="rounded-2xl p-5 mb-4"
                  style={{ background: 'linear-gradient(135deg, #1e40af 0%, #7c3aed 100%)' }}
                >
                  <div className="flex items-center gap-2 mb-3">
                    <Sparkles className="w-4 h-4 text-white/70" />
                    <span className="text-white/70 text-xs font-semibold uppercase tracking-wider">Yoglow Win</span>
                  </div>
                  <p className="text-white/60 text-xs mb-1">{month}</p>
                  <p className="text-white text-3xl font-black">${fmt(netSaved)} saved</p>
                  <p className="text-white/70 text-sm mt-1">Savings rate: {savingsRate}% 🔥</p>
                  <div className="mt-3 pt-3 border-t border-white/20 flex gap-3">
                    <div>
                      <p className="text-white/50 text-[10px]">Income</p>
                      <p className="text-white text-sm font-bold">${fmt(monthIncome)}</p>
                    </div>
                    <div>
                      <p className="text-white/50 text-[10px]">Spent</p>
                      <p className="text-white text-sm font-bold">${fmt(monthExpenses)}</p>
                    </div>
                  </div>
                </div>

                <button
                  onClick={handleShare}
                  className="w-full h-12 rounded-2xl font-bold text-white text-sm"
                  style={{ background: 'linear-gradient(135deg, #2563EB 0%, #7C3AED 100%)' }}
                >
                  <Share2 className="w-4 h-4 inline mr-2" />
                  Share with Friends
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}