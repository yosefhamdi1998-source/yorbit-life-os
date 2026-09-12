import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { transform } from 'esbuild';
const source=fs.readFileSync('supabase/functions/delete-account/index.ts','utf8');
const js=(await transform(source.replace(/^import .*;\r?\n/gm,''),{loader:'ts'})).code;
for(const fails of [false,true]) {
 let handler; const requests=[],lookups=[]; const failure=new Error('synthetic deletion failure');
 const admin={from(table){return {select(columns){assert.equal(table,'connected_accounts');assert.equal(columns,'id');const q={eq(field,value){if(field==='user_id'){assert.equal(value,'fixture-user');return q;}assert.equal(field,'provider');return Promise.resolve({data:[{id:'vault-only'}]});}};return q;},delete(){return {eq:async()=>({error:null,count:0})};}}},auth:{admin:{deleteUser:async id=>{assert.equal(id,'fixture-user');return {error:fails?failure:null};}}}};
 vm.runInNewContext(js,{Deno:{serve:fn=>handler=fn,env:{get:key=>key==='STRIPE_SECRET_KEY'?null:'fixture'}},getUser:async()=>({id:'fixture-user'}),serviceClient:()=>admin,handleOptions:()=>null,enforceRateLimit:async(_b,_i,_r,msg,req)=>{assert.equal(msg,undefined);assert.ok(req);return null;},identityFromRequest:()=>'',RULES:{destructive:{}},getPlaidAccessToken:async(_admin,id)=>{lookups.push(id);return {token:'synthetic-vault-token',source:'vault'};},fetch:async(_url,opts)=>{requests.push(JSON.parse(opts.body));return {json:async()=>({removed:true})};},jsonResponse:(body,status)=>({body,status}),errorResponse:(msg,status,opts)=>{assert.equal(opts.internal,failure);return {body:{error:msg},status};},console:{log(){},error(){},warn(){}}});
 const response=await handler({});assert.equal(response.status,fails?500:200);assert.deepEqual(lookups,['vault-only']);assert.equal(requests[0].access_token,'synthetic-vault-token');
}
console.log('PASS: actual deletion handler unlinks vault-only account, preserves auth deletion failure and rate-limit request; all dependencies synthetic');
