// Only display and purchase the configured recurring product for this plan.
const PERIODS = { monthly: 'P1M', yearly: 'P1Y' };
const PACKAGES = { monthly: '$rc_monthly', yearly: '$rc_annual' };
export function getNativePlan(offerings, plan) {
  if (!PERIODS[plan]) return null;
  const packages = offerings?.current?.availablePackages;
  if (!Array.isArray(packages)) return null;
  const pkg = packages.find(item => item.identifier === PACKAGES[plan]);
  const product = pkg?.product;
  if (product?.identifier !== 'app.yorbit.pro.' + plan || product?.subscriptionPeriod !== PERIODS[plan]) return null;
  if (typeof product.priceString !== 'string' || !product.priceString.trim()) return null;
  return { pkg, amount: product.priceString };
}
