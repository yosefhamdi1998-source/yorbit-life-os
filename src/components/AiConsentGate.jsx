import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Sparkles, ShieldCheck, X, Check, Loader2 } from 'lucide-react';
import {
  AI_STATES, AI_DATA_SENT, AI_NOT_SENT,
  getAiConsent, grantAiConsent, declineAiConsent,
} from '@/lib/aiConsent';
import { toast } from '@/components/ui/use-toast';

// Wraps anything that would send financial data to the AI.
//
// Three real states, and the difference between the last two is the whole
// point:
//
//   UNASKED   show the disclosure and ask
//   GRANTED   render the feature
//   DECLINED  render a useful non-AI screen, and do NOT ask again
//
// Collapsing DECLINED into UNASKED turns a considered "no" into a prompt on
// every single visit, which is how consent dialogs become something people
// click through without reading. A refusal is an answer; it gets respected
// until the user comes back on their own.
//
// This gate is for the interface only. The edge functions check consent
// server-side before calling Anthropic, so removing this component would
// change what is displayed, not what is sent.
export default function AiConsentGate({ children, featureName = 'AI Coach' }) {
  // `loading` is separate from the consent state on purpose. Deriving
  // "still loading" from state === UNKNOWN meant any lookup failure showed a
  // spinner that never stopped.
  const [consent, setConsent] = useState({ state: AI_STATES.UNKNOWN });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(
    () => getAiConsent().then(setConsent).finally(() => setLoading(false)),
    [],
  );
  useEffect(() => { refresh(); }, [refresh]);

  const decide = async (grant) => {
    if (saving) return;
    setSaving(true);
    try {
      await (grant ? grantAiConsent() : declineAiConsent());
      await refresh();
    } catch (err) {
      toast({
        title: "Couldn't save that",
        description: err.message || 'Please try again in a moment.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (consent.state === AI_STATES.GRANTED) return children;

  if (consent.state === AI_STATES.DECLINED) {
    return (
      <div className="sky-card rounded-2xl p-5 text-center">
        <div className="w-11 h-11 rounded-2xl bg-secondary flex items-center justify-center mx-auto mb-3">
          <ShieldCheck className="w-5 h-5 text-muted-foreground" />
        </div>
        <p className="font-bold text-foreground mb-1.5">{featureName} is turned off</p>
        <p className="text-sm text-muted-foreground leading-relaxed mb-4 max-w-sm mx-auto">
          You chose not to share your financial data for AI analysis. Everything
          else in Yorbit works normally — your transactions, budgets, bills,
          reports and investments are all unaffected.
        </p>
        <button
          onClick={() => decide(true)}
          disabled={saving}
          className="text-sm font-bold text-primary underline underline-offset-4 disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Turn on AI features'}
        </button>
      </div>
    );
  }

  // UNASKED — the disclosure.
  return (
    <div className="sky-card rounded-2xl p-5 max-w-lg mx-auto">
      <div className="w-11 h-11 rounded-2xl bg-primary/12 flex items-center justify-center mb-3">
        <Sparkles className="w-5 h-5 text-primary" />
      </div>
      <h2 className="text-xl font-black text-foreground mb-2 text-balance">
        Before {featureName} can help, it needs your permission
      </h2>
      <p className="text-sm text-muted-foreground leading-relaxed mb-4">
        To give advice about your money, Yorbit sends some of your financial
        information to <span className="font-semibold text-foreground">Anthropic</span>,
        the company that makes the Claude AI model. They process the request and
        return the answer.
      </p>

      <div className="rounded-xl bg-secondary/60 p-3.5 mb-3">
        <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground mb-2">
          What gets sent
        </p>
        <ul className="space-y-1.5">
          {AI_DATA_SENT.map(item => (
            <li key={item} className="text-[13px] text-foreground leading-snug flex gap-2">
              <span className="text-muted-foreground shrink-0">·</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-3.5 mb-4">
        <p className="text-[11px] font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-400 mb-2">
          What never gets sent
        </p>
        <ul className="space-y-1.5">
          {AI_NOT_SENT.map(item => (
            <li key={item} className="text-[13px] text-emerald-800 dark:text-emerald-300 leading-snug flex gap-2">
              <span className="shrink-0">·</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </div>

      <p className="text-xs text-muted-foreground leading-relaxed mb-4">
        You can change your mind at any time in Settings. Saying no here does
        not limit anything else — transactions, budgets, bills, reports and
        investments all keep working.{' '}
        <Link to="/privacy-policy" className="underline underline-offset-2 hover:text-foreground">
          Privacy Policy
        </Link>
      </p>

      <div className="flex flex-col gap-2">
        <button
          onClick={() => decide(true)}
          disabled={saving}
          className="w-full h-12 rounded-xl bg-primary text-white font-bold text-sm flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-60"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
          Allow and turn on {featureName}
        </button>
        <button
          onClick={() => decide(false)}
          disabled={saving}
          className="w-full h-11 rounded-xl bg-secondary text-foreground font-semibold text-sm flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-60"
        >
          <X className="w-4 h-4" />
          No thanks
        </button>
      </div>
    </div>
  );
}
