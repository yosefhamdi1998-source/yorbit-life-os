// Keep the web checkout and webhook on the same product mapping.
export const PRICE_TO_PLAN: Record<string, string> = {
  price_1Tp0ZJCvjMbso8E2tQSWOW8X: 'pro_monthly',
  price_1Tp0ZMCvjMbso8E2xyERKi7E: 'pro_yearly',
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
