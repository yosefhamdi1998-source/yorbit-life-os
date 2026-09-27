import fs from 'node:fs';
import assert from 'node:assert/strict';
const source = fs.readFileSync('src/lib/revenuecat.js', 'utf8').replace(/^import .*;\r?\n/gm, '');
let sequence = 0;
async function harness() {
  const state = { userId: 'account-a', calls: [], response: { data: { isPro: true, plan: 'pro_yearly' }, error: null } };
  const customer = { customerInfo: { entitlements: { active: { pro: {} } }, activeSubscriptions: ['yearly'] } };
  const sdk = { configure: async () => {}, logIn: async () => {}, purchasePackage: async () => customer, restorePurchases: async () => customer };
  const client = {
    auth: { getSession: async () => ({ data: { session: { user: { id: state.userId }, access_token: 'synthetic-token-' + state.userId } } }) },
    functions: { invoke: async (name, options) => { state.calls.push({ name, options }); return state.response; } },
  };
  const timers = new Map();
  let timerId = 0;
  const key = '__confirmation' + sequence++;
  globalThis[key] = { sdk, client, setTimer: fn => { timers.set(++timerId, fn); return timerId; }, clearTimer: id => timers.delete(id) };
  const prelude = `const {sdk:Purchases,client:supabase,setTimer:setTimeout,clearTimer:clearTimeout}=globalThis.${key}; const PURCHASES_ERROR_CODE={PURCHASE_CANCELLED_ERROR:'1'}; const REVENUECAT_API_KEY='test'; const ENTITLEMENT='pro'; const SUBSCRIPTION_PRODUCTS={yearly:'yearly',monthly:'monthly'}; const isNativeIOS=()=>true;`;
  const api = await import('data:text/javascript;base64,' + Buffer.from(prelude + source).toString('base64'));
  return { state, sdk, client, timers, api };
}
for (const method of ['purchasePackage', 'restorePurchases']) {
  const {state,client,api,timers} = await harness();
  for (const response of [{data:null,error:{message:'offline'}},{data:{isPro:false,plan:'free'},error:null},{data:null,error:null},{data:{isPro:true,plan:'free'},error:null}]) {
    state.response=response;
    const result=await api[method]({});
    assert.equal(result.isPro,true,'SDK purchase must not be reported as lost');
    assert.equal(result.serverSyncPending,true,'No success promise before server confirmation');
    assert.equal(result.error,null,'Do not suggest another charge');
    assert.equal(timers.size,0,'Completed checks clear their deadline');
  }
  client.functions.invoke=async()=>{throw new Error('Synthetic network failure');};
  assert.equal((await api[method]({})).serverSyncPending,true);
  client.functions.invoke=async(name,options)=>{state.calls.push({name,options});return {data:{isPro:true,plan:'pro_yearly'},error:null};};
  assert.equal((await api[method]({})).serverSyncPending,false,'Restore/retry can confirm after recovery');
  assert.ok(state.calls.every(c=>c.name==='revenuecat-sync' && JSON.stringify(c.options.body)==='{}'));
  assert.ok(state.calls.every(c=>c.options.headers.Authorization==='Bearer synthetic-token-account-a'),'Sync bound to original account session');
}
{
  const {api,client,timers,state}=await harness();
  let started, release;
  const entered=new Promise(resolve=>{started=resolve;});
  client.functions.invoke=async()=>{started();return new Promise(resolve=>{release=resolve;});};
  const pending=api.purchasePackage({});
  await entered;
  assert.equal(timers.size,1);
  [...timers.values()][0]();
  assert.equal((await pending).serverSyncPending,true,'Hung server releases purchase screen');
  assert.equal(timers.size,0);
  release({data:{isPro:true,plan:'pro_yearly'},error:null});
  client.functions.invoke=async()=>({data:{isPro:true,plan:'pro_yearly'},error:null});
  assert.equal((await api.restorePurchases()).serverSyncPending,false,'Timed-out sync does not block SDK queue');
  state.userId='account-b';
}
{
  const {api,client,state}=await harness();
  let started,release;
  const entered=new Promise(resolve=>{started=resolve;});
  client.functions.invoke=async()=>{started();return new Promise(resolve=>{release=resolve;});};
  const pending=api.restorePurchases();
  await entered;
  state.userId='account-b';
  release({data:{isPro:true,plan:'pro_yearly'},error:null});
  assert.ok((await pending).error,'Account switch during sync cannot confirm another account access');
}
console.log('PASS: purchase/restore server errors, missing entitlement, recovery, deadline and account-bound confirmation');
