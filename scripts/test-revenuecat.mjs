import fs from 'node:fs';
import assert from 'node:assert/strict';
let calls=0;
const info={entitlements:{active:{pro:{}}},activeSubscriptions:['yearly']};
globalThis.__revenuecatTest={configure:async()=>{calls++;},getOfferings:async()=>({all:{},current:{id:'test'}}),getCustomerInfo:async()=>({customerInfo:info}),restorePurchases:async()=>({customerInfo:info}),purchasePackage:async()=>({customerInfo:info})};
const source=fs.readFileSync('src/lib/revenuecat.js','utf8').replace(/^import .*;\r?\n/gm,'');
const prelude="const Purchases=globalThis.__revenuecatTest; const REVENUECAT_API_KEY='test'; const ENTITLEMENT='pro'; const SUBSCRIPTION_PRODUCTS={yearly:'yearly',monthly:'monthly'}; const isNativeIOS=()=>true;";
const api=await import('data:text/javascript;base64,'+Buffer.from(prelude+source).toString('base64'));
await Promise.all([api.getOfferings(),api.getOfferings()]);
assert.equal(calls,1,'Concurrent callers configure only once');
assert.deepEqual(await api.checkProEntitlement(),{isPro:true,plan:'pro_yearly'});
assert.equal((await api.restorePurchases()).isPro,true,'Restore remains available after initialization');
assert.equal((await api.purchasePackage({})).plan,'pro_yearly');
delete globalThis.__revenuecatTest;
console.log('PASS: RevenueCat repeated calls, concurrent initialization, annual entitlement, and restore');

// Exercise the actual screen handler: successful SDK completion is not
// sufficient to promise access when the Pro entitlement is missing.
const upgradeSource = fs.readFileSync('src/pages/Upgrade.jsx', 'utf8');
const handlerBody = upgradeSource.match(/const handleIOSPurchase = async \(\) => \{([\s\S]*?)\n  \};/);
assert.ok(handlerBody, 'Native purchase handler must be available for regression coverage');
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const runPurchase = new AsyncFunction('iosOfferings', 'plan', 'toast', 'setLoading', 'purchasePackage', 'navigate', handlerBody[1]);
for (const [result, expectedTitle, expectedNavigation] of [
  [{ isPro: true, error: null }, 'Welcome to Yorbit Pro! 🎉', ['/settings']],
  [{ isPro: false, error: null }, 'Pro access not confirmed', []],
  [{ cancelled: true, error: null }, null, []],
  [{ error: 'Synthetic purchase error' }, 'Purchase failed', []],
]) {
  const messages = [];
  const destinations = [];
  const loadingStates = [];
  await runPurchase(
    { current: { availablePackages: [{ identifier: '$rc_annual' }] } },
    'yearly', message => messages.push(message), value => loadingStates.push(value),
    async () => result, destination => destinations.push(destination),
  );
  assert.deepEqual(destinations, expectedNavigation);
  assert.equal(messages[0]?.title ?? null, expectedTitle);
  assert.equal(messages.length, expectedTitle ? 1 : 0);
  assert.deepEqual(loadingStates, [true, false]);
}
console.log('PASS: native purchase screen confirms access only with Pro entitlement; cancellation stays quiet');
