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
    const result = await operation({ assertSameAccount, userId: requestedUserId });
    await assertSameAccount();
    return result;
  });
  operationQueue = run.catch(() => {});
  return run;
}

// The SDK can confirm Apple's purchase before the server sees it. Bound this
// check so a network outage never traps the screen or suggests buying twice.
async function syncServerEntitlement(userId) {
  const controller = new AbortController();
  let timer;
  try {
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    const session = sessionData?.session;
    if (sessionError || session?.user?.id !== userId || !session.access_token) return false;
    const deadline = new Promise(resolve => {
      timer = setTimeout(() => { controller.abort(); resolve(false); }, 8000);
    });
    const confirmation = supabase.functions.invoke('revenuecat-sync', {
      body: {}, signal: controller.signal,
      // Bind the request to the account that completed the SDK operation.
      headers: { Authorization: `Bearer ${session.access_token}` },
    }).then(({ data, error }) => !error && data?.isPro === true &&
      ['pro_monthly', 'pro_yearly'].includes(data.plan)).catch(() => false);
    return await Promise.race([confirmation, deadline]);
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

async function completePurchase(operation) {
  return withCurrentAccount(async ({ assertSameAccount, userId }) => {
    const { customerInfo } = await operation();
    await assertSameAccount();
    const isPro = !!customerInfo.entitlements?.active?.[ENTITLEMENT];
    const serverConfirmed = await syncServerEntitlement(userId);
    return {
      isPro, plan: isPro ? detectPlanFromPurchases(customerInfo) : 'free',
      serverSyncPending: isPro && !serverConfirmed, error: null,
    };
  });
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
    return await completePurchase(() => Purchases.purchasePackage({ aPackage: pkg }));
  } catch (err) {
    if (String(err?.code) === PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR || err?.userCancelled === true) {
      return { error: null, cancelled: true };
    }
    return { error: 'Purchase access could not be confirmed for your current account. Sign in again and use Restore Purchases before buying again.' };
  }
}

export async function restorePurchases() {
  try {
    return await completePurchase(() => Purchases.restorePurchases());
  } catch {
    return { isPro: false, plan: 'free', error: 'Could not restore purchases. Please try again.' };
  }
}
