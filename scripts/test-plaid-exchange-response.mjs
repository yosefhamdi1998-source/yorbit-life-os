import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { transform } from 'esbuild';

const publicSource = fs.readFileSync('supabase/functions/_shared/publicConnectedAccount.ts', 'utf8');
const publicJs = (await transform(publicSource, { loader: 'ts', format: 'esm' })).code;
const { PUBLIC_ACCOUNT_COLUMNS, publicConnectedAccount } = await import('data:text/javascript;base64,' + Buffer.from(publicJs).toString('base64'));
const source = fs.readFileSync('supabase/functions/plaid-exchange-token/index.ts', 'utf8');
const handlerJs = (await transform(source.replace(/^import .*;\r?\n/gm, ''), { loader: 'ts' })).code;
const syntheticToken = 'synthetic-private-token-not-real';

async function run({saveFails=false,authenticated=true,invalid=false,cleanupFails=false}={}) {
 let handler; let exchanges=0; let removals=0; const calls=[];
 const admin={rpc:async(name,args)=>{assert.equal(name,'save_plaid_accounts_private');calls.push(args);return {data:saveFails?null:args.p_accounts.map((a,i)=>({...a,id:`account-${i}`,future_secret:syntheticToken,access_token_ref:syntheticToken})),error:saveFails?new Error('synthetic database failure'):null};}};
 vm.runInNewContext(handlerJs,{
 Deno:{serve:fn=>handler=fn,env:{get:()=> 'synthetic-config'}},handleOptions:()=>null,getUser:async()=>authenticated?{id:'synthetic-user'}:null,serviceClient:()=>admin,
 enforceRateLimit:async()=>null,identityFromRequest:()=>'',RULES:{sync:{}},Configuration:class{},PlaidEnvironments:{production:'unused'},
 PlaidApi:class {async itemPublicTokenExchange(){exchanges++;return {data:{access_token:syntheticToken,item_id:'fixture-item'}};}async itemRemove(){removals++;if(cleanupFails)throw new Error('synthetic cleanup failure');return {data:{request_id:'fixture'}};}},
 jsonResponse:(body,status)=>({body,status}),errorResponse:(error,status)=>({body:{error},status}),publicConnectedAccount,console:{error(){}}
 });
 const response=await handler({json:async()=>({public_token:'fixture-public',institution_name:'Fixture Bank',accounts:invalid?[]:[{id:'checking',name:'Checking',type:'depository',mask:'1234',balances:{current:125}},{id:'savings',name:'Savings'}]})});
 return {response,calls,exchanges,removals};
}
const success=await run();assert.equal(success.response.status,200);assert.equal(success.response.body.accounts.length,2);assert.equal(success.response.body.accounts[0].current_balance,125);
assert.equal(success.calls[0].p_user_id,'synthetic-user');assert.equal(success.calls[0].p_access_token,syntheticToken);
assert.ok(success.calls[0].p_accounts.every(a=>!Object.hasOwn(a,'access_token_ref')));assert.ok(!JSON.stringify(success.response).includes(syntheticToken));
for(const cleanupFails of [false,true]){const failed=await run({saveFails:true,cleanupFails});assert.equal(failed.response.status,500);assert.equal(failed.removals,1);assert.ok(!JSON.stringify(failed.response).includes(syntheticToken));}
const denied=await run({authenticated:false});assert.equal(denied.response.status,401);assert.equal(denied.exchanges,0);
const invalid=await run({invalid:true});assert.equal(invalid.response.status,400);assert.equal(invalid.exchanges,0);
console.log('PASS: exchange uses atomic private save, strips credential fields, fails closed and attempts provider cleanup; invalid/unauthenticated requests never exchange');