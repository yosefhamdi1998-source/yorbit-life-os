import fs from 'node:fs';
import assert from 'node:assert/strict';

const source = fs.readFileSync('src/lib/revenuecat.js', 'utf8').replace(/^import .*;\r?\n/gm, '');
let sequence = 0;
async function harness() {
  const state = { userId: 'account-a', sdkId: null, calls: [], failLogin: false, failConfigure: false };
  const customer = () => ({ customerInfo: { entitlements: { active: state.sdkId === 'account-a' ? { pro: {} } : {} }, activeSubscriptions: ['yearly'] } });
  const sdk = {
    configure: async options => { state.calls.push(['configure', options.appUserID]); if(state.failConfigure) throw new Error('Unavailable'); state.sdkId = options.appUserID; },
    logIn: async options => { state.calls.push(['login', options.appUserID]); state.sdkId = options.appUserID; if(state.failLogin) throw new Error('Unavailable'); },
    getCustomerInfo: async () => { state.calls.push(['info', state.sdkId]); return customer(); },
    getOfferings: async () => ({ current: {} }),
    purchasePackage: async () => { state.calls.push(['purchase', state.sdkId]); return customer(); },
    restorePurchases: async () => { state.calls.push(['restore', state.sdkId]); return customer(); },
  };
  const key = `__purchaseIdentity${sequence++}`;
  globalThis[key] = { sdk, auth: { getSession: async () => ({data:{session:state.userId ? {user:{id:state.userId}} : null}}) } };
  const prelude = `const {sdk:Purchases,auth}=globalThis.${key}; const supabase={auth}; const PURCHASES_ERROR_CODE={PURCHASE_CANCELLED_ERROR:'1'}; const REVENUECAT_API_KEY='test'; const ENTITLEMENT='pro'; const SUBSCRIPTION_PRODUCTS={yearly:'yearly',monthly:'monthly'}; const isNativeIOS=()=>true;`;
  const api = await import('data:text/javascript;base64,' + Buffer.from(prelude + source).toString('base64'));
  return { state, sdk, api };
}
{
  const {state,api} = await harness();
  assert.equal((await api.checkProEntitlement()).isPro, true);
  assert.deepEqual(state.calls[0], ['configure','account-a']);
  state.userId = 'account-b';
  assert.equal((await api.checkProEntitlement()).isPro, false);
  assert.deepEqual(state.calls.slice(-2), [['login','account-b'],['info','account-b']]);
  state.userId = null;
  const count = state.calls.length;
  assert.ok((await api.purchasePackage({})).error);
  assert.ok((await api.restorePurchases()).error);
  assert.equal(state.calls.length, count, 'Signed-out calls never reach SDK');
}
{
  const {state,api} = await harness();
  await api.getOfferings();
  state.userId = 'account-b'; state.failLogin = true;
  assert.ok((await api.purchasePackage({})).error);
  assert.ok(!state.calls.some(([name]) => name === 'purchase'));
  state.failLogin = false;
  state.userId = 'account-a';
  assert.equal((await api.checkProEntitlement()).isPro, true, 'Failed login cannot leave an assumed SDK identity');
  state.userId = 'account-b';
  assert.equal((await api.purchasePackage({})).isPro, false);
  assert.deepEqual(state.calls.at(-1), ['purchase','account-b']);
}
{
  const {state,sdk,api} = await harness();
  let release, entered;
  const started = new Promise(resolve => { entered=resolve; });
  sdk.getCustomerInfo = async () => { entered(); return new Promise(resolve => { release=resolve; }); };
  const oldStatus = api.checkProEntitlement();
  await started;
  const queuedPurchase = api.purchasePackage({});
  await Promise.resolve(); await Promise.resolve();
  state.userId = 'account-b';
  release({customerInfo:{entitlements:{active:{pro:{}}},activeSubscriptions:['yearly']}});
  assert.equal((await oldStatus).isPro, false, 'Old account entitlement discarded');
  assert.ok((await queuedPurchase).error);
  assert.ok(!state.calls.some(([name]) => name === 'purchase'), 'Stale queued purchase blocked');
  assert.equal((await api.restorePurchases()).isPro, false, 'Queue recovers for new account');
}
{
  const {state,sdk,api} = await harness();
  sdk.purchasePackage = async () => { state.userId=null; return {customerInfo:{entitlements:{active:{pro:{}}}}}; };
  assert.ok((await api.purchasePackage({})).error, 'Sign-out during purchase cannot confirm access');
}
{
  const {state,api} = await harness();
  state.failConfigure=true;
  assert.equal(await api.getOfferings(), null);
  state.failConfigure=false;
  assert.ok(await api.getOfferings(), 'Failed initialization can retry');
}
console.log('PASS: native account identity, switch failure, queued purchase isolation, sign-out and initialization recovery');

// Execute the real hook with controlled React primitives and deferred requests.
const hookSource = fs.readFileSync('src/hooks/useProStatus.js','utf8').replace(/^import .*;\r?\n/gm,'').replace('export function','function');
for (const native of [false,true]) {
  let stored=null, effect, auth={user:{id:'account-a'},isAuthenticated:true};
  const pending=[];
  const request=()=>new Promise(resolve=>pending.push(resolve));
  const hook=new Function('useState','useEffect','useAuth','base44','isNativeIOS','checkProEntitlement','window','SUBSCRIPTION_CHANGED',hookSource+'; return useProStatus;')(
    ()=>[stored,value=>{stored=value;}], callback=>{effect=callback;}, ()=>auth,
    {entities:{Subscription:{list:request}}}, ()=>native,request,{addEventListener(){},removeEventListener(){}},'yorbit:subscription-changed',
  );
  const response=pro=>native?{isPro:pro,plan:pro?'pro_yearly':'free'}:pro?[{status:'active',plan:'pro_yearly'}]:[];
  assert.equal(hook().loading,true);
  const disposeA=effect(); pending.shift()(response(true));
  await Promise.resolve(); await Promise.resolve();
  assert.equal(hook().isPro,true);
  auth={user:{id:'account-b'},isAuthenticated:true};
  disposeA();
  assert.equal(hook().isPro,false,'Previous account access masked before effect');
  const disposeB=effect();
  auth={user:null,isAuthenticated:false}; disposeB();
  pending.shift()(response(true)); await Promise.resolve(); await Promise.resolve();
  assert.deepEqual(hook(),{isPro:false,plan:'free',loading:false});
}
console.log('PASS: web and native Pro hook masks account changes immediately and discards disposed results');

for (const native of [false,true]) {
  let stored=null, effect;
  const listeners=new Map(), pending=[];
  const request=()=>new Promise((resolve,reject)=>pending.push({resolve,reject}));
  const fakeWindow={addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:(name,fn)=>{if(listeners.get(name)===fn)listeners.delete(name);}};
  const hook=new Function('useState','useEffect','useAuth','base44','isNativeIOS','checkProEntitlement','window','SUBSCRIPTION_CHANGED',hookSource+'; return useProStatus;')(
    ()=>[stored,value=>{stored=value;}], callback=>{effect=callback;}, ()=>({user:{id:'account-a'},isAuthenticated:true}),
    {entities:{Subscription:{list:request}}}, ()=>native,request,fakeWindow,'yorbit:subscription-changed',
  );
  const response=pro=>native?{isPro:pro,plan:pro?'pro_yearly':'free'}:pro?[{status:'active',plan:'pro_yearly'}]:[];
  hook(); const dispose=effect();
  pending.shift().resolve(response(false)); await Promise.resolve(); await Promise.resolve();
  assert.equal(hook().isPro,false);
  listeners.get('yorbit:subscription-changed')();
  assert.equal(hook().loading,true);
  pending.shift().resolve(response(true)); await Promise.resolve(); await Promise.resolve();
  assert.equal(hook().isPro,true,'Restore notification rechecks access without navigation');
  listeners.get('focus')();
  const older=pending.shift();
  listeners.get('yorbit:subscription-changed')();
  pending.shift().resolve(response(false)); await Promise.resolve(); await Promise.resolve();
  older.resolve(response(true)); await Promise.resolve(); await Promise.resolve();
  assert.equal(hook().isPro,false,'Older request cannot overwrite newer status');
  listeners.get('focus')(); pending.shift().reject(new Error('Synthetic network failure'));
  await Promise.resolve(); await Promise.resolve();
  assert.deepEqual(hook(),{isPro:false,plan:'free',loading:false});
  dispose(); assert.equal(listeners.size,0,'Listeners removed on disposal');
}
console.log('PASS: restore/status retry and window return refresh access; latest request wins and failed checks release loading');
