// Auth callbacks accept only PKCE codes. Tokens and arbitrary redirect paths are never trusted.
export const NATIVE_AUTH_REDIRECT = 'app.yorbit://auth/callback';
export function parseNativeAuthUrl(value) {
  let url;
  try { url = new URL(value); } catch { return null; }
  if (url.protocol !== 'app.yorbit:' || url.hostname !== 'auth' || url.pathname !== '/callback' || url.username || url.password || url.port) return null;
  const codes = url.searchParams.getAll('code');
  if (url.hash || codes.length !== 1 || !codes[0].trim() || codes[0].length > 4096 || url.searchParams.has('error') || url.searchParams.has('access_token') || url.searchParams.has('refresh_token')) return { invalid: true };
  return { code: codes[0] };
}

export function createNativeAuthHandler({ exchange, navigate, closeBrowser, onError }) {
  const handled = new Set();
  let queue = Promise.resolve();
  return (value) => {
    const callback = parseNativeAuthUrl(value);
    if (!callback) return Promise.resolve();
    if (callback.invalid) { onError(); return Promise.resolve(); }
    // App.getLaunchUrl and appUrlOpen can report the same one-use code.
    if (handled.has(callback.code)) return queue;
    handled.add(callback.code);
    queue = queue.then(async () => {
      try {
        const { data, error } = await exchange(callback.code);
        if (error || !data?.session?.user?.id) throw new Error('Unconfirmed session');
        // Recovery comes from the local PKCE verifier, never a URL-supplied type.
        navigate(data.redirectType === 'recovery' ? '/reset-password' : '/');
        try { await closeBrowser(); } catch { /* Email links may have no plugin browser open. */ }
      } catch { onError(); }
    });
    return queue;
  };
}
