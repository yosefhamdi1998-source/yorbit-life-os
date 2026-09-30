import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { transform } from 'esbuild';
const source=fs.readFileSync('supabase/functions/delete-account/index.ts','utf8');
const plaidEnvJs=(await transform(fs.readFileSync('supabase/functions/_shared/plaidEnvironment.ts','utf8').replace(/^export /gm,''),{loader:'ts'})).code;
const js=plaidEnvJs+(await transform(source.replace(/^import .*;\r?\n/gm,''),{loader:'ts'})).code;
for(const fails of [false,true]) {
 let handler; const requests=[],lookups=[]; const failure=new Error('synthetic deletion failure');
 const admin={from(table){return {select(columns){if(table==='subscriptions') return {eq:async()=>({data:[],error:null})};assert.equal(table,'connected_accounts');assert.equal(columns,'id, sync_status');const q={eq(field,value){if(field==='user_id'){assert.equal(value,'fixture-user');return q;}assert.equal(field,'provider');return Promise.resolve({data:[{id:'vault-only'}]});}};return q;},delete(){return {eq:async()=>({error:null,count:0})};}}},auth:{admin:{deleteUser:async id=>{assert.equal(id,'fixture-user');return {error:fails?failure:null};}}}};
 vm.runInNewContext(js,{Deno:{serve:fn=>handler=fn,env:{get:key=>key==='STRIPE_SECRET_KEY'?null:'fixture'}},getUser:async()=>({id:'fixture-user'}),serviceClient:()=>admin,handleOptions:()=>null,enforceRateLimit:async(_b,_i,_r,msg,req)=>{assert.equal(msg,undefined);assert.ok(req);return null;},identityFromRequest:()=>'',RULES:{destructive:{}},getPlaidAccessToken:async(_admin,id)=>{lookups.push(id);return {token:'synthetic-vault-token',source:'vault'};},fetch:async(_url,opts)=>{requests.push(JSON.parse(opts.body));return {ok:true,status:200,json:async()=>({removed:true})};},jsonResponse:(body,status)=>({body,status}),errorResponse:(msg,status,opts)=>{assert.equal(opts.internal,failure);return {body:{error:msg},status};},console:{log(){},error(){},warn(){}}});
 const response=await handler({method:'POST'});assert.equal(response.status,fails?500:200);assert.deepEqual(lookups,['vault-only']);assert.equal(requests[0].access_token,'synthetic-vault-token');
}
console.log('PASS: actual deletion handler unlinks vault-only account, preserves auth deletion failure and rate-limit request; all dependencies synthetic');

// Exercise the actual handler with Stripe and database dependencies fully mocked.
for (const scenario of ['lookup-error','missing-key','retrieve-error','cancel-error','unconfirmed','trialing','past_due','canceled','incomplete_expired']) {
  let handler; let deletes=0; let authDeletes=0; let cancellations=0;
  const mustStop=['lookup-error','missing-key','retrieve-error','cancel-error','unconfirmed'].includes(scenario);
  const admin={from(table){return {
    select(){const q={eq(){if(table==='subscriptions')return Promise.resolve({data:[{stripe_subscription_id:'sub_fixture'}],error:scenario==='lookup-error'?new Error('synthetic'):null});return q;},then(resolve){return Promise.resolve({data:[]}).then(resolve);}};return q;},
    delete(){deletes++;return {eq:async()=>({error:null,count:0})};}
  };},auth:{admin:{deleteUser:async()=>{authDeletes++;return {error:null};}}}};
  class Stripe { constructor(){this.subscriptions={
    retrieve:async()=>{if(scenario==='retrieve-error')throw new Error('synthetic');return {status:scenario};},
    cancel:async()=>{cancellations++;if(scenario==='cancel-error')throw new Error('synthetic');return {status:scenario==='unconfirmed'?'active':'canceled'};}
  };}}
  vm.runInNewContext(js,{Stripe,Deno:{serve:fn=>handler=fn,env:{get:key=>key==='STRIPE_SECRET_KEY'&&scenario!=='missing-key'?'synthetic-key':null}},getUser:async()=>({id:'fixture-user'}),serviceClient:()=>admin,handleOptions:()=>null,enforceRateLimit:async()=>null,identityFromRequest:()=>'',RULES:{destructive:{}},jsonResponse:(body,status)=>({body,status}),errorResponse:(message,status)=>({body:{error:message},status}),console:{log(){},error(){},warn(){}}});
  const response=await handler({method:'POST'});
  assert.equal(response.status,mustStop?503:200,scenario);
  assert.equal(authDeletes,mustStop?0:1,scenario);
  if(mustStop){assert.equal(deletes,0,scenario);assert.match(response.body.error,/has not been deleted/);}
  if(['canceled','incomplete_expired'].includes(scenario))assert.equal(cancellations,0,scenario);
  if(['trialing','past_due'].includes(scenario))assert.equal(cancellations,1,scenario);
}
console.log('PASS: subscription lookup/config/provider failures preserve all records; trial/past-due cancellation and terminal-status retry are safe');

for (const scenario of ['lookup-error','missing-config','missing-token','network-error','provider-error','unconfirmed','current-success','already-removed','duplicate-token']) {
  let handler; let deletes=0; let authDeletes=0; let removals=0;
  const success=['current-success','already-removed','duplicate-token'].includes(scenario);
  const admin={from(table){return {
    select(){const q={eq(){if(table==='subscriptions')return Promise.resolve({data:[],error:null});return q;},then(resolve){return Promise.resolve({data:scenario==='duplicate-token'?[{id:'a'},{id:'b'}]:[{id:'a'}],error:scenario==='lookup-error'?new Error('synthetic'):null}).then(resolve);}};return q;},
    delete(){deletes++;return {eq:async()=>({error:null,count:0})};}
  };},auth:{admin:{deleteUser:async()=>{authDeletes++;return {error:null};}}}};
  vm.runInNewContext(js,{Deno:{serve:fn=>handler=fn,env:{get:()=>scenario==='missing-config'?null:'fixture'}},getUser:async()=>({id:'fixture-user'}),serviceClient:()=>admin,handleOptions:()=>null,enforceRateLimit:async()=>null,identityFromRequest:()=>'',RULES:{destructive:{}},getPlaidAccessToken:async()=>({token:scenario==='missing-token'?null:'synthetic-token'}),fetch:async()=>{removals++;if(scenario==='network-error')throw new Error('synthetic');return {ok:scenario!=='provider-error'&&scenario!=='already-removed',status:scenario==='already-removed'?400:scenario==='provider-error'?500:200,json:async()=>scenario==='already-removed'?{error_type:'ITEM_ERROR',error_code:'ITEM_NOT_FOUND'}:scenario==='unconfirmed'?{}:{request_id:'synthetic-request'}};},jsonResponse:(body,status)=>({body,status}),errorResponse:(message,status)=>({body:{error:message},status}),console:{log(){},error(){},warn(){}}});
  const result=await handler({method:'POST'});assert.equal(result.status,success?200:503,scenario);assert.equal(authDeletes,success?1:0,scenario);
  if(!success){assert.equal(deletes,0,scenario);assert.match(result.body.error,/has not been deleted/);}
  if(scenario==='duplicate-token')assert.equal(removals,1);
}
console.log('PASS: bank removal failures preserve records; current success, already-removed retries and shared-token deduplication work');

// plaid-disconnect-account deletes an account's credential in the same
// transaction that marks it disconnected. Such an account must not block
// account deletion forever with 'Bank credential unavailable'; a
// non-disconnected account with no credential still must (see above).
for (const status of ['disconnected','connected']) {
  let handler; let authDeletes=0; let removals=0;
  const admin={from(table){return {
    select(){const q={eq(){if(table==='subscriptions')return Promise.resolve({data:[],error:null});return q;},then(resolve){return Promise.resolve({data:[{id:'gone',sync_status:status},{id:'live',sync_status:'connected'}],error:null}).then(resolve);}};return q;},
    delete(){return {eq:async()=>({error:null,count:0})};}
  };},auth:{admin:{deleteUser:async()=>{authDeletes++;return {error:null};}}}};
  vm.runInNewContext(js,{Deno:{serve:fn=>handler=fn,env:{get:()=>'fixture'}},getUser:async()=>({id:'fixture-user'}),serviceClient:()=>admin,handleOptions:()=>null,enforceRateLimit:async()=>null,identityFromRequest:()=>'',RULES:{destructive:{}},getPlaidAccessToken:async(_a,id)=>({token:id==='gone'?null:'synthetic-live-token'}),fetch:async()=>{removals++;return {ok:true,status:200,json:async()=>({request_id:'synthetic'})};},jsonResponse:(body,status)=>({body,status}),errorResponse:(message,status)=>({body:{error:message},status}),console:{log(){},error(){},warn(){}}});
  const result=await handler({method:'POST'});
  if(status==='disconnected'){assert.equal(result.status,200,'an already-disconnected account without a credential must not block deletion');assert.equal(authDeletes,1);assert.equal(removals,1,'the remaining live account is still revoked');}
  else{assert.equal(result.status,503,'an active account missing its credential still stops deletion');assert.equal(authDeletes,0);}
}
console.log('PASS: fully disconnected accounts (credential already removed) do not block deletion; active accounts missing a credential still do');

// No provider configuration is needed when all bank credentials were already
// removed. Read failures and retained credentials must still fail closed.
for (const scenario of ['disconnected-empty','disconnected-retained','disconnected-read-error','connected-empty']) {
  let handler, authDeletes=0, deletes=0, removals=0;
  const admin={from(table){return {
    select(){const q={eq(){if(table==='subscriptions')return Promise.resolve({data:[],error:null});return q;},then(resolve){return Promise.resolve({data:[{id:'fixture-account',sync_status:scenario==='connected-empty'?'connected':'disconnected'}],error:null}).then(resolve);}};return q;},
    delete(){deletes++;return {eq:async()=>({error:null,count:0})};}
  };},auth:{admin:{deleteUser:async()=>{authDeletes++;return {error:null};}}}};
  vm.runInNewContext(js,{Deno:{serve:fn=>handler=fn,env:{get:()=>null}},getUser:async()=>({id:'fixture-user'}),serviceClient:()=>admin,handleOptions:()=>null,enforceRateLimit:async()=>null,identityFromRequest:()=>'',RULES:{destructive:{}},getPlaidAccessToken:async()=>{if(scenario==='disconnected-read-error')throw new Error('Synthetic lookup failure');return {token:scenario==='disconnected-retained'?'synthetic-retained-token':null};},fetch:async()=>{removals++;throw new Error('Provider must not be called');},jsonResponse:(body,status)=>({body,status}),errorResponse:(message,status)=>({body:{error:message},status}),console:{log(){},error(){},warn(){}}});
  const response=await handler({method:'POST'});
  assert.equal(response.status,scenario==='disconnected-empty'?200:503,scenario);
  assert.equal(authDeletes,scenario==='disconnected-empty'?1:0,scenario);
  if(scenario!=='disconnected-empty')assert.equal(deletes,0,scenario);
  assert.equal(removals,0,scenario);
}
console.log('PASS: fully disconnected accounts delete without Plaid configuration; retained tokens and lookup failures preserve data');

for (const method of ['GET','HEAD','PUT','DELETE']) {
 let handler, authReads=0;
 vm.runInNewContext(js,{Deno:{serve:fn=>handler=fn},handleOptions:()=>null,getUser:async()=>{authReads++;throw new Error('Must stop before auth/data reads');},jsonResponse:(body,status)=>({body,status}),errorResponse:(message,status)=>({body:{error:message},status}),console:{log(){},error(){}}});
 assert.equal((await handler({method})).status,405,method+' cannot delete an account');
 assert.equal(authReads,0);
}
console.log('PASS: account deletion accepts POST only; read requests cannot trigger deletion');

// Plaid Sandbox items (listed test accounts) are removed in the sandbox with
// the sandbox secret; real items keep production. Without the sandbox secret
// a sandbox item is never sent to production and deletion stops intact.
for (const sandboxSecret of [true,false]) {
  let handler, authDeletes=0, deletes=0; const calls=[];
  const secrets={PLAID_CLIENT_ID:'client-1',PLAID_SECRET:'production-secret',PLAID_SANDBOX_SECRET:sandboxSecret?'sandbox-secret':undefined};
  const tokens={real:'access-production-fixture',test:'access-sandbox-fixture'};
  const admin={from(table){return {
    select(){const q={eq(){if(table==='subscriptions')return Promise.resolve({data:[],error:null});return q;},then(resolve){return Promise.resolve({data:[{id:'real',sync_status:'connected'},{id:'test',sync_status:'connected'}],error:null}).then(resolve);}};return q;},
    delete(){deletes++;return {eq:async()=>({error:null,count:0})};}
  };},auth:{admin:{deleteUser:async()=>{authDeletes++;return {error:null};}}}};
  vm.runInNewContext(js,{Deno:{serve:fn=>handler=fn,env:{get:k=>k in secrets?secrets[k]:null}},getUser:async()=>({id:'fixture-user'}),serviceClient:()=>admin,handleOptions:()=>null,enforceRateLimit:async()=>null,identityFromRequest:()=>'',RULES:{destructive:{}},getPlaidAccessToken:async(_a,id)=>({token:tokens[id]}),fetch:async(url,init)=>{calls.push({url,body:JSON.parse(init.body)});return {ok:true,status:200,json:async()=>({request_id:'synthetic'})};},jsonResponse:(body,status)=>({body,status}),errorResponse:(message,status)=>({body:{error:message},status}),console:{log(){},error(){},warn(){}}});
  const response=await handler({method:'POST'});
  const real=calls.find(c=>c.body.access_token===tokens.real), test=calls.find(c=>c.body.access_token===tokens.test);
  if(sandboxSecret){
    assert.equal(real.url,'https://production.plaid.com/item/remove'); assert.equal(real.body.secret,'production-secret');
    assert.equal(response.status,200); assert.equal(authDeletes,1);
    assert.equal(test.url,'https://sandbox.plaid.com/item/remove'); assert.equal(test.body.secret,'sandbox-secret'); assert.equal(test.body.client_id,'client-1');
  } else {
    assert.equal(response.status,503); assert.equal(authDeletes,0); assert.equal(deletes,0);
    assert.equal(calls.length,0,'a configuration gap stops deletion before any bank is disconnected');
  }
}
console.log('PASS: deletion removes real items in production and Plaid Sandbox items in the sandbox, each with its own secret; a missing sandbox secret stops deletion before any bank is disconnected or anything deleted');
