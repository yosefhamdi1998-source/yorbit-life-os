import { Purchases, PURCHASES_ERROR_CODE } from '@revenuecat/purchases-capacitor';
import { REVENUECAT_API_KEY, ENTITLEMENT, SUBSCRIPTION_PRODUCTS } from '@/lib/appStoreConfig';
import { isNativeIOS } from '@/lib/platform';
import { supabase } from '@/api/supabaseClient';

let configured = false;
let configuredUserId;
let operationQueue = Promise.resolve();

async function currentUserId() {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data?.session?.user?.id) throw new Error('Sign in to your Yorbit account before using purchases.');
  return data.session.user.id;
}

// Serialize identity changes with SDK calls: a queued purchase must never run
// under a different account, and an old result must not unlock a new session.
async function withCurrentAccount(operation) {
  if (!isNativeIOS() || !REVENUECAT_API_KEY) throw new Error('Purchases are not available on this device.');
  const requestedUserId = await currentUserId();
  const run = operationQueue.then(async () => {
    const assertSameAccount = async () => {
      if (await currentUserId() !== requestedUserId) throw new Error('Your account changed. Reopen purchases and try again.');
    };
    await assertSameAccount();
    if (!configured) {
      await Purchases.configure({ apiKey: REVENUECAT_API_KEY, appUserID: requestedUserId });
      configured = true;
      configuredUserId = requestedUserId;
    } else if (configuredUserId !== requestedUserId) {
      // Direct identified-to-identified login avoids creating an anonymous user.
      configuredUserId = undefined;
      await Purchases.logIn({ appUserID: requestedUserId });
      configuredUserId = requestedUserId;
    }
    await assertSameAccount();
    const result = await operation();
    await assertSameAccount();
    return result;
  });
  operationQueue = run.catch(() => {});
  return run;
}

export async function getOfferings() {
  try {
    const { all, current } = await withCurrentAccount(() => Purchases.getOfferings());
    return { all, current };
  } catch {
    return null;
  }
}

export async function checkProEntitlement() {
  try {
    const { customerInfo } = await withCurrentAccount(() => Purchases.getCustomerInfo());
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
    if (s === SUBSCRIPTION_PRODUCTS.yearly) return 'pro_yearly';
    if (s === SUBSCRIPTION_PRODUCTS.monthly) return 'pro_monthly';
  }
  return 'pro_monthly';
}

export async function purchasePackage(pkg) {
  try {
    const { customerInfo } = await withCurrentAccount(() => Purchases.purchasePackage({ aPackage: pkg }));
    const isPro = !!customerInfo.entitlements?.active?.[ENTITLEMENT];
    const plan = isPro ? detectPlanFromPurchases(customerInfo) : 'free';
    return { isPro, plan, error: null };
  } catch (err) {
    if (String(err?.code) === PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR || err?.userCancelled === true) {
      return { error: null, cancelled: true };
    }
    return { error: 'Purchase access could not be confirmed for your current account. Sign in again and use Restore Purchases before buying again.' };
  }
}

export async function restorePurchases() {
  try {
    const { customerInfo } = await withCurrentAccount(() => Purchases.restorePurchases());
    const isPro = !!customerInfo.entitlements?.active?.[ENTITLEMENT];
    const plan = isPro ? detectPlanFromPurchases(customerInfo) : 'free';
    return { isPro, plan, error: null };
  } catch {
    return { isPro: false, plan: 'free', error: 'Could not restore purchases. Please try again.' };
  }
}
