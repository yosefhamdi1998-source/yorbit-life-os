import fs from 'node:fs';
import assert from 'node:assert/strict';
import { transform } from 'esbuild';
const policyCode=(await transform(fs.readFileSync('supabase/functions/_shared/billing.ts','utf8'),{loader:'ts',format:'esm'})).code;
const {validCheckoutReturn}=await import('data:text/javascript;base64,'+Buffer.from(policyCode).toString('base64'));
let handler, user=null, key='synthetic', limited=null, databaseError=null, providerError=false;
const calls=[];
const records={alice:[{stripe_customer_id:'cus_alice'}],bob:[{stripe_customer_id:'cus_bob'}],empty:[],duplicate:[{stripe_customer_id:'cus_1'},{stripe_customer_id:'cus_2'}]};
globalThis.__portalTest={
 Deno:{serve:fn=>{handler=fn;},env:{get:()=>key}},
 getUser:async()=>user,validCheckoutReturn,
 handleOptions:()=>null,jsonResponse:(body,status=200)=>Response.json(body,{status}),errorResponse:(message,status)=>Response.json({error:message},{status}),
 enforceRateLimit:async()=>limited,identityFromRequest:()=> 'fixture',RULES:{auth:{}},
 userClient:()=>({from:table=>{assert.equal(table,'subscriptions');return {select:columns=>{assert.equal(columns,'stripe_customer_id');return {eq:async(field,id)=>{assert.equal(field,'user_id');assert.equal(id,user.id);return {data:records[id],error:databaseError};}};}};} }),
 Stripe:class {static createFetchHttpClient(){return {};}
  billingPortal={sessions:{create:async args=>{calls.push(args);if(providerError)throw Error('synthetic');return {url:'https://billing.stripe.com/p/session_fixture'};}}};}
};
const source=fs.readFileSync('supabase/functions/create-billing-portal/index.ts','utf8').replace(/^import .*;\r?\n/gm,'');
const js=(await transform(source,{loader:'ts',format:'esm'})).code;
await import('data:text/javascript;base64,'+Buffer.from('const {Deno,getUser,userClient,validCheckoutReturn,handleOptions,jsonResponse,errorResponse,enforceRateLimit,identityFromRequest,RULES,Stripe}=globalThis.__portalTest;'+js).toString('base64'));
const request=body=>new Request('https://example.test',{method:'POST',body:JSON.stringify(body)});
const payload={returnUrl:'https://yorbit-life-os.vercel.app/settings',customer:'cus_someone_else',user_id:'bob'};
assert.equal((await handler(request(payload))).status,401);
assert.equal(calls.length,0);
user={id:'alice'};
assert.equal((await handler(new Request('https://example.test'))).status,405);
assert.equal((await handler(request({...payload,returnUrl:'https://evil.test'}))).status,400);
assert.equal((await handler(request(null))).status,400);
key='';assert.equal((await handler(request(payload))).status,501);key='synthetic';
limited=Response.json({error:'limited'},{status:429});assert.equal((await handler(request(payload))).status,429);limited=null;
assert.equal(calls.length,0);
assert.equal((await handler(request(payload))).status,200);
assert.equal(calls.at(-1).customer,'cus_alice','Caller-supplied customer/user IDs are ignored');
user={id:'bob'};assert.equal((await handler(request(payload))).status,200);assert.equal(calls.at(-1).customer,'cus_bob');
user={id:'empty'};assert.equal((await handler(request(payload))).status,404);
user={id:'duplicate'};assert.equal((await handler(request(payload))).status,409);
assert.equal(calls.length,2);
user={id:'alice'};databaseError=Error('synthetic');assert.equal((await handler(request(payload))).status,500);databaseError=null;
providerError=true;assert.equal((await handler(request(payload))).status,500);
delete globalThis.__portalTest;
console.log('PASS: portal authentication, user-scoped lookup, hostile caller IDs/return URL, no/ambiguous customer, missing config, rate limit and provider failures');

const settings=fs.readFileSync('src/pages/Settings.jsx','utf8');
const body=settings.match(/const handleManageSubscription = async \(\) => \{([\s\S]*?)\n  \};/)[1].replace('import.meta.env.BASE_URL',"'/subpath/'");
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
const run=new AsyncFunction('portalRef','setOpeningPortal','setPortalError','base44','window',body);
const ref={current:false}, states=[], errors=[], destinations=[];
let resolve, invokes=0;
const pending=new Promise(done=>{resolve=done;});
const base44={functions:{invoke:async(name,args)=>{assert.equal(name,'createBillingPortal');assert.equal(args.returnUrl,'https://example.test/subpath/settings');invokes++;return pending;}}};
const browser={location:{origin:'https://example.test',assign:url=>destinations.push(url)}};
const first=run(ref,v=>states.push(v),v=>errors.push(v),base44,browser);
await run(ref,v=>states.push(v),v=>errors.push(v),base44,browser);
assert.equal(invokes,1,'Rapid double taps create only one session request');
resolve({url:'https://billing.stripe.com/p/session_fixture'});await first;
assert.deepEqual(states,[true,false]);assert.equal(ref.current,false);assert.equal(destinations.length,1);
base44.functions.invoke=async()=>{throw Error('Synthetic unavailable (Reference: ABC234)');};
await run(ref,v=>states.push(v),v=>errors.push(v),base44,browser);
assert.match(errors.at(-1),/Reference: ABC234/);assert.equal(ref.current,false);assert.equal(states.at(-1),false);
console.log('PASS: actual Settings handler preserves return subpath, guards double taps, and releases/reports failed requests');
