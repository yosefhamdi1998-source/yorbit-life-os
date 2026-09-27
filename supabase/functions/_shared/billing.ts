// Keep the web checkout and webhook on the same product mapping.

// Live-mode prices on the Yorbit Stripe account. Test mode (or a Stripe
// sandbox) has its own price ids, so a test key must be paired with
// STRIPE_PRICE_PRO_MONTHLY and STRIPE_PRICE_PRO_YEARLY; without them billing
// stays off instead of sending live price ids to test mode. The web app sends
// a plan name, never a price id, so it works unchanged in either mode.
export const LIVE_PRICES: Record<string, string> = {
  pro_monthly: 'price_1UDXISA4mvP1HWCKCxoL3PcL',
  pro_yearly: 'price_1UDXJiA4mvP1HWCKDQ18B5bX',
};

export const CHECKOUT_PLANS: Record<string, string> = { monthly: 'pro_monthly', yearly: 'pro_yearly' };

export function stripeMode(key: string | undefined): 'live' | 'test' | null {
  if (/^(sk|rk)_live_/.test(key ?? '')) return 'live';
  if (/^(sk|rk)_test_/.test(key ?? '')) return 'test';
  return null;
}

// plan -> price id for the key's mode, or null when billing isn't fully
// configured for that mode.
export function billingPrices(key: string | undefined, env: (name: string) => string | undefined): Record<string, string> | null {
  const mode = stripeMode(key);
  if (!mode) return null;
  const monthly = env('STRIPE_PRICE_PRO_MONTHLY')?.trim();
  const yearly = env('STRIPE_PRICE_PRO_YEARLY')?.trim();
  if (monthly || yearly) return monthly && yearly ? { pro_monthly: monthly, pro_yearly: yearly } : null;
  return mode === 'live' ? { ...LIVE_PRICES } : null;
}

// The live site runs whatever key is configured, so while it holds a test key
// anyone could otherwise "subscribe" with Stripe's public test card and get
// Pro free. Test-mode checkout is limited to STRIPE_TEST_CHECKOUT_EMAILS:
// comma-separated exact addresses or @domain suffixes. Unset = nobody.
export function checkoutAllowed(key: string | undefined, email: string | undefined, env: (name: string) => string | undefined): boolean {
  const mode = stripeMode(key);
  if (mode !== 'test') return mode === 'live';
  const address = (email ?? '').trim().toLowerCase();
  if (!address.includes('@')) return false;
  return (env('STRIPE_TEST_CHECKOUT_EMAILS') ?? '').split(',').map(entry => entry.trim().toLowerCase()).filter(Boolean)
    .some(entry => entry.startsWith('@') ? address.endsWith(entry) : address === entry);
}

export function planForPrice(prices: Record<string, string>, priceId: string | undefined): string | undefined {
  return Object.keys(prices).find(plan => prices[plan] === priceId);
}

export function validCheckoutReturn(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    if (url.username || url.password) return false;
    return url.origin === 'https://yorbit-life-os.vercel.app' ||
      (url.origin === 'https://yosefhamdi1998-source.github.io' && url.pathname.startsWith('/yorbit-life-os/'));
  } catch { return false; }
}
