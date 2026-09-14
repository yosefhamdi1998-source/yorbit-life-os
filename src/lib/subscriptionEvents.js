export const SUBSCRIPTION_CHANGED = 'yorbit:subscription-changed';

export function refreshSubscriptionStatus() {
  window.dispatchEvent(new Event(SUBSCRIPTION_CHANGED));
}
