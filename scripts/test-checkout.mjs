import fs from 'node:fs';
import assert from 'node:assert/strict';
import { transform } from 'esbuild';
const policyCode=(await transform(fs.readFileSync('supabase/functions/_shared/billing.ts','utf8'),{loader:'ts',format:'esm'})).code;
const policy=await import('data:text/javascript;base64,'+Buffer.from(policyCode).toString('base64'));
assert.equal(policy.validCheckoutReturn('https://yorbit-life-os.vercel.app/settings?success=1'),true);
for(const url of ['https://yorbit-life-os.vercel.app.evil.test','javascript:alert(1)','https://evil.test','https://yosefhamdi1998-source.github.io/other-app/','https://user:pass@yorbit-life-os.vercel.app']) assert.equal(policy.validCheckoutReturn(url),false);
let handler, user=null, calls=0, shouldFail=false;
globalThis.__checkoutTest={
 ...policy,
 Deno:{env:{get:()=> 'synthetic'},serve:fn=>{handler=fn;}},
 getUser:async()=>user,
 Stripe:class { checkout={sessions:{create:async()=>{calls++;if(shouldFail)throw Error('synthetic failure');return {url:'https://checkout.stripe.com/test',id:'test'};}}}; },
 handleOptions:()=>null,
 jsonResponse:(body,status=200)=>Response.json(body,{status}),
 errorResponse:(message,status)=>Response.json({error:message},{status}),
 enforceRateLimit:async()=>null,identityFromRequest:()=> 'test',RULES:{auth:{}},
};
const source=fs.readFileSync('supabase/functions/create-checkout/index.ts','utf8').replace(/^import .*;\r?\n/gm,'');
const js=(await transform(source,{loader:'ts',format:'esm'})).code;
await import('data:text/javascript;base64,'+Buffer.from('const {Deno,getUser,Stripe,handleOptions,jsonResponse,errorResponse,enforceRateLimit,identityFromRequest,RULES,PRICE_TO_PLAN,validCheckoutReturn}=globalThis.__checkoutTest;'+js).toString('base64'));
const payload={priceId:Object.keys(policy.PRICE_TO_PLAN)[0],successUrl:'https://yorbit-life-os.vercel.app/settings',cancelUrl:'https://yorbit-life-os.vercel.app/upgrade'};
const request=body=>new Request('https://example.test',{method:'POST',body:JSON.stringify(body)});
assert.equal((await handler(request(payload))).status,401);
user={id:'test-user',email:'test@example.test'};
assert.equal((await handler(request({...payload,priceId:'unknown'}))).status,400);
assert.equal((await handler(request({...payload,successUrl:'https://evil.test'}))).status,400);
assert.equal(calls,0);
assert.equal((await handler(request(payload))).status,200);
shouldFail=true;
assert.equal((await handler(request(payload))).status,500);
delete globalThis.__checkoutTest;
console.log('PASS: checkout requires identity, restricts products/returns, and handles provider failure');
