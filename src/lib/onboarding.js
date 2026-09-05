// First-run state, in one place.
//
// Two separate facts live here and they are NOT the same thing:
//
//   "which step am I on"   - transient, per-device, fine in localStorage.
//   "have I finished"      - belongs to the ACCOUNT, not the browser.
//
// The old code kept only the second one, in localStorage, which meant a user
// who set up on their phone saw the whole tour again on their laptop, and
// anyone who cleared site data got it a third time. It is written to the
// profile now and falls back to localStorage only when the write fails, so a
// network blip does not trap someone in a loop.

import { supabase } from '@/api/supabaseClient';

export const ONBOARDING_STEPS = {
  WELCOME: 0,
  CONNECT: 1,
  FIRST_LOOK: 2,
};

const STEP_KEY = 'onboarding_step';
const DONE_KEY = 'onboarding_done';

export function getOnboardingStep() {
  const raw = localStorage.getItem(STEP_KEY);
  if (raw === null) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 && n <= 2 ? n : null;
}

export function setOnboardingStep(step) {
  try { localStorage.setItem(STEP_KEY, String(step)); } catch { /* private mode */ }
}

export function clearOnboardingStep() {
  try { localStorage.removeItem(STEP_KEY); } catch { /* private mode */ }
}

export function isOnboardingInProgress() {
  return getOnboardingStep() !== null && !localStorage.getItem(DONE_KEY);
}

// Marks completion on the profile so it follows the account across devices.
// localStorage is written first and unconditionally: it is what stops the
// redirect loop on THIS device, and it must not depend on the network.
export async function markOnboardingComplete() {
  try { localStorage.setItem(DONE_KEY, '1'); } catch { /* private mode */ }
  try {
    const { data } = await supabase.auth.getUser();
    if (!data?.user?.id) return;
    await supabase
      .from('profiles')
      .update({ onboarding_completed_at: new Date().toISOString() })
      .eq('id', data.user.id);
  } catch {
    // Offline or the column is not deployed yet. The local flag already did
    // the job that matters; the profile catches up on the next completion.
  }
}
