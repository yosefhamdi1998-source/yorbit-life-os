import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createAccountOperation} from '../src/lib/accountOperation.js';
function authHarness() {
 let id='a', listener, disposed=0;
 return {auth:{getSession:async()=>id?{user:{id}}:null,onAuthStateChange:fn=>{listener=fn;return()=>disposed++;}},change(next){id=next;listener(id?{user:{id}}:null);},get disposed(){return disposed;}};
}
for(const next of ['b',null,'a']){
 const h=authHarness(),op=createAccountOperation(h.auth,'a');
 await op.assertCurrent();h.change(next);
 if(next==='a')await op.assertCurrent();else await assert.rejects(op.assertCurrent(),{code:'ACCOUNT_CHANGED'});
 op.dispose();assert.equal(h.disposed,1);
}
{
 const h=authHarness(),op=createAccountOperation(h.auth,'a');
 h.change('b');h.change('a');await assert.rejects(op.assertCurrent(),{code:'ACCOUNT_CHANGED'});op.dispose();
}
{
 const h=authHarness(),op=createAccountOperation(h.auth,undefined);
 await assert.rejects(op.assertCurrent(),{code:'ACCOUNT_CHANGED'});op.dispose();
}
{
 const h=authHarness();let release;
 h.auth.getSession=()=>new Promise(resolve=>{release=resolve;});
 const op=createAccountOperation(h.auth,'a'),pending=op.assertCurrent();
 h.change('b');release({user:{id:'a'}});
 await assert.rejects(pending,{code:'ACCOUNT_CHANGED'});op.dispose();
}
// Exercise the real entity adapter: no insert is issued if getUser changes.
let inserts=0,current='a';
globalThis.__accountWriteMock={auth:{getUser:async()=>({data:{user:{id:current}},error:null})},from(){return{insert(row){inserts++;assert.equal(row.user_id,'a');return this;},select(){return this;},single:async()=>({data:{id:'synthetic'},error:null})};}};
const entitySource=readFileSync('src/api/entities.js','utf8').replace("import { supabase } from './supabaseClient';",'const supabase = globalThis.__accountWriteMock;');
const {entities}=await import('data:text/javascript;base64,'+Buffer.from(entitySource).toString('base64'));
await entities.Transaction.create({amount:1},{expectedUserId:'a'});assert.equal(inserts,1);
current='b';await assert.rejects(entities.Transaction.create({amount:1},{expectedUserId:'a'}),{code:'ACCOUNT_CHANGED'});assert.equal(inserts,1);
delete globalThis.__accountWriteMock;
// Execute the actual export handler with all entity reads stubbed. A session
// change anywhere in the parallel reads must prevent the download entirely.
const source=readFileSync('src/pages/Settings.jsx','utf8');
const body=source.match(/const handleExportData = async \(\) => \{([\s\S]*?)\n  \};/)[1];
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
const run=new AsyncFunction('scope',`with(scope){${body}}`);
for(const phase of ['normal','refresh','switch','away-and-back','read-failure']){
 const h=authHarness();let downloads=0,reads=0,done=0;const toasts=[];
 const list=async()=>{reads++;if(reads===3){if(phase==='switch'||phase==='away-and-back')h.change('b');if(phase==='away-and-back'||phase==='refresh')h.change('a');if(phase==='read-failure')throw Error('Synthetic page failure');}return [];};
 const scope={user:{id:'a'},createAccountOperation,exportingRef:{current:false},base44:{auth:h.auth,entities:new Proxy({}, {get:()=>({list,listAll:list})})},setExporting:()=>{},setExportDone:v=>{if(v)done++;},toast:v=>toasts.push(v),setTimeout:()=>{},Blob,URL:{createObjectURL:()=> 'blob:synthetic',revokeObjectURL:()=>{}},document:{createElement:()=>({click:()=>downloads++})}};
 await run(scope);
 const success=phase==='normal'||phase==='refresh';assert.equal(downloads,success?1:0,phase);assert.equal(done,success?1:0,phase);assert.equal(toasts.length,success?0:1);assert.equal(h.disposed,1);assert.equal(scope.exportingRef.current,false);
}
console.log('PASS: session checks, auth races, adapter ownership and exports retain one account; no mixed-account download');
