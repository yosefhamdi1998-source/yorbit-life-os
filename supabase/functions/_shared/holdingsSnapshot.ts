// Reject partial or malformed provider responses before replacing any saved data.
export function buildHoldingsSnapshot(data: any, providerAccountId: string) {
  if (!providerAccountId || !Array.isArray(data?.accounts) ||
      !data.accounts.some((a: any) => a.account_id === providerAccountId) ||
      !Array.isArray(data.holdings) || !Array.isArray(data.securities)) {
    throw new Error('Bank did not return a complete account snapshot');
  }
  const securities = new Map(data.securities.map((s: any) => [s.security_id, s]));
  const seen = new Set();
  return data.holdings.filter((h: any) => h.account_id === providerAccountId).map((h: any) => {
    const security: any = securities.get(h.security_id);
    const currency = h.iso_currency_code || h.unofficial_currency_code;
    if (!h.security_id || seen.has(h.security_id) || !security?.name ||
        !Number.isFinite(h.quantity) || !Number.isFinite(h.institution_value) || !currency) {
      throw new Error('Bank returned an incomplete holding');
    }
    seen.add(h.security_id);
    return { provider_security_id: h.security_id, security_name: security.name,
      ticker_symbol: security.ticker_symbol || null, quantity: h.quantity,
      institution_value: h.institution_value, currency };
  });
}
