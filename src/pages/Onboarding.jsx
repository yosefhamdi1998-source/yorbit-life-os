import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronRight, Sparkles } from 'lucide-react';

const STEPS = [
  {
    emoji: '👋',
    bg: 'linear-gradient(160deg, #0f0c29 0%, #302b63 50%, #24243e 100%)',
    accentColor: '#a78bfa',
    title: 'See your money clearly',
    subtitle: 'Know exactly where every dollar goes — in 30 seconds a day.',
    cta: 'Get Started',
  },
  {
    emoji: '💸',
    bg: 'linear-gradient(160deg, #064e3b 0%, #065f46 60%, #047857 100%)',
    accentColor: '#34d399',
    title: 'Track. Budget. Save.',
    subtitle: 'Log income and expenses, set budgets, and watch your savings grow.',
    cta: 'Next',
  },
  {
    emoji: '🧠',
    bg: 'linear-gradient(160deg, #3b0764 0%, #581c87 60%, #6b21a8 100%)',
    accentColor: '#c084fc',
    title: 'Your AI money coach',
    subtitle: 'Get a daily briefing and smart tips — personalized to your real finances.',
    cta: 'Start My Money Snapshot',
  },
];

export default function Onboarding() {
  const [step, setStep] = useState(0);
  const navigate = useNavigate();
  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;

  const finish = () => {
    localStorage.setItem('onboarding_done', '1');
    navigate('/');
  };

  const goNext = () => {
    if (isLast) { finish(); return; }
    setStep(s => s + 1);
  };

  return (
    <div
      className="flex flex-col select-none"
      style={{ background: current.bg, transition: 'background 0.4s ease', minHeight: '100dvh' }}
    >
      {/* Skip */}
      <div
        className="flex justify-end px-5"
        style={{ paddingTop: 'calc(env(safe-area-inset-top) + 16px)' }}
      >
        <button onClick={finish} className="text-sm text-white/50 font-medium px-2 py-1">
          Skip
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col items-center justify-center px-8 text-center">
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] }}
            className="w-full max-w-xs mx-auto"
          >
            <div className="text-7xl mb-8">{current.emoji}</div>
            <h1 className="text-3xl font-black text-white mb-4 leading-tight">{current.title}</h1>
            <p className="text-base text-white/70 leading-relaxed">{current.subtitle}</p>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Dots */}
      <div className="flex items-center justify-center gap-2 mb-6">
        {STEPS.map((_, i) => (
          <div
            key={i}
            className="rounded-full transition-all duration-300"
            style={{
              background: i === step ? current.accentColor : 'rgba(255,255,255,0.25)',
              width: i === step ? 24 : 8,
              height: 8,
            }}
          />
        ))}
      </div>

      {/* CTA */}
      <div className="px-6" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 32px)' }}>
        <button
          onClick={goNext}
          className="w-full h-14 rounded-2xl text-base font-bold flex items-center justify-center gap-2 transition-all active:scale-[0.97] shadow-lg"
          style={{
            background: isLast ? current.accentColor : 'white',
            color: '#0f0c29',
          }}
        >
          {isLast ? <Sparkles className="w-5 h-5" /> : null}
          {current.cta}
          {!isLast ? <ChevronRight className="w-5 h-5" /> : null}
        </button>
        {isLast && (
          <p className="text-center text-xs text-white/35 mt-3">Free to use · No bank login required</p>
        )}
      </div>
    </div>
  );
}