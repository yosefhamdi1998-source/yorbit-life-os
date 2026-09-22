function amount(value) {
  return value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value)) ? Number(value) : null;
}
export function formatHoldingValue(value, currency) {
  const n = amount(value);
  if (n === null) return 'Value unavailable';
  const code = typeof currency === 'string' ? currency.trim().toUpperCase() : '';
  const number = n.toLocaleString('en-US', { maximumFractionDigits: 8 });
  if (!code) return number + ' (currency not reported)';
  // Explicit codes avoid confusing USD with CAD/AUD, and work for crypto.
  return code + ' ' + number;
}
export function formatHoldingsTotals(holdings) {
  const totals = new Map();
  let unavailable = false;
  for (const h of holdings) {
    const n = amount(h.institution_value);
    const code = typeof h.currency === 'string' ? h.currency.trim().toUpperCase() : '';
    if (n === null || !code) { unavailable = true; continue; }
    totals.set(code, (totals.get(code) || 0) + n);
  }
  const values = [...totals].sort(([a], [b]) => a.localeCompare(b)).map(([code, value]) => formatHoldingValue(value, code));
  if (unavailable) values.push('Some values unavailable');
  return values.join(' · ');
}
export async function loadVisibleHoldings(entities) {
  const [holdings, accounts] = await Promise.all([
    entities.InvestmentHolding.list('-institution_value'), entities.ConnectedAccount.list(),
  ]);
  const ids = new Set(accounts.filter(a => a.sync_status !== 'disconnected').map(a => a.id));
  return holdings.filter(h => ids.has(h.connected_account_id));
}
