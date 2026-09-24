import { NATIVE_BANK_LINK_REDIRECT_URI } from './plaidLink.js';

const expected = new URL(NATIVE_BANK_LINK_REDIRECT_URI);

// Plaid appends oauth_state_id to the redirect_uri once the bank's own OAuth
// login completes; nothing else about this URL is trusted. The exact
// host+path match is the only reason the OS ever hands a URL back to this
// app at all - it must equal what's registered with Plaid and, natively,
// with Apple/Google as a universal/app link.
export function parseNativeBankLinkUrl(value) {
  let url;
  try { url = new URL(value); } catch { return null; }
  if (url.protocol !== expected.protocol || url.host !== expected.host || url.pathname !== expected.pathname || url.username || url.password) return null;
  const ids = url.searchParams.getAll('oauth_state_id');
  if (ids.length !== 1 || !ids[0].trim() || ids[0].length > 4096) return { invalid: true };
  return { oauthStateId: ids[0] };
}

export function createNativeBankLinkHandler({ resume, onError }) {
  const handled = new Set();
  let queue = Promise.resolve();
  return (value) => {
    const callback = parseNativeBankLinkUrl(value);
    if (!callback) return Promise.resolve();
    if (callback.invalid) { onError(); return Promise.resolve(); }
    // App.getLaunchUrl and appUrlOpen can report the same one-use redirect.
    if (handled.has(callback.oauthStateId)) return queue;
    handled.add(callback.oauthStateId);
    queue = queue.then(async () => {
      try { await resume(value); }
      catch { onError(); }
    });
    return queue;
  };
}
