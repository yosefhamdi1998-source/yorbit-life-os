import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { transform } from 'esbuild';
const source=fs.readFileSync('supabase/functions/delete-account/index.ts','utf8');
const js=(await transform(source.replace(/^import .*;\r?\n/gm,''),{loader:'ts'})).code;
for(const fails of [false,true]) {
 let handler; const requests=[],lookups=[]; const failure=new Error('synthetic deletion failure');
 const admin={from(table){return {select(columns){if(table==='subscriptions') return {eq:async()=>({data:[],error:null})};assert.equal(table,'connected_accounts');assert.equal(columns,'id');const q={eq(field,value){if(field==='user_id'){assert.equal(value,'fixture-user');return q;}assert.equal(field,'provider');return Promise.resolve({data:[{id:'vault-only'}]});}};return q;},delete(){return {eq:async()=>({error:null,count:0})};}}},auth:{admin:{deleteUser:async id=>{assert.equal(id,'fixture-user');return {error:fails?failure:null};}}}};
 vm.runInNewContext(js,{Deno:{serve:fn=>handler=fn,env:{get:key=>key==='STRIPE_SECRET_KEY'?null:'fixture'}},getUser:async()=>({id:'fixture-user'}),serviceClient:()=>admin,handleOptions:()=>null,enforceRateLimit:async(_b,_i,_r,msg,req)=>{assert.equal(msg,undefined);assert.ok(req);return null;},identityFromRequest:()=>'',RULES:{destructive:{}},getPlaidAccessToken:async(_admin,id)=>{lookups.push(id);return {token:'synthetic-vault-token',source:'vault'};},fetch:async(_url,opts)=>{requests.push(JSON.parse(opts.body));return {json:async()=>({removed:true})};},jsonResponse:(body,status)=>({body,status}),errorResponse:(msg,status,opts)=>{assert.equal(opts.internal,failure);return {body:{error:msg},status};},console:{log(){},error(){},warn(){}}});
 const response=await handler({});assert.equal(response.status,fails?500:200);assert.deepEqual(lookups,['vault-only']);assert.equal(requests[0].access_token,'synthetic-vault-token');
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
  const response=await handler({});
  assert.equal(response.status,mustStop?503:200,scenario);
  assert.equal(authDeletes,mustStop?0:1,scenario);
  if(mustStop){assert.equal(deletes,0,scenario);assert.match(response.body.error,/has not been deleted/);}
  if(['canceled','incomplete_expired'].includes(scenario))assert.equal(cancellations,0,scenario);
  if(['trialing','past_due'].includes(scenario))assert.equal(cancellations,1,scenario);
}
console.log('PASS: subscription lookup/config/provider failures preserve all records; trial/past-due cancellation and terminal-status retry are safe');
