import fs from 'node:fs';
import assert from 'node:assert/strict';
let calls=0;
const info={entitlements:{active:{pro:{}}},activeSubscriptions:['yearly']};
globalThis.__revenuecatTest={configure:async()=>{calls++;},getOfferings:async()=>({all:{},current:{id:'test'}}),getCustomerInfo:async()=>({customerInfo:info}),restorePurchases:async()=>({customerInfo:info}),purchasePackage:async()=>({customerInfo:info})};
const source=fs.readFileSync('src/lib/revenuecat.js','utf8').replace(/^import .*;\r?\n/gm,'');
const prelude="const Purchases=globalThis.__revenuecatTest; const PURCHASES_ERROR_CODE={PURCHASE_CANCELLED_ERROR:'1'}; const REVENUECAT_API_KEY='test'; const ENTITLEMENT='pro'; const SUBSCRIPTION_PRODUCTS={yearly:'yearly',monthly:'monthly'}; const isNativeIOS=()=>true;";
const api=await import('data:text/javascript;base64,'+Buffer.from(prelude+source).toString('base64'));
await Promise.all([api.getOfferings(),api.getOfferings()]);
assert.equal(calls,1,'Concurrent callers configure only once');
assert.deepEqual(await api.checkProEntitlement(),{isPro:true,plan:'pro_yearly'});
assert.equal((await api.restorePurchases()).isPro,true,'Restore remains available after initialization');
assert.equal((await api.purchasePackage({})).plan,'pro_yearly');
for (const cancellation of [{code:'1'}, {code:1}, {userCancelled:true}]) {
  globalThis.__revenuecatTest.purchasePackage = async () => { throw cancellation; };
  assert.deepEqual(await api.purchasePackage({}), {error:null,cancelled:true});
}
globalThis.__revenuecatTest.purchasePackage = async () => { throw {code:'2'}; };
assert.ok((await api.purchasePackage({})).error, 'Non-cancellation errors remain errors');
delete globalThis.__revenuecatTest;
console.log('PASS: RevenueCat repeated calls, concurrent initialization, annual entitlement, and restore');

// Exercise the actual screen handler: successful SDK completion is not
// sufficient to promise access when the Pro entitlement is missing.
const { getNativePlan } = await import('data:text/javascript;base64,' + Buffer.from(fs.readFileSync('src/lib/nativePlans.js','utf8')).toString('base64'));
const annualProduct = {identifier:'app.yorbit.pro.yearly', subscriptionPeriod:'P1Y', priceString:'29,99 €'};
const availableOffering = {current:{availablePackages:[{identifier:'$rc_annual', product:annualProduct}]}};
assert.equal(getNativePlan(availableOffering,'yearly').amount, '29,99 €');
assert.equal(getNativePlan(availableOffering,'monthly'), null);
assert.equal(getNativePlan(null,'yearly'), null);
assert.equal(getNativePlan({current:{availablePackages:{}}},'yearly'), null);
for (const product of [{...annualProduct,subscriptionPeriod:'P1W'}, {...annualProduct,identifier:'other'}, {...annualProduct,priceString:''}]) {
  assert.equal(getNativePlan({current:{availablePackages:[{identifier:'$rc_annual', product}]}},'yearly'), null);
}
const upgradeSource = fs.readFileSync('src/pages/Upgrade.jsx', 'utf8');
const handlerBody = upgradeSource.match(/const handleIOSPurchase = async \(\) => \{([\s\S]*?)\n  \};/);
assert.ok(handlerBody, 'Native purchase handler must be available for regression coverage');
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const runPurchase = new AsyncFunction('iosOfferings', 'plan', 'toast', 'setLoading', 'purchasePackage', 'navigate', 'getNativePlan', handlerBody[1]);
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
    availableOffering,
    'yearly', message => messages.push(message), value => loadingStates.push(value),
    async () => result, destination => destinations.push(destination), getNativePlan,
  );
  assert.deepEqual(destinations, expectedNavigation);
  assert.equal(messages[0]?.title ?? null, expectedTitle);
  assert.equal(messages.length, expectedTitle ? 1 : 0);
  assert.deepEqual(loadingStates, [true, false]);
}
console.log('PASS: native purchase screen confirms access only with Pro entitlement; cancellation stays quiet');

// Execute the actual offering effect with a controlled timer and deferred SDK response.
const effectBody = upgradeSource.match(/useEffect\(\(\) => \{([\s\S]*?)\n  \}, \[offeringsAttempt\]\);/);
assert.ok(effectBody);
const runEffect = new Function('isNativeIOS','getOfferings','getNativePlan','setOfferingsFailed','setIosOfferings','setPlan','setTimeout','clearTimeout',effectBody[1]);
async function offeringEffectCase(cleanupFirst) {
  let resolve;
  let deadline;
  const failures=[];
  const loaded=[];
  const pending=new Promise(done=>{resolve=done;});
  const cleanup=runEffect(()=>true,()=>pending,getNativePlan,value=>failures.push(value),value=>loaded.push(value),()=>{},callback=>{deadline=callback;return 1;},()=>{});
  if(cleanupFirst) cleanup(); else deadline();
  resolve(availableOffering);
  await pending;
  await Promise.resolve();
  if(cleanupFirst) { assert.deepEqual(failures,[false]); assert.deepEqual(loaded,[null]); }
  else { assert.deepEqual(failures,[false,true,false]); assert.equal(loaded.at(-1),availableOffering); cleanup(); }
}
await offeringEffectCase(false);
await offeringEffectCase(true);
console.log('PASS: late successful offerings clear timeout errors; disposed requests cannot overwrite current state');

// Unexpected bridge rejections must release the screen lock without claiming payment failed definitively.
const rejectedMessages=[];
const rejectedLoading=[];
await runPurchase(availableOffering,'yearly',m=>rejectedMessages.push(m),v=>rejectedLoading.push(v),async()=>{throw new Error('Bridge unavailable');},()=>{throw new Error('Unexpected navigation');},getNativePlan);
assert.deepEqual(rejectedLoading,[true,false]);
assert.match(rejectedMessages[0].description,/Restore Purchases/);
const restoreBody=upgradeSource.match(/const handleRestore = async \(\) => \{([\s\S]*?)\n  \};/);
assert.ok(restoreBody);
const runRestore=new AsyncFunction('setRestoring','restorePurchases','toast','navigate',restoreBody[1]);
for(const [result,title,route] of [
  [{isPro:true,error:null},'Pro restored! 🎉','/settings'],
  [{isPro:false,error:null},'No purchases found',null],
  [{error:'Synthetic error'},'Restore failed',null],
  [null,'Restore failed',null],
]) {
  const states=[],messages=[],routes=[];
  await runRestore(v=>states.push(v),async()=>{if(result===null)throw new Error('Bridge unavailable');return result;},m=>messages.push(m),r=>routes.push(r));
  assert.deepEqual(states,[true,false]);
  assert.equal(messages[0].title,title);
  assert.deepEqual(routes,route?[route]:[]);
}
console.log('PASS: purchase and restore bridge rejections release controls; restore confirms only active entitlement');

const settingsSource=fs.readFileSync('src/pages/Settings.jsx','utf8');
const settingsRestoreBody=settingsSource.match(/const handleRestoreIOS = async \(\) => \{([\s\S]*?)\n  \};/);
assert.ok(settingsRestoreBody);
const runSettingsRestore=new AsyncFunction('setRestoring','rcRestorePurchases','toast',settingsRestoreBody[1]);
for(const [result,title] of [[{isPro:true,error:null},'Pro restored! 🎉'],[{isPro:false,error:null},'No purchases found'],[{error:'Returned error'},'Restore failed'],[null,'Restore failed']]) {
 const states=[],messages=[];
 await runSettingsRestore(v=>states.push(v),async()=>{if(result===null)throw new Error('SDK rejection');return result;},m=>messages.push(m));
 assert.deepEqual(states,[true,false]);
 assert.equal(messages[0].title,title);
}
console.log('PASS: Settings restore releases controls for returned and thrown errors, and only confirms active Pro');
