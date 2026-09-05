// Consent state for sending financial data to a third-party AI.
//
// The authority is profiles.ai_consent_at, checked server-side by the edge
// functions before anything is sent (see 20260907100000_ai_consent.sql). This
// module is the CLIENT's view of that same fact: it decides which screen to
// show, never whether data may leave. If this file were bypassed entirely the
// data would still be safe, which is the property that makes it a UI concern
// rather than a security control.

import { supabase } from '@/api/supabaseClient';

// Must match AI_CONSENT_VERSION in supabase/functions/ai-coach/index.ts.
// Raise BOTH when the disclosure wording materially changes: consent to the
// old text is not consent to new processing.
export const AI_CONSENT_VERSION = 1;

// Exactly what the disclosure promises, kept next to the code that sends it
// so the two cannot drift. Every line here was verified against
// supabase/functions/ai-coach/index.ts, not assumed:
//
//   line 267  individual transactions: date, amount, category, and TITLE -
//             the merchant or payee, e.g. a person's name on a transfer
//   line 261  per-category spending totals and your budget limits
//   line 271  bills by name, amount, due date and whether they are paid
//   line 292  the names of your custom forms
//
// If that prompt changes to include anything else, this list and
// AI_CONSENT_VERSION must change with it.
export const AI_DATA_SENT = [
  'Individual transactions — the date, amount, category and description, which usually includes the merchant or the person you paid',
  'Your budget categories and their limits',
  'Your bills — name, amount, due date, and whether they are paid',
  'The names of any custom forms you have created',
];

export const AI_NOT_SENT = [
  'Your bank login. Yorbit never has it.',
  'Your account or card numbers.',
  'Your name, email address or password.',
];

export const AI_STATES = {
  // Still loading. This is TRANSIENT and must never be the resting state:
  // a lookup failure that returned UNKNOWN left the Coach page on a spinner
  // that never resolved. Errors resolve to UNASKED instead - the user sees
  // the disclosure and can act, and since the edge function enforces consent
  // independently, showing the screen cannot leak anything.
  UNKNOWN: 'unknown',
  UNASKED: 'unasked',   // never presented — show the consent screen
  GRANTED: 'granted',
  DECLINED: 'declined', // deliberately refused — show the non-AI state, do NOT nag
};

export async function getAiConsent() {
  try {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user?.id) return { state: AI_STATES.UNASKED, unresolved: true };

    const { data, error } = await supabase
      .from('profiles')
      .select('ai_consent_at, ai_consent_declined_at, ai_consent_version')
      .eq('id', auth.user.id)
      .single();
    // Fail to UNASKED, never to UNKNOWN. The columns may not be deployed yet,
    // the network may be down, RLS may hiccup - none of those are reasons to
    // strand the user on a spinner, and none of them can turn into a data
    // leak because the edge function checks consent server-side regardless.
    if (error) return { state: AI_STATES.UNASKED, unresolved: true };

    // Granted, but to an older disclosure than the one now in force. Treated
    // as unasked so the user sees what actually changed rather than having
    // stale consent carried forward on their behalf.
    if (data.ai_consent_at && (data.ai_consent_version || 0) < AI_CONSENT_VERSION) {
      return { state: AI_STATES.UNASKED, staleVersion: data.ai_consent_version || 0 };
    }
    if (data.ai_consent_at) return { state: AI_STATES.GRANTED, at: data.ai_consent_at };
    if (data.ai_consent_declined_at) return { state: AI_STATES.DECLINED, at: data.ai_consent_declined_at };
    return { state: AI_STATES.UNASKED };
  } catch {
    return { state: AI_STATES.UNASKED, unresolved: true };
  }
}

async function write(patch) {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user?.id) throw new Error('Not signed in');
  const { error } = await supabase.from('profiles').update(patch).eq('id', auth.user.id);
  if (error) throw new Error(error.message);
}

export async function grantAiConsent() {
  // Clearing the declined stamp matters: someone who refused and later
  // changed their mind must land in a clean granted state, not one that
  // reads as simultaneously granted and declined.
  await write({
    ai_consent_at: new Date().toISOString(),
    ai_consent_declined_at: null,
    ai_consent_version: AI_CONSENT_VERSION,
  });
}

export async function declineAiConsent() {
  await write({
    ai_consent_at: null,
    ai_consent_declined_at: new Date().toISOString(),
    ai_consent_version: null,
  });
}

// Withdrawal is the same write as declining. Kept as its own name because the
// caller and the wording differ - one is a first answer, the other is taking
// a previous yes back - and a settings screen reading `declineAiConsent()`
// would misdescribe what the user is doing.
export const withdrawAiConsent = declineAiConsent;
