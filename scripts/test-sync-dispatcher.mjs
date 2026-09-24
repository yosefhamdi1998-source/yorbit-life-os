import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync('supabase/functions/sync-all-accounts/index.ts','utf8').replace(/^import .*;\r?\n/gm,'');
for(const scenario of ['unauthorized','lookup-error','empty','http-error','reconnect','unconfirmed','success','investment','network-error','conflict']){
 let handler,calls=0,status='connected';const writes=[];
 const admin={from:()=>({select:columns=>{assert.equal(columns,'id, account_type');return {in:async(col,values)=>{
  // The dispatcher's candidate set, not a guarantee of who wins: 'syncing'
  // is included so an abandoned row can be reclaimed on the next run
  // instead of being silently excluded forever, but beginBankSync (tested
  // directly in test-bank-sync.mjs) is what actually decides per row.
  // Array.from(), not a direct deepEqual: `values` was built inside the vm
  // sandbox, a separate JS realm with its own Array constructor, and
  // assert's strict deepEqual treats cross-realm arrays as unequal even
  // when their contents match.
  assert.equal(col,'sync_status');assert.equal(Array.from(values).join(','),'connected,error,syncing');
  return {data:scenario==='empty'?[]:[{id:'synthetic',account_type:scenario==='investment'?'investment':'checking'}],error:scenario==='lookup-error'?new Error('Synthetic'):null};
 }};},update:patch=>{
  const filters=[];const q={eq:(k,v)=>{filters.push([k,v]);return q;},then:resolve=>{
   if(!filters.some(([k,v])=>k==='sync_status'&&v!==status)){writes.push(patch);status=patch.sync_status;}
   return Promise.resolve({error:null}).then(resolve);
  }};return q;
 }})};
 vm.runInNewContext(source,{Deno:{serve:fn=>handler=fn,env:{get:()=> 'synthetic'}},serviceClient:()=>admin,requireSystemCaller:async()=>scenario==='unauthorized'?{status:401}:null,handleOptions:()=>null,jsonResponse:(body,status)=>({body,status}),errorResponse:(message,status)=>({body:{error:message},status}),console:{log(){},error(){}},fetch:async url=>{
  calls++;if(scenario==='network-error')throw new Error('Offline');
  if(scenario==='reconnect')status='reconnect_required';
  const success=scenario==='success'||scenario==='investment';
  if(success)status='connected';
  assert.equal(url.endsWith('plaid-sync-holdings'),scenario==='investment');
  // A live conflict (someone else already claimed this account - see
  // SyncInProgressError) is its own HTTP status, checked by the dispatcher
  // BEFORE it ever calls res.json() - modelled here as a distinct, minimal
  // response shape rather than reusing the generic error() one, since the
  // dispatcher must branch on status alone without needing a valid body.
  if(scenario==='conflict')return {status:409,ok:false,json:async()=>({error:'This account is already syncing.'})};
  return {status:200,ok:!['http-error','reconnect'].includes(scenario),json:async()=>success?{success:true,imported:0,synced:0}:scenario==='unconfirmed'?{}:{error:'Synthetic'}};
 }});
 const result=await handler({});
 const ok=['success','investment','empty','conflict'].includes(scenario);
 assert.equal(result.status,scenario==='unauthorized'?401:scenario==='lookup-error'?500:ok?200:502,scenario);
 if(['unauthorized','lookup-error','empty'].includes(scenario))assert.equal(calls,0,scenario);
 assert.equal(writes.length,0,`${scenario}: the dispatcher never pre-marks or otherwise writes connected_accounts itself - only beginBankSync, inside the child function, claims a row`);
 if(scenario==='reconnect')assert.equal(status,'reconnect_required','Child reconnect state preserved');
 if(!ok && result.body?.failed!==undefined)assert.equal(result.body.failed,1);
 if(scenario==='conflict'){
  assert.equal(calls,1,'a conflict is still attempted, just refused - not skipped before asking');
  assert.equal(result.body.skipped,1,'a live conflict is recorded as skipped, not counted as a failure');
  assert.equal(result.body.failed,0,'so a batch where every remaining account is genuinely busy elsewhere is not reported as broken');
 }
}
console.log('PASS dispatcher: auth, read failure, empty, expanded candidate set, HTTP/network errors, reconnect preservation, unconfirmed response, success, investment routing, and live-conflict skip accounting');
