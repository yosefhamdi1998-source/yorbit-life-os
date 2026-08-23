import { Purchases } from '@revenuecat/purchases-capacitor';
import { REVENUECAT_API_KEY, ENTITLEMENT, SUBSCRIPTION_PRODUCTS } from '@/lib/appStoreConfig';
import { isNativeIOS } from '@/lib/platform';

let initialized = false;

async function ensureInit() {
  if (initialized || !isNativeIOS() || !REVENUECAT_API_KEY) return false;
  await Purchases.configure({ apiKey: REVENUECAT_API_KEY });
  initialized = true;
  return true;
}

export async function getOfferings() {
  if (!(await ensureInit())) return null;
  try {
    const { all, current } = await Purchases.getOfferings();
    return { all, current };
  } catch {
    return null;
  }
}

export async function checkProEntitlement() {
  if (!(await ensureInit())) return { isPro: false, plan: 'free' };
  try {
    const { customerInfo } = await Purchases.getCustomerInfo();
    const isPro = !!customerInfo.entitlements?.active?.[ENTITLEMENT];
    const plan = isPro ? detectPlanFromPurchases(customerInfo) : 'free';
    return { isPro, plan };
  } catch {
    return { isPro: false, plan: 'free' };
  }
}

function detectPlanFromPurchases(customerInfo) {
  const subs = customerInfo.activeSubscriptions || [];
  for (const s of subs) {
    if (s.productIdentifier === SUBSCRIPTION_PRODUCTS.yearly) return 'pro_yearly';
    if (s.productIdentifier === SUBSCRIPTION_PRODUCTS.monthly) return 'pro_monthly';
  }
  return 'pro_monthly';
}

export async function purchasePackage(pkg) {
  if (!(await ensureInit())) {
    return { error: 'Purchases are not available on this device.' };
  }
  try {
    const { customerInfo } = await Purchases.purchasePackage({ aPackage: pkg });
    const isPro = !!customerInfo.entitlements?.active?.[ENTITLEMENT];
    const plan = isPro ? detectPlanFromPurchases(customerInfo) : 'free';
    return { isPro, plan, error: null };
  } catch (err) {
    if (err.code === 'PURCHASE_CANCELLED') {
      return { error: null, cancelled: true };
    }
    return { error: 'Purchase could not be completed. Please try again.' };
  }
}

export async function restorePurchases() {
  if (!(await ensureInit())) {
    return { isPro: false, plan: 'free', error: 'Restore is not available on this device.' };
  }
  try {
    const { customerInfo } = await Purchases.restorePurchases();
    const isPro = !!customerInfo.entitlements?.active?.[ENTITLEMENT];
    const plan = isPro ? detectPlanFromPurchases(customerInfo) : 'free';
    return { isPro, plan, error: null };
  } catch {
    return { isPro: false, plan: 'free', error: 'Could not restore purchases. Please try again.' };
  }
}