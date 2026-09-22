import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {statementRowKey} from '../src/lib/csv.js';
// doImport now delegates dedup to planImport; the with(scope) eval needs it or
// it throws inside the try and silently imports nothing.
import {planImport} from '../src/lib/importDedup.js';
import {createAccountOperation} from '../src/lib/accountOperation.js';
const source=readFileSync('src/pages/CSVImport.jsx','utf8');
const body=source.match(/const doImport = async \(\) => \{([\s\S]*?)\n  \};/)[1];
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
const run=new AsyncFunction('scope',`with(scope){${body}}`);
function harness(list) {
 const writes=[],states=[],errors=[],steps=[],counts={};
 const scope={user:{id:'fixture-a'},createAccountOperation,importLock:{current:false},collected:[{title:'Synthetic',date:'2026-09-01',type:'expense',amount:10,category:'food'}],statementRowKey,planImport,overlapChoices:{},
 base44:{auth:{getSession:async()=>({user:{id:'fixture-a'}}),onAuthStateChange:()=>()=>{}},entities:{Transaction:{listAll:list,create:async row=>writes.push(row)}}},setImporting:v=>states.push(v),setError:v=>errors.push(v),setImportProgress:()=>{},setImportedRange:v=>counts.range=v,setImportedCount:v=>counts.imported=v,setSkippedCount:v=>counts.skipped=v,setFailedCount:v=>counts.failed=v,setStep:v=>steps.push(v)};
 return {scope,writes,states,errors,steps,counts};
}
{
 let release,reads=0;
 const pending=new Promise(resolve=>{release=resolve;});
 const h=harness(async()=>{reads++;return pending;});
 const first=run(h.scope); const second=run(h.scope);
 release([]); await Promise.all([first,second]);
 assert.equal(reads,1); assert.equal(h.writes.length,1); assert.equal(h.counts.imported,1);
 assert.equal(h.scope.importLock.current,false); assert.deepEqual(h.states,[true,false]);
 h.scope.base44.entities.Transaction.listAll=async()=>h.writes;
 await run(h.scope); assert.equal(h.writes.length,1); assert.equal(h.counts.skipped,1);
}
for(const result of ['throw',null]) {
 const h=harness(async()=>{if(result==='throw')throw new Error('Synthetic read failure');return result;});
 await run(h.scope); assert.equal(h.writes.length,0); assert.equal(h.scope.importLock.current,false);
 assert.equal(h.states.at(-1),false); assert.ok(h.errors.at(-1));
 h.scope.base44.entities.Transaction.listAll=async()=>[]; await run(h.scope); assert.equal(h.writes.length,1);
}
{
 const reset=source.match(/const reset = \(\) => \{([\s\S]*?)\n  \};/)[1];
 new Function('scope',`with(scope){${reset}}`)({importLock:{current:true}});
}
console.log('PASS: rapid import taps write once; retry deduplicates; read/unexpected failures and reset guards preserve recovery');

for (const phase of ['read', 'write', 'last-write', 'away-and-back']) {
 const h=harness(async()=>[]);
 let account='fixture-a', listener, disposed=0;
 h.scope.collected.push({...h.scope.collected[0],title:'Second fixture'});
 h.scope.base44.auth={getSession:async()=>({user:{id:account}}),onAuthStateChange:fn=>{listener=fn;return()=>disposed++;}};
 const change=()=>{account='fixture-b';listener({user:{id:account}});};
 if(phase==='read')h.scope.base44.entities.Transaction.listAll=async()=>{change();return [];};
 h.scope.base44.entities.Transaction.create=async(row,options)=>{
   assert.equal(options.expectedUserId,'fixture-a');assert.equal(account,'fixture-a');
   h.writes.push(row);
   if(phase==='write'||phase==='away-and-back'||(phase==='last-write'&&h.writes.length===2))change();
   if(phase==='away-and-back'){account='fixture-a';listener({user:{id:account}});}
 };
 await run(h.scope);
 assert.equal(h.writes.length,phase==='read'?0:phase==='last-write'?2:1,phase);
 assert.equal(h.steps.includes('done'),false,phase);
 assert.match(h.errors.at(-1),/account changed/);
 assert.equal(disposed,1);assert.equal(h.scope.importLock.current,false);
}
console.log('PASS: imports stop on account change during dedup or writes; away/back stays cancelled; no false success receipt');
