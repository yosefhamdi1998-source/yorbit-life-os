import { Link, useLocation } from 'react-router-dom';
import { X, ChevronRight } from 'lucide-react';
import { useState, useEffect } from 'react';
import {
  isOnboardingInProgress, getOnboardingStep, clearOnboardingStep, markOnboardingComplete,
} from '@/lib/onboarding';

// The "nobody gets stranded" piece.
//
// Step 2 of first run sends people OUT of the onboarding route - into Bank
// Sync or CSV Import - and the old flow had no way back. Once you left, the
// progress dots were gone, there was no indication you were mid-setup, and
// finishing an import dropped you wherever that page happened to end. People
// who got confused at the bank screen simply stopped.
//
// This bar rides along on those pages. It says which step you are on and
// offers one tap back into the flow, where the payoff screen is waiting to
// show them what their import actually produced.
//
// It is deliberately dismissible. A progress bar you cannot get rid of is a
// nag, and someone who genuinely wants to explore first should be able to.
// Dismissing ends first run rather than hiding the bar and leaving the state
// half-set, because a hidden in-progress flow is exactly how people end up
// stranded again.

const LABELS = {
  1: 'Bring in your money',
  2: 'See what we found',
};

// Pages that are part of the flow itself. The bar has no business on the
// onboarding route (which draws its own progress) or on auth screens.
const HIDE_ON = ['/onboarding', '/login', '/register', '/forgot-password', '/reset-password'];

export default function OnboardingProgress() {
  const location = useLocation();
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState(null);

  useEffect(() => {
    setVisible(isOnboardingInProgress());
    setStep(getOnboardingStep());
  }, [location.pathname]);

  if (!visible || step === null || step < 1) return null;
  if (HIDE_ON.some(p => location.pathname.startsWith(p))) return null;

  const dismiss = () => {
    setVisible(false);
    clearOnboardingStep();
    markOnboardingComplete();
  };

  return (
    <div className="sticky top-0 z-40 bg-primary/10 backdrop-blur border-b border-primary/20">
      <div className="max-w-5xl mx-auto px-4 py-2 flex items-center gap-3">
        <div className="flex items-center gap-1 shrink-0" aria-hidden="true">
          {[0, 1, 2].map(i => (
            <div
              key={i}
              className={`h-1 rounded-full transition-all ${i <= step ? 'bg-primary w-5' : 'bg-primary/25 w-2.5'}`}
            />
          ))}
        </div>
        <Link to="/onboarding" className="min-w-0 flex-1 flex items-center gap-1 group">
          <span className="text-xs font-bold text-foreground truncate">
            Setup · step {step + 1} of 3
          </span>
          <span className="text-xs text-muted-foreground truncate hidden sm:inline">
            — {LABELS[step] || 'Finish setting up'}
          </span>
          <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0 group-hover:translate-x-0.5 transition-transform" />
        </Link>
        <button
          onClick={dismiss}
          aria-label="Finish setup later"
          className="shrink-0 p-1 -mr-1 text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
