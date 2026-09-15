import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync('supabase/functions/sync-all-accounts/index.ts','utf8').replace(/^import .*;\r?\n/gm,'');
for(const scenario of ['unauthorized','lookup-error','empty','start-error','http-error','reconnect','unconfirmed','success','investment','network-error']){
 let handler,calls=0,status='connected';const writes=[];
 const admin={from:()=>({select:columns=>{assert.equal(columns,'id, account_type');return {eq:async()=>({data:scenario==='empty'?[]:[{id:'synthetic',account_type:scenario==='investment'?'investment':'checking'}],error:scenario==='lookup-error'?new Error('Synthetic'):null})};},update:patch=>{
  const filters=[];const q={eq:(k,v)=>{filters.push([k,v]);return q;},then:resolve=>{
   if(!filters.some(([k,v])=>k==='sync_status'&&v!==status)){writes.push(patch);status=patch.sync_status;}
   return Promise.resolve({error:scenario==='start-error'?new Error('Synthetic'):null}).then(resolve);
  }};return q;
 }})};
 vm.runInNewContext(source,{Deno:{serve:fn=>handler=fn,env:{get:()=> 'synthetic'}},serviceClient:()=>admin,requireSystemCaller:async()=>scenario==='unauthorized'?{status:401}:null,handleOptions:()=>null,jsonResponse:(body,status)=>({body,status}),errorResponse:(message,status)=>({body:{error:message},status}),console:{log(){},error(){}},fetch:async url=>{
  calls++;if(scenario==='network-error')throw new Error('Offline');
  if(scenario==='reconnect')status='reconnect_required';
  const success=scenario==='success'||scenario==='investment';
  if(success)status='connected';
  assert.equal(url.endsWith('plaid-sync-holdings'),scenario==='investment');
  return {ok:!['http-error','reconnect'].includes(scenario),json:async()=>success?{success:true,imported:0,synced:0}:scenario==='unconfirmed'?{}:{error:'Synthetic'}};
 }});
 const result=await handler({});
 const ok=['success','investment','empty'].includes(scenario);
 assert.equal(result.status,scenario==='unauthorized'?401:scenario==='lookup-error'?500:ok?200:502,scenario);
 if(['unauthorized','lookup-error','empty','start-error'].includes(scenario))assert.equal(calls,0,scenario);
 assert.ok(writes.every(p=>!('last_synced_at' in p)), 'Dispatcher must not invent freshness');
 if(scenario==='reconnect')assert.equal(status,'reconnect_required','Child reconnect state preserved');
 if(!ok && result.body?.failed!==undefined)assert.equal(result.body.failed,1);
}
console.log('PASS dispatcher: auth, read failure, empty, write failure, HTTP/network errors, reconnect preservation, unconfirmed response, success and investment routing');
