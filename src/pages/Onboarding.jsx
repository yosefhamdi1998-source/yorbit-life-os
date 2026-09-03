import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronRight, Sparkles, Landmark } from 'lucide-react';
import { FEATURES } from '@/lib/features';

// Black-to-gold throughout, matching the app's own default theme — each step
// deepens the gold slightly rather than switching to an unrelated hue, so
// the very first thing a new user sees already looks like the rest of the app.
const BANK_STEP = {
  emoji: '🏦',
  bg: 'linear-gradient(160deg, #0a0a0a 0%, #3d2f0a 55%, #D4AF37 100%)',
  accentColor: '#D4AF37',
  title: 'Connect your bank',
  // Says a real number rather than a vague "your transactions import
  // automatically" — but "up to" and "if it has it" keep this honest
  // rather than promising a fixed amount every bank will actually give
  // (real ones vary widely; one tested gave 90 days, not years). Kept to
  // one line's worth of information, same density as the other three
  // steps, so this step doesn't suddenly read as denser than the rest.
  subtitle: 'Link your bank securely — up to 5 years of history imports automatically, when available.',
  cta: 'Connect Bank',
  isBankStep: true,
};

const INFO_STEPS = [
  {
    emoji: '👋',
    bg: 'linear-gradient(160deg, #0a0a0a 0%, #1a1508 55%, #3d2f0a 100%)',
    accentColor: '#D4AF37',
    title: 'See your money clearly',
    subtitle: 'Know exactly where every dollar goes — in 30 seconds a day.',
    cta: 'Get Started',
  },
  {
    emoji: '💸',
    bg: 'linear-gradient(160deg, #0a0a0a 0%, #2a2005 55%, #5c4813 100%)',
    accentColor: '#D4AF37',
    title: 'Track. Budget. Save.',
    subtitle: 'Log income and expenses, set budgets, and watch your savings grow.',
    cta: 'Next',
  },
  {
    emoji: '🧠',
    bg: 'linear-gradient(160deg, #0a0a0a 0%, #3d2f0a 55%, #D4AF37 100%)',
    accentColor: '#D4AF37',
    title: 'Your AI money coach',
    subtitle: 'Get a daily briefing and smart tips — personalized to your real finances.',
    cta: FEATURES.bankSync ? 'Next' : 'Start My Money Snapshot',
  },
];

// Last step is the bank-connect ask, not just another info screen — its CTA
// goes straight to Bank Sync instead of finishing onboarding, since
// "connect your bank" is the single highest-value thing a new user can do
// (everything else on Home stays empty until they add data one way or
// another). Only shown when bank sync is actually enabled — same feature
// flag every other bank-sync entry point in the app already checks.
const STEPS = FEATURES.bankSync ? [...INFO_STEPS, BANK_STEP] : INFO_STEPS;

export default function Onboarding() {
  const [step, setStep] = useState(0);
  const navigate = useNavigate();
  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;

  const finish = () => {
    localStorage.setItem('onboarding_done', '1');
    navigate('/');
  };

  const goToBankSync = () => {
    localStorage.setItem('onboarding_done', '1');
    navigate('/bank-sync');
  };

  const goNext = () => {
    if (current.isBankStep) { goToBankSync(); return; }
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
            color: '#0a0a0a',
          }}
        >
          {isLast ? (current.isBankStep ? <Landmark className="w-5 h-5" /> : <Sparkles className="w-5 h-5" />) : null}
          {current.cta}
          {!isLast ? <ChevronRight className="w-5 h-5" /> : null}
        </button>
        {current.isBankStep && (
          <>
            <button
              onClick={() => { localStorage.setItem('onboarding_done', '1'); navigate('/csv-import'); }}
              className="w-full h-11 mt-2.5 rounded-2xl text-sm font-semibold text-white/70 hover:text-white transition-colors"
            >
              Upload a statement instead
            </button>
            <p className="text-center text-xs text-white/35 mt-1">Read-only access, powered by Plaid · Your login is never stored</p>
          </>
        )}
      </div>
    </div>
  );
}