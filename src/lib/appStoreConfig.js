/**
 * App Store configuration.
 *
 * ACTION REQUIRED before submitting to App Store:
 *   1. Set APP_STORE_ID to your Apple App Store numeric ID
 *      (App Store Connect → App Information → Apple ID)
 *   2. Set REVENUECAT_API_KEY to your RevenueCat PUBLIC API key for Apple
 *      (RevenueCat dashboard → Project Settings → API Keys → Apple public key)
 *   3. In App Store Connect, create two auto-renewable subscriptions:
 *      - com.yoglow.pro.monthly  ($4.99/mo)
 *      - com.yoglow.pro.yearly   ($29.99/yr)
 *   4. In RevenueCat, create an entitlement called "pro" and link both products to it.
 *   5. In RevenueCap, create an offering with monthly ($rc_monthly) and annual ($rc_annual) packages.
 *
 * Without REVENUECAT_API_KEY, iOS subscribe/restore buttons will show "Loading…" indefinitely.
 */
export const APP_STORE_ID = ''; // e.g. '1234567890'
export const REVENUECAT_API_KEY = ''; // e.g. 'appl_xxxxxxxxxxxxxxxxxxxx'

export const APP_STORE_URL = APP_STORE_ID
  ? `https://apps.apple.com/app/id${APP_STORE_ID}`
  : null;

export const SUBSCRIPTION_PRODUCTS = {
  monthly: 'com.yoglow.pro.monthly',
  yearly: 'com.yoglow.pro.yearly',
};

export const ENTITLEMENT = 'pro';