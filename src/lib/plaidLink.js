// Shared by the in-page Plaid Link flow (BankSync.jsx) and the native OAuth
// deep-link resume flow (NativeBankLinkReturn.jsx), so a bank linked via
// either path makes the exact same server calls and lands in the exact same
// auto-sync queue BankSync.jsx already knows how to drain on mount.

// Must exactly match an "Allowed redirect URI" registered in the Plaid
// Dashboard - Plaid rejects any redirect_uri it doesn't recognize. iOS also
// requires this exact host+path to be configured as a universal link
// (Associated Domains + apple-app-site-association); Android needs it
// covered by an App Links intent filter (assetlinks.json). Neither is done
// yet - see OWNER_ACTIONS.md - so today this URL loads as a normal page
// (see src/pages/BankOAuthReturn.jsx) instead of being intercepted back
// into the app.
export const NATIVE_BANK_LINK_REDIRECT_URI = 'https://yorbit-life-os.vercel.app/bank-oauth-return';

const PENDING_LINK_KEY = 'yorbit.pendingBankLink';
// Plaid link tokens are single-use and short-lived; an entry older than this
// can only be a flow the user abandoned, not one worth resuming silently.
const PENDING_LINK_MAX_AGE_MS = 30 * 60 * 1000;
const PENDING_SYNC_KEY = 'yorbit.pendingBankAutoSync';

const defaultStorage = () => (typeof localStorage === 'undefined' ? undefined : localStorage);

export function loadPlaidScript() {
  return new Promise((resolve, reject) => {
    if (window.Plaid) { resolve(); return; }
    const script = document.createElement('script');
    script.src = 'https://cdn.plaid.com/link/v2/stable/link-initialize.js';
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

// `mode` distinguishes a brand-new link (`'new'`, needs a token exchange on
// success) from a reconnect (`'reconnect'`, needs only a status clear) so
// the resume handler knows which to run without holding any other page's
// component state - it may run after the app was killed and relaunched by
// the OS partway through the bank's own OAuth login.
export function savePendingBankLink({ link_token, mode, connected_account_id }, storage = defaultStorage()) {
  try {
    storage?.setItem(PENDING_LINK_KEY, JSON.stringify({
      link_token, mode, connected_account_id: connected_account_id || null, savedAt: Date.now(),
    }));
  } catch { /* Storage can be unavailable (private mode); the in-page flow still completes fine. */ }
}

export function loadPendingBankLink(storage = defaultStorage()) {
  try {
    const raw = storage?.getItem(PENDING_LINK_KEY);
    if (!raw) return null;
    const pending = JSON.parse(raw);
    if (!pending?.link_token || (pending.mode !== 'new' && pending.mode !== 'reconnect')) return null;
    if (!Number.isFinite(pending.savedAt) || Date.now() - pending.savedAt > PENDING_LINK_MAX_AGE_MS) return null;
    return pending;
  } catch { return null; }
}

export function clearPendingBankLink(storage = defaultStorage()) {
  try { storage?.removeItem(PENDING_LINK_KEY); } catch { /* best effort */ }
}

// Accounts to auto-sync once something is mounted that can actually run
// syncAccount (BankSync.jsx) - set by whichever flow (in-page or native
// resume) just finished linking, consumed exactly once on mount.
export function markPendingAutoSync(entries, storage = defaultStorage()) {
  try { storage?.setItem(PENDING_SYNC_KEY, JSON.stringify(entries)); } catch { /* best effort */ }
}

export function takePendingAutoSync(storage = defaultStorage()) {
  try {
    const raw = storage?.getItem(PENDING_SYNC_KEY);
    storage?.removeItem(PENDING_SYNC_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list.filter(e => e && typeof e.id === 'string') : [];
  } catch { return []; }
}

// Exchanges a fresh public_token for a real connection. Shared so the
// in-page onSuccess and the native resume handler make the identical call.
export async function exchangeNewBankLink({ base44, public_token, metadata }) {
  const res = await base44.functions.invoke('plaidExchangeToken', {
    public_token,
    institution_name: metadata?.institution?.name || 'Bank',
    accounts: metadata?.accounts,
  });
  return res?.accounts || [];
}

// Update-mode success re-authenticates the SAME item - no new public_token
// to exchange, just clear the stuck status so Sync (and auto-sync) can run.
export async function finishReconnectBankLink({ base44, id }) {
  await base44.entities.ConnectedAccount.update(id, { sync_status: 'connected', error_message: null });
}
