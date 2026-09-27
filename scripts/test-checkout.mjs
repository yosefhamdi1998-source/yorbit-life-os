import fs from 'node:fs';
import assert from 'node:assert/strict';
import { transform } from 'esbuild';
const policyCode=(await transform(fs.readFileSync('supabase/functions/_shared/billing.ts','utf8'),{loader:'ts',format:'esm'})).code;
const policy=await import('data:text/javascript;base64,'+Buffer.from(policyCode).toString('base64'));
assert.equal(policy.validCheckoutReturn('https://yorbit-life-os.vercel.app/settings?success=1'),true);
for(const url of ['https://yorbit-life-os.vercel.app.evil.test','javascript:alert(1)','https://evil.test','https://yosefhamdi1998-source.github.io/other-app/','https://user:pass@yorbit-life-os.vercel.app']) assert.equal(policy.validCheckoutReturn(url),false);

// The web app sends the plan name; the server owns the price ids. The only
// price ids in the web app are the transitional live ones for the previous
// create-checkout version, and they must not drift from the server's.
const upgradeSource=fs.readFileSync('src/pages/Upgrade.jsx','utf8');
assert.match(upgradeSource,/invoke\('createCheckout', \{ plan, priceId: LEGACY_LIVE_PRICE_IDS\[plan\], successUrl, cancelUrl \}\)/);
const legacyIds=upgradeSource.match(/const LEGACY_LIVE_PRICE_IDS = \{ monthly: '([^']+)', yearly: '([^']+)' \};/);
assert.deepEqual([legacyIds[1],legacyIds[2]],[policy.LIVE_PRICES.pro_monthly,policy.LIVE_PRICES.pro_yearly]);
assert.deepEqual([...upgradeSource.matchAll(/price_[A-Za-z0-9]+/g)].length,2,'no other price ids in the web app');
const offeredPlans=[...upgradeSource.match(/const PRICES = \{([\s\S]*?)\n\};/)[1].matchAll(/^\s*(\w+):/gm)].map(m=>m[1]);
assert.deepEqual(offeredPlans.sort(),Object.keys(policy.CHECKOUT_PLANS).sort());
assert.equal(policy.LIVE_PRICES.pro_monthly,'price_1UDXISA4mvP1HWCKCxoL3PcL');
assert.equal(policy.LIVE_PRICES.pro_yearly,'price_1UDXJiA4mvP1HWCKDQ18B5bX');

// Price selection by key mode. Keys here are obviously fake prefixes only.
const TEST_PRICES={STRIPE_PRICE_PRO_MONTHLY:'price_test_monthly',STRIPE_PRICE_PRO_YEARLY:'price_test_yearly'};
const envOf=vars=>name=>vars[name];
assert.deepEqual(policy.billingPrices('sk_live_FAKE',envOf({})),policy.LIVE_PRICES);
assert.deepEqual(policy.billingPrices('rk_live_FAKE',envOf({})),policy.LIVE_PRICES);
assert.equal(policy.billingPrices('rk_test_FAKE',envOf({})),null,'a test key never falls back to live price ids');
assert.equal(policy.billingPrices('rk_test_FAKE',envOf({STRIPE_PRICE_PRO_MONTHLY:'price_test_monthly'})),null,'half-configured is not configured');
assert.deepEqual(policy.billingPrices('rk_test_FAKE',envOf(TEST_PRICES)),{pro_monthly:'price_test_monthly',pro_yearly:'price_test_yearly'});
assert.equal(policy.billingPrices('not-a-stripe-key',envOf({})),null);
assert.equal(policy.billingPrices('not-a-stripe-key',envOf(TEST_PRICES)),null,'an unrecognised key disables billing even with prices set');
assert.equal(policy.billingPrices(undefined,envOf({})),null);
assert.equal(policy.planForPrice(policy.LIVE_PRICES,'price_1UDXJiA4mvP1HWCKDQ18B5bX'),'pro_yearly');
assert.equal(policy.planForPrice(policy.LIVE_PRICES,undefined),undefined);

// Test-mode checkout only for listed test accounts; live mode is open to everyone.
const allowList=envOf({STRIPE_TEST_CHECKOUT_EMAILS:' Tester@Yorbit.example , @billing.example.test '});
assert.equal(policy.checkoutAllowed('rk_live_FAKE','anyone@gmail.com',envOf({})),true);
assert.equal(policy.checkoutAllowed('rk_test_FAKE','anyone@gmail.com',envOf({})),false,'unset list = nobody');
assert.equal(policy.checkoutAllowed('rk_test_FAKE','tester@yorbit.example',allowList),true);
assert.equal(policy.checkoutAllowed('rk_test_FAKE','qa1@billing.example.test',allowList),true);
for(const email of ['anyone@gmail.com','qa1@evilbilling.example.test','qa1@billing.example.test.evil','tester@yorbit.example.org','',undefined])
  assert.equal(policy.checkoutAllowed('rk_test_FAKE',email,allowList),false,String(email));
assert.equal(policy.checkoutAllowed('not-a-stripe-key','tester@yorbit.example',allowList),false);

let handler, user=null, env={}, shouldFail=false;
const created=[];
globalThis.__checkoutTest={
 ...policy,
 Deno:{env:{get:name=>env[name]},serve:fn=>{handler=fn;}},
 getUser:async()=>user,
 Stripe:class { checkout={sessions:{create:async args=>{created.push(args);if(shouldFail)throw Error('synthetic failure');return {url:'https://checkout.stripe.com/test',id:'test'};}}}; },
 handleOptions:()=>null,
 jsonResponse:(body,status=200)=>Response.json(body,{status}),
 errorResponse:(message,status)=>Response.json({error:message},{status}),
 enforceRateLimit:async()=>null,identityFromRequest:()=> 'test',RULES:{auth:{}},
 console:{error(){},log(){}},
};
const source=fs.readFileSync('supabase/functions/create-checkout/index.ts','utf8').replace(/^import .*;\r?\n/gm,'');
const js=(await transform(source,{loader:'ts',format:'esm'})).code;
await import('data:text/javascript;base64,'+Buffer.from('const {Deno,getUser,Stripe,handleOptions,jsonResponse,errorResponse,enforceRateLimit,identityFromRequest,RULES,billingPrices,CHECKOUT_PLANS,checkoutAllowed,planForPrice,stripeMode,validCheckoutReturn,console}=globalThis.__checkoutTest;'+js).toString('base64'));
const returns={successUrl:'https://yorbit-life-os.vercel.app/settings',cancelUrl:'https://yorbit-life-os.vercel.app/upgrade'};
const request=body=>new Request('https://example.test',{method:'POST',body:JSON.stringify(body)});
const status=async body=>(await handler(request(body))).status;
const lastPrice=()=>created.at(-1).line_items[0].price;

env={STRIPE_SECRET_KEY:'rk_live_FAKE'};
assert.equal(await status({plan:'monthly',...returns}),401);
user={id:'test-user',email:'test@example.test'};
assert.equal(await status({plan:'weekly',...returns}),400);
assert.equal(await status({priceId:'price_unknown',...returns}),400);
assert.equal(await status({plan:'monthly',...returns,successUrl:'https://evil.test'}),400);
assert.equal(created.length,0);

// Live mode: plan names map to the live prices; older web builds sending a live price id still work.
assert.equal(await status({plan:'monthly',...returns}),200); assert.equal(lastPrice(),policy.LIVE_PRICES.pro_monthly);
assert.equal(await status({plan:'yearly',...returns}),200); assert.equal(lastPrice(),policy.LIVE_PRICES.pro_yearly);
assert.equal(created.at(-1).client_reference_id,'test-user');
assert.equal(created.at(-1).subscription_data.trial_period_days,7);
assert.equal(await status({priceId:policy.LIVE_PRICES.pro_yearly,...returns}),200); assert.equal(lastPrice(),policy.LIVE_PRICES.pro_yearly);
assert.equal(await status({plan:'monthly',priceId:policy.LIVE_PRICES.pro_yearly,...returns}),200); assert.equal(lastPrice(),policy.LIVE_PRICES.pro_monthly,'the plan name is authoritative');

// Test mode: off until test prices exist, then only test prices are used,
// and only for listed test accounts.
const TESTERS={STRIPE_TEST_CHECKOUT_EMAILS:'@example.test'};
env={STRIPE_SECRET_KEY:'rk_test_FAKE',...TESTERS};
const before=created.length;
assert.equal(await status({plan:'monthly',...returns}),501);
assert.equal(created.length,before,'no checkout is attempted with live prices in test mode');
env={STRIPE_SECRET_KEY:'rk_test_FAKE',...TEST_PRICES};
assert.equal(await status({plan:'monthly',...returns}),501,'a real user cannot reach test checkout on the live site');
assert.equal(created.length,before);
env={STRIPE_SECRET_KEY:'rk_test_FAKE',...TEST_PRICES,...TESTERS};
assert.equal(await status({plan:'monthly',...returns}),200); assert.equal(lastPrice(),'price_test_monthly');
assert.equal(await status({plan:'yearly',...returns}),200); assert.equal(lastPrice(),'price_test_yearly');
assert.equal(await status({priceId:policy.LIVE_PRICES.pro_monthly,...returns}),400,'a live price id is refused in test mode');
assert.equal(await status({plan:'monthly',priceId:policy.LIVE_PRICES.pro_monthly,...returns}),200,'what the web app sends');
assert.equal(lastPrice(),'price_test_monthly','the plan wins over the transitional live price id');

env={};
assert.equal(await status({plan:'monthly',...returns}),501);
env={STRIPE_SECRET_KEY:'rk_live_FAKE'};
shouldFail=true;
assert.equal(await status({plan:'monthly',...returns}),500);
delete globalThis.__checkoutTest;
console.log('PASS: checkout requires identity, sends plan names, uses the price for the key\'s Stripe mode (never live prices in test mode), limits test mode to listed test accounts, restricts returns, and handles provider failure');
