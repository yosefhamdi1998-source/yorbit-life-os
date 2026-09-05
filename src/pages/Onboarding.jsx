import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronRight, Landmark, FileSpreadsheet, PenLine, Wallet, ArrowRight } from 'lucide-react';
import { FEATURES } from '@/lib/features';
import { base44 } from '@/api/base44Client';
import { composeNetWorth } from '@/lib/netWorth';
import { fmtFull } from '@/lib/format';
import {
  ONBOARDING_STEPS, setOnboardingStep, clearOnboardingStep, markOnboardingComplete,
} from '@/lib/onboarding';

// FIRST RUN, REBUILT.
//
// What this replaced: four full-screen slides of marketing copy that collected
// nothing and taught nothing. A new user tapped Next three times, was handed
// off to Plaid, and landed on an empty Home with no acknowledgement that
// anything had happened. If they skipped, they got the same empty Home with a
// small card on it. The progress dots covered only the slides, so the moment
// the real work began - connecting a bank, importing a file - the sense of
// "where am I, how much is left" vanished entirely.
//
// What it is now: three steps that each do something.
//
//   1  Set the expectation. One screen, not three. Says how long this takes
//      and that every step can be skipped, because the honest version of
//      "skippable" is telling people up front.
//   2  Get real data in. Bank or statement, side by side, plus an explicit
//      third door for people who want neither. Skipping moves FORWARD to
//      step 3, it does not eject you from the flow.
//   3  Show them something true about their own money. This is the step the
//      old flow was missing: the payoff. Cash on Hand, what was found, over
//      what period. With no data it shows what they will see and how to get
//      there - never a dead end.
//
// The progress bar is rendered by Layout too (see components/OnboardingProgress),
// so it stays visible while the user is off in Bank Sync or CSV Import. That is
// the "nobody who skips gets stranded" requirement: there is always a marker
// showing where you are and a way back into the flow.

const GOLD = '#D4AF37';

// Steps share one background treatment rather than each inventing its own, so
// the flow reads as one thing. Gold stays at the bottom where the CTA lives.
const BG = 'linear-gradient(160deg, #0a0a0a 0%, #241b06 58%, #4a3a0d 100%)';

function ProgressBar({ step }) {
  return (
    <div className="flex items-center gap-1.5 px-6" aria-label={`Step ${step + 1} of 3`}>
      {[0, 1, 2].map(i => (
        <div key={i} className="flex-1 h-1 rounded-full overflow-hidden bg-white/15">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ width: i <= step ? '100%' : '0%', background: GOLD }}
          />
        </div>
      ))}
    </div>
  );
}

function Shell({ step, onSkip, skipLabel, children, footer }) {
  return (
    <div
      className="flex flex-col select-none"
      style={{ background: BG, minHeight: '100dvh' }}
    >
      <div
        className="flex items-center justify-between gap-4 px-6 pb-4"
        style={{ paddingTop: 'calc(env(safe-area-inset-top) + 16px)' }}
      >
        <span className="text-xs font-bold tracking-wide text-white/60 uppercase">
          Step {step + 1} of 3
        </span>
        {onSkip && (
          // 70% white on the near-black top of the gradient clears AA
          // comfortably. The old flow put its most important sentence at 35%
          // over gold, which measured 1.28:1 - see the note on the trust line.
          <button onClick={onSkip} className="text-sm font-semibold text-white/70 hover:text-white px-2 py-1 -mr-2 transition-colors">
            {skipLabel || 'Skip'}
          </button>
        )}
      </div>
      <ProgressBar step={step} />

      <div className="flex-1 flex flex-col justify-center px-6 py-8">
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
            transition={{ duration: 0.28, ease: [0.25, 0.46, 0.45, 0.94] }}
            className="w-full max-w-sm mx-auto"
          >
            {children}
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="px-6" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 28px)' }}>
        {footer}
      </div>
    </div>
  );
}

// ── Step 1 ────────────────────────────────────────────────────────────────
function StepWelcome({ onNext, onSkip }) {
  return (
    <Shell
      step={0}
      onSkip={onSkip}
      skipLabel="Skip setup"
      footer={
        <button
          onClick={onNext}
          className="w-full h-14 rounded-2xl text-base font-bold flex items-center justify-center gap-2 bg-white text-[#0a0a0a] transition-all active:scale-[0.97] shadow-lg"
        >
          Start <ChevronRight className="w-5 h-5" />
        </button>
      }
    >
      <div className="text-6xl mb-7">👋</div>
      <h1 className="text-[32px] leading-[1.15] font-black text-white mb-4 text-balance">
        Let&rsquo;s see where your money actually goes
      </h1>
      <p className="text-base text-white/75 leading-relaxed">
        Three steps, about a minute. You can skip any of them and come back later.
      </p>
    </Shell>
  );
}

// ── Step 2 ────────────────────────────────────────────────────────────────
function OptionCard({ icon: Icon, title, body, onClick, primary }) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left rounded-2xl p-4 flex items-start gap-3.5 transition-all active:scale-[0.98] border ${
        primary
          ? 'bg-white/95 border-white/60 text-[#0a0a0a]'
          : 'bg-white/10 border-white/20 text-white hover:bg-white/15'
      }`}
    >
      <div className={`shrink-0 w-10 h-10 rounded-xl flex items-center justify-center ${primary ? 'bg-[#0a0a0a]/8' : 'bg-white/10'}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="min-w-0">
        <p className="font-bold text-[15px] leading-tight mb-1">{title}</p>
        <p className={`text-[13px] leading-snug ${primary ? 'text-[#0a0a0a]/65' : 'text-white/65'}`}>{body}</p>
      </div>
    </button>
  );
}

function StepConnect({ onSkip, navigate }) {
  const go = (path) => { setOnboardingStep(ONBOARDING_STEPS.CONNECT); navigate(path); };
  return (
    <Shell
      step={1}
      onSkip={onSkip}
      skipLabel="Skip"
      footer={
        <>
          <OptionCard
            icon={PenLine}
            title="I'll add things myself"
            body="Enter transactions by hand. You can always connect a bank later."
            onClick={onSkip}
          />
          {/* The trust line. 12px at 35% white over the gold end of the
              gradient measured 1.28:1 against a 4.5:1 requirement - the least
              readable text in the app was the sentence asking for a bank
              login. Now 13px at 70% on a dark chip that carries its own
              background regardless of what is behind it. */}
          <p className="text-center text-[13px] text-white/70 mt-3 leading-snug bg-black/35 rounded-xl px-3 py-2">
            Read-only access, powered by Plaid. Your bank login is never stored.
          </p>
        </>
      }
    >
      <h1 className="text-[30px] leading-[1.15] font-black text-white mb-3 text-balance">
        Bring in your money
      </h1>
      <p className="text-[15px] text-white/75 leading-relaxed mb-6">
        Pick whichever is easier. Either one gets you to a real picture on the next screen.
      </p>
      <div className="space-y-2.5">
        {FEATURES.bankSync && (
          <OptionCard
            primary
            icon={Landmark}
            title="Connect a bank"
            body="Transactions import on their own. Up to 5 years of history, when your bank provides it."
            onClick={() => go('/bank-sync')}
          />
        )}
        <OptionCard
          icon={FileSpreadsheet}
          title="Upload a statement"
          body="A CSV from your bank, card, or exchange. Good if your bank isn't supported."
          onClick={() => go('/csv-import')}
        />
      </div>
    </Shell>
  );
}

// ── Step 3: the payoff ────────────────────────────────────────────────────
function StepFirstLook({ onDone, navigate }) {
  const [state, setState] = useState({ loading: true });

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        // WINDOW = 30 days. Everything about spending on this screen is scoped
        // to it and SAYS so. The alternative - "top category across whatever
        // rows we happened to fetch" - is a number nobody can check.
        const since = new Date();
        since.setDate(since.getDate() - 30);
        const sinceISO = since.toISOString().slice(0, 10);

        const [stats, tx, accounts, manual] = await Promise.all([
          base44.entities.Transaction.summaryStats().catch(() => ({ total: 0, budgeted: 0, first: null, last: null })),
          base44.entities.Transaction.list('-date', 800).catch(() => []),
          base44.entities.ConnectedAccount?.list?.().catch(() => []) ?? [],
          base44.entities.NetWorthEntry?.list?.().catch(() => []) ?? [],
        ]);
        if (!alive) return;

        const recent = (tx || []).filter(t => t.date && t.date >= sinceISO);
        const spend = recent.filter(t => t.type === 'expense' && !t.exclude_from_budget);
        const byCat = {};
        for (const t of spend) {
          const k = t.category || 'other';
          byCat[k] = (byCat[k] || 0) + (Number(t.amount) || 0);
        }
        // Top three, not one. The single-winner version made "Other" the
        // headline insight on this account - 29% of spend is uncategorised,
        // so the first thing a new user learned was nothing at all. A short
        // list degrades honestly: even with a big Other bucket, the named
        // categories beside it still say something true.
        const top = Object.entries(byCat)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map(([name, amount]) => ({ name, amount }));

        setState({
          loading: false,
          count: stats.total || (tx || []).length,
          net: composeNetWorth(accounts || [], manual || []),
          top,
          spendTotal: spend.reduce((s, t) => s + (Number(t.amount) || 0), 0),
          recentCount: recent.length,
          from: stats.first,
          to: stats.last,
        });
      } catch {
        if (alive) setState({ loading: false, count: 0, failed: true });
      }
    })();
    return () => { alive = false; };
  }, []);

  const cta = (
    <button
      onClick={onDone}
      className="w-full h-14 rounded-2xl text-base font-bold flex items-center justify-center gap-2 text-[#0a0a0a] transition-all active:scale-[0.97] shadow-lg"
      style={{ background: GOLD }}
    >
      Go to my dashboard <ArrowRight className="w-5 h-5" />
    </button>
  );

  if (state.loading) {
    return (
      <Shell step={2} footer={cta}>
        <div className="flex flex-col items-center py-10 gap-4">
          <div className="w-9 h-9 border-[3px] border-white/25 border-t-white rounded-full animate-spin" />
          <p className="text-sm text-white/70">Looking at what you brought in…</p>
        </div>
      </Shell>
    );
  }

  // Nothing came in - because they skipped, or the import found nothing. This
  // is the state the old flow handled worst: it just dropped you on an empty
  // Home. Say plainly what is missing and give one tap to fix it.
  if (!state.count) {
    return (
      <Shell
        step={2}
        footer={
          <>
            <button
              onClick={() => { setOnboardingStep(ONBOARDING_STEPS.FIRST_LOOK); navigate('/finance?new=1'); }}
              className="w-full h-14 rounded-2xl text-base font-bold flex items-center justify-center gap-2 bg-white text-[#0a0a0a] transition-all active:scale-[0.97] shadow-lg"
            >
              Add my first transaction
            </button>
            <button onClick={onDone} className="w-full h-12 mt-2 rounded-2xl text-sm font-semibold text-white/70 hover:text-white transition-colors">
              I&rsquo;ll do it later
            </button>
          </>
        }
      >
        <div className="text-5xl mb-6">🪴</div>
        <h1 className="text-[28px] leading-[1.15] font-black text-white mb-3 text-balance">
          Nothing to show yet — and that&rsquo;s fine
        </h1>
        <p className="text-[15px] text-white/75 leading-relaxed mb-5">
          Yorbit only ever shows numbers that come from your real transactions. It
          has none yet, so it isn&rsquo;t going to invent any.
        </p>
        <div className="rounded-2xl bg-white/10 border border-white/15 p-4">
          <p className="text-[13px] font-bold text-white mb-2">Once you add something, this screen shows:</p>
          <ul className="text-[13px] text-white/70 space-y-1.5 leading-snug">
            <li>· What you have on hand right now</li>
            <li>· Where most of your money went</li>
            <li>· How much came in against how much went out</li>
          </ul>
        </div>
      </Shell>
    );
  }

  const { net, count, top, spendTotal, recentCount, from, to } = state;
  const money = (n) => `$${fmtFull(Math.abs(n))}`;
  const pretty = (s) => String(s).replace(/_/g, ' ');

  return (
    <Shell step={2} footer={cta}>
      <p className="text-xs font-bold uppercase tracking-wide mb-2" style={{ color: GOLD }}>
        Here&rsquo;s what we found
      </p>
      <h1 className="text-[28px] leading-[1.15] font-black text-white mb-6 text-balance">
        {count.toLocaleString()} transaction{count === 1 ? '' : 's'} are in.
      </h1>

      {/* Cash on Hand leads, per the requirement that it is part of what a new
          user lands on. The label comes from composeNetWorth, which says
          "Cash on Hand" until manual entries exist and only then says "Net
          Worth" - so this never overstates what it knows. */}
      <div className="rounded-2xl bg-white/10 border border-white/15 p-4 mb-3">
        <div className="flex items-center gap-2 mb-1">
          <Wallet className="w-4 h-4" style={{ color: GOLD }} />
          <p className="text-[13px] font-bold text-white/80">{net.label}</p>
        </div>
        <p className="text-3xl font-black text-white tabular-nums leading-none mb-1">
          {net.total < 0 ? '−' : ''}{money(net.total)}
        </p>
        <p className="text-[12px] text-white/60">{net.sublabel}</p>
      </div>

      {top?.length > 0 && spendTotal > 0 && (
        <div className="rounded-2xl bg-white/10 border border-white/15 p-4 mb-3">
          {/* The window is named in the heading, not buried. Every figure in
              this card is from those 30 days and nothing else. */}
          <p className="text-[13px] font-bold text-white/80 mb-2.5">
            Your biggest spending, last 30 days
          </p>
          <div className="space-y-2">
            {top.map(c => (
              <div key={c.name}>
                <div className="flex items-baseline justify-between gap-3 mb-1">
                  <span className="text-[14px] font-bold text-white capitalize truncate">{pretty(c.name)}</span>
                  <span className="text-[14px] font-bold text-white tabular-nums shrink-0">{money(c.amount)}</span>
                </div>
                <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${Math.max(4, Math.round((c.amount / spendTotal) * 100))}%`, background: GOLD }}
                  />
                </div>
              </div>
            ))}
          </div>
          <p className="text-[12px] text-white/60 tabular-nums mt-2.5">
            {money(spendTotal)} spent across {recentCount.toLocaleString()} transactions
          </p>
        </div>
      )}

      {/* True first and last date across the whole account, from a count/min/max
          query - not the edges of whatever page happened to load. */}
      {from && to && from !== to && (
        <p className="text-[12px] text-white/55 text-center">
          Your history runs {from} to {to}
        </p>
      )}
    </Shell>
  );
}

// ── Flow ──────────────────────────────────────────────────────────────────
export default function Onboarding() {
  const navigate = useNavigate();
  // Resume where they left off. Coming back from Bank Sync or CSV Import
  // should land on the payoff, not restart the tour.
  const [step, setStep] = useState(() => {
    const saved = Number(sessionStorage.getItem('onboarding_resume'));
    return Number.isFinite(saved) && saved > 0 && saved < 3 ? saved : 0;
  });

  useEffect(() => {
    sessionStorage.setItem('onboarding_resume', String(step));
    setOnboardingStep(step);
  }, [step]);

  const finish = useCallback(() => {
    clearOnboardingStep();
    sessionStorage.removeItem('onboarding_resume');
    markOnboardingComplete();
    navigate('/', { replace: true });
  }, [navigate]);

  if (step === 0) return <StepWelcome onNext={() => setStep(1)} onSkip={finish} />;
  if (step === 1) return <StepConnect onSkip={() => setStep(2)} navigate={navigate} />;
  return <StepFirstLook onDone={finish} navigate={navigate} />;
}
