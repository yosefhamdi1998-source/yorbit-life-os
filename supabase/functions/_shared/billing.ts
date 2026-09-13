// Keep the web checkout and webhook on the same product mapping.
export const PRICE_TO_PLAN: Record<string, string> = {
  price_1UDXISA4mvP1HWCKCxoL3PcL: 'pro_monthly',
  price_1UDXJiA4mvP1HWCKDQ18B5bX: 'pro_yearly',
};

export function validCheckoutReturn(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    if (url.username || url.password) return false;
    return url.origin === 'https://yorbit-life-os.vercel.app' ||
      (url.origin === 'https://yosefhamdi1998-source.github.io' && url.pathname.startsWith('/yorbit-life-os/'));
  } catch { return false; }
}
