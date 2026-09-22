import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {transformSync} from 'esbuild';
const source=transformSync(fs.readFileSync('supabase/functions/cleanup-duplicate-records/index.ts','utf8').replace(/^import .*;\r?\n/gm,''),{loader:'ts'}).code;
for(const role of ['anonymous','user','admin']){
 let handler;
 vm.runInNewContext(source,{
 Deno:{serve:fn=>handler=fn},handleOptions:()=>null,getUser:async()=>role==='anonymous'?null:{id:'fixture'},
 serviceClient:()=>({from:table=>{assert.equal(table,'profiles','Retired cleanup must not even read financial records');return {select:()=>({eq:()=>({single:async()=>({data:{role}})})})};}}),
 jsonResponse:(body,status)=>({body,status}),errorResponse:()=>assert.fail('Unexpected error'),
 });
 const r=await handler({});assert.equal(r.status,role==='anonymous'?401:role==='admin'?410:403);
}
console.log('PASS retired bulk cleanup: anonymous denied, ordinary user forbidden, admin receives 410; zero financial reads/deletes');
