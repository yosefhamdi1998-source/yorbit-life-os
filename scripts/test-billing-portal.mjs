import fs from 'node:fs';
import assert from 'node:assert/strict';
import { transform } from 'esbuild';
import { createAccountOperation } from '../src/lib/accountOperation.js';
const policyCode=(await transform(fs.readFileSync('supabase/functions/_shared/billing.ts','utf8'),{loader:'ts',format:'esm'})).code;
const {validCheckoutReturn,checkoutAllowed}=await import('data:text/javascript;base64,'+Buffer.from(policyCode).toString('base64'));
let handler, user=null, key='rk_test_FAKE', limited=null, databaseError=null, providerError=false, lookups=0;
let allowedEmails='alice@example.test,bob@example.test,empty@example.test,duplicate@example.test';
const calls=[];
const records={alice:[{stripe_customer_id:'cus_alice'}],bob:[{stripe_customer_id:'cus_bob'}],empty:[],duplicate:[{stripe_customer_id:'cus_1'},{stripe_customer_id:'cus_2'}]};
globalThis.__portalTest={
 Deno:{serve:fn=>{handler=fn;},env:{get:name=>name==='STRIPE_SECRET_KEY'?key:name==='STRIPE_TEST_CHECKOUT_EMAILS'?allowedEmails:undefined}},
 getUser:async()=>user,validCheckoutReturn,checkoutAllowed,
 handleOptions:()=>null,jsonResponse:(body,status=200)=>Response.json(body,{status}),errorResponse:(message,status)=>Response.json({error:message},{status}),
 enforceRateLimit:async()=>limited,identityFromRequest:()=> 'fixture',RULES:{auth:{}},
 userClient:()=>({from:table=>{lookups++;assert.equal(table,'subscriptions');return {select:columns=>{assert.equal(columns,'stripe_customer_id');return {eq:async(field,id)=>{assert.equal(field,'user_id');assert.equal(id,user.id);return {data:records[id],error:databaseError};}};}};} }),
 Stripe:class {static createFetchHttpClient(){return {};}
  billingPortal={sessions:{create:async args=>{calls.push(args);if(providerError)throw Error('synthetic');return {url:'https://billing.stripe.com/p/session_fixture'};}}};}
};
const source=fs.readFileSync('supabase/functions/create-billing-portal/index.ts','utf8').replace(/^import .*;\r?\n/gm,'');
const js=(await transform(source,{loader:'ts',format:'esm'})).code;
await import('data:text/javascript;base64,'+Buffer.from('const {Deno,getUser,userClient,validCheckoutReturn,checkoutAllowed,handleOptions,jsonResponse,errorResponse,enforceRateLimit,identityFromRequest,RULES,Stripe}=globalThis.__portalTest;'+js).toString('base64'));
const request=body=>new Request('https://example.test',{method:'POST',body:JSON.stringify(body)});
const payload={returnUrl:'https://yorbit-life-os.vercel.app/settings',customer:'cus_someone_else',user_id:'bob'};
assert.equal((await handler(request(payload))).status,401);
assert.equal(calls.length,0);
user={id:'alice',email:'alice@example.test'};
assert.equal((await handler(new Request('https://example.test'))).status,405);
assert.equal((await handler(request({...payload,returnUrl:'https://evil.test'}))).status,400);
assert.equal((await handler(request(null))).status,400);
key='';assert.equal((await handler(request(payload))).status,501);key='rk_test_FAKE';
limited=Response.json({error:'limited'},{status:429});assert.equal((await handler(request(payload))).status,429);limited=null;
assert.equal(calls.length,0);
for (const deniedKey of ['sk_live_FAKE','rk_live_FAKE','malformed']) {
 key=deniedKey;
 assert.equal((await handler(request(payload))).status,501,'Live/unknown keys cannot open a portal in the sandbox release');
 assert.equal(calls.length,0);
 assert.equal(lookups,0,'Refuse disallowed billing before reading subscription records');
}
key='rk_test_FAKE';
for (const list of ['', 'bob@example.test', 'alice@example.test.evil']) {
 allowedEmails=list;
 assert.equal((await handler(request(payload))).status,501,'Only the approved sandbox account may open a portal');
 assert.equal(calls.length,0);assert.equal(lookups,0);
}
allowedEmails='alice@example.test,bob@example.test,empty@example.test,duplicate@example.test';
user={id:'alice'};
assert.equal((await handler(request(payload))).status,501,'Missing verified auth email cannot bypass the sandbox list');
assert.equal(calls.length,0);assert.equal(lookups,0);
user={id:'alice',email:'alice@example.test'};
assert.equal((await handler(request(payload))).status,200);
assert.equal(calls.at(-1).customer,'cus_alice','Caller-supplied customer/user IDs are ignored');
user={id:'bob',email:'bob@example.test'};assert.equal((await handler(request(payload))).status,200);assert.equal(calls.at(-1).customer,'cus_bob');
user={id:'empty',email:'empty@example.test'};assert.equal((await handler(request(payload))).status,404);
user={id:'duplicate',email:'duplicate@example.test'};assert.equal((await handler(request(payload))).status,409);
assert.equal(calls.length,2);
user={id:'alice',email:'alice@example.test'};databaseError=Error('synthetic');assert.equal((await handler(request(payload))).status,500);databaseError=null;
providerError=true;assert.equal((await handler(request(payload))).status,500);
delete globalThis.__portalTest;
console.log('PASS: sandbox-only portal, approved tester allowlist, no price configuration dependency, portal authentication, user-scoped lookup, hostile caller IDs/return URL, no/ambiguous customer, missing config, rate limit and provider failures');

const settings=fs.readFileSync('src/pages/Settings.jsx','utf8');
const body=settings.match(/const handleManageSubscription = async \(\) => \{([\s\S]*?)\n  \};/)[1].replace('import.meta.env.BASE_URL',"'/subpath/'");
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
const run=new AsyncFunction('scope','with(scope){'+body+'}');
for (const phase of ['normal','switch','refresh','logout','away-and-back','request-failure','initial-mismatch']) {
 let current=phase==='initial-mismatch'?'bob':'alice',listener,disposed=0,invokes=0,release,entered;
 const pending=new Promise(done=>{release=done;});
 const started=new Promise(done=>{entered=done;});
 const states=[],errors=[],destinations=[];
 const scope={
  user:{id:'alice'},createAccountOperation,portalRef:{current:false},
  setOpeningPortal:value=>states.push(value),setPortalError:value=>errors.push(value),
  base44:{
   auth:{getSession:async()=>current?{user:{id:current}}:null,onAuthStateChange:fn=>{listener=fn;return()=>{disposed++;};}},
   functions:{invoke:async(name,args)=>{
    assert.equal(name,'createBillingPortal');assert.equal(args.returnUrl,'https://example.test/subpath/settings');
    invokes++;entered();await pending;
    if(phase==='request-failure')throw Error('Synthetic unavailable (Reference: ABC234)');
    return {url:'https://billing.stripe.com/p/session_fixture'};
   }}
  },
  window:{location:{origin:'https://example.test',assign:url=>destinations.push(url)}}
 };
 const first=run(scope);
 if(phase==='initial-mismatch'){
  release();await first;assert.equal(invokes,0,phase);
 }else{
  await started;await run(scope);
  assert.equal(invokes,1,'Rapid double taps send one request');
  function change(id){current=id;listener?.(id?{user:{id}}:null);}
  if(phase==='switch'||phase==='away-and-back')change('bob');
  if(phase==='logout')change(null);
  if(phase==='refresh'||phase==='away-and-back')change('alice');
  release();await first;
 }
 const success=phase==='normal'||phase==='refresh';
 assert.equal(destinations.length,success?1:0,phase+' must not expose a portal from a previous account');
 if(phase==='request-failure')assert.match(errors.at(-1),/Reference: ABC234/);
 else if(!success)assert.match(errors.at(-1),/account changed/);
 assert.deepEqual(states,[true,false]);assert.equal(scope.portalRef.current,false);
 assert.equal(disposed,1,phase+' cleans up its auth listener');
}
console.log('PASS: Settings portal request stays bound to its initiating account, blocks double taps, discards switched/logged-out responses, and cleans up failures');
