import assert from 'node:assert/strict';
import fs from 'node:fs';
import { transform } from 'esbuild';
const source=fs.readFileSync('supabase/functions/ai-coach/index.ts','utf8').replace(/^import .*;\r?\n/gm,'');
const budgetSource=source.slice(0,source.indexOf('// The $15 cap'))+'\nexport {checkSpendLimits,loadMonthlyAiSpend};';
const js=(await transform(budgetSource,{loader:'ts',format:'esm'})).code;
const {checkSpendLimits,loadMonthlyAiSpend}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
let failure=null, dailyCount=0, requests=0, rows=[], pages=[];
const response=(kind,data)=>({data,error:failure===kind?Error('synthetic'):null});
const admin={from:table=>({select:(columns,options)=>{
 if(table==='profiles')return {eq:()=>({single:async()=>response('profile',{ai_tier:'free'})})};
 if(table==='ai_user_budgets'){const q={eq:()=>q,maybeSingle:async()=>response('personal',{requests,spend_usd:0})};return q;}
 assert.equal(table,'ai_usage_log');
 if(options?.head)return {eq:()=>({gte:async()=>({count:dailyCount,error:failure==='daily'?Error('synthetic'):null})})};
 assert.equal(columns,'estimated_cost_usd');
 return {gte:()=>({order:(column)=>{assert.equal(column,'created_at');return {order:(tie)=>{assert.equal(tie,'id');return {range:async(start,end)=>{pages.push([start,end]);return response('monthly',rows.slice(start,end+1));}};}};}})};
}})};
assert.equal(await checkSpendLimits(admin,'fixture-user'),null);
for(const kind of ['daily','profile','personal','monthly']) {failure=kind;await assert.rejects(()=>checkSpendLimits(admin,'fixture-user'),/Could not verify/);}failure=null;
dailyCount=null;await assert.rejects(()=>checkSpendLimits(admin,'fixture-user'),/daily AI/);dailyCount=0;
rows=Array.from({length:1000},()=>({estimated_cost_usd:0.001})).concat([{estimated_cost_usd:20}]);pages=[];
assert.match(await checkSpendLimits(admin,'fixture-user'),/usage budget/);
assert.deepEqual(pages,[[0,999],[1000,1999]],'An expensive row beyond the first page must enforce the shared cap');
rows=Array.from({length:2001},()=>({estimated_cost_usd:0.001}));pages=[];
assert.ok(Math.abs(await loadMonthlyAiSpend(admin,'2026-09-01')-2.001)<0.000001);
assert.equal(pages.length,3);
rows=[{estimated_cost_usd:'bad'}];await assert.rejects(()=>loadMonthlyAiSpend(admin,'2026-09-01'),/Invalid/);
rows=[];dailyCount=40;pages=[];assert.match(await checkSpendLimits(admin,'fixture-user'),/today/);assert.equal(pages.length,0);dailyCount=0;
requests=15;assert.match(await checkSpendLimits(admin,'fixture-user'),/free AI/);requests=0;

// Execute the actual edge handler with a failing budget query. No provider request is allowed.
let handler,providerCalls=0;
globalThis.__aiLimitTest={Deno:{serve:fn=>{handler=fn;},env:{get:()=> 'synthetic'}},getUser:async()=>({id:'fixture-user'}),serviceClient:()=>admin,
 handleOptions:()=>null,jsonResponse:(body,status=200)=>Response.json(body,{status}),errorResponse:(message,status)=>Response.json({error:message},{status}),
 enforceRateLimit:async()=>null,identityFromRequest:()=> 'fixture',RULES:{ai:{}},fetch:async()=>{providerCalls++;throw Error('Unexpected provider call');}};
const full=(await transform(source,{loader:'ts',format:'esm'})).code;
await import('data:text/javascript;base64,'+Buffer.from('const {Deno,getUser,serviceClient,handleOptions,jsonResponse,errorResponse,enforceRateLimit,identityFromRequest,RULES,fetch}=globalThis.__aiLimitTest;'+full).toString('base64'));
failure='daily';
assert.equal((await handler(new Request('https://example.test',{method:'POST',body:'{"mode":"invoke","prompt":"test"}'}))).status,500);
assert.equal(providerCalls,0);
assert.equal((await handler(new Request('https://example.test'))).status,405);
delete globalThis.__aiLimitTest;
console.log('PASS: actual AI budget/handler fails closed on read errors, counts beyond 1000 rows, validates usage totals, and never calls the provider on failed verification');
