import assert from 'node:assert/strict';
import { validateNetWorthEntry as validate } from '../src/lib/netWorthValidation.js';
const entry = { name: 'Savings', value: '125.50', type: 'asset' };
for (const name of ['', '   ', '\t', null, undefined]) assert.ok(validate({...entry, name}));
for (const value of ['', ' ', '0', '-1', '12oops', 'Infinity', '1e309', 'NaN', undefined]) assert.ok(validate({...entry, value}), String(value));
for (const type of ['asset','liability']) assert.equal(validate({...entry,type}),null);
assert.equal(validate({...entry,name:' Savings ',value:' 125.50 '}),null);
assert.ok(validate({...entry,type:'unknown'}));
console.log('PASS: net worth rejects blank names and invalid/nonpositive amounts; accepts assets and liabilities');

// Exercise the actual page handlers with deferred reads/writes, not a copied predicate.
const { readFileSync } = await import('node:fs');
const source = readFileSync('src/pages/Finance.jsx', 'utf8');
const saveBody = source.split('  const saveNW = async () => {')[1].split('\n  const deleteNW')[0].replace(/};\s*$/, '');
const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
let writes = 0, releaseWrite, refreshes = 0, saving = false;
const lock = { current: false };
const save = new AsyncFunction('nwSaveLock','nwForm','validateNetWorthEntry','setNwSaving','base44','setShowNWForm','setNwForm','toast','loadData',saveBody);
let failWrite = false;
const api = { entities: { NetWorthEntry: { create: async () => {
  writes++;
  if (failWrite) throw new Error('Synthetic write failure');
  await new Promise(resolve => { releaseWrite = resolve; });
} } } };
const runSave = () => save(lock,entry,validate,value=>{saving=value;},api,()=>{},()=>{},()=>{},async()=>{refreshes++;});
const first = runSave();
await runSave();
assert.equal(writes,1,'Two submissions before React rerenders create only one entry');
assert.equal(saving,true);
releaseWrite(); await first;
assert.equal(refreshes,1); assert.equal(lock.current,false); assert.equal(saving,false);
failWrite=true; await runSave();
assert.equal(lock.current,false,'Failure releases the save lock');
failWrite=false; const retry=runSave(); releaseWrite(); await retry;
assert.equal(writes,3,'A failed request can be retried');

const loadBody = source.split('  const loadData = async (showSkeleton = false) => {')[1].split('\n  useEffect')[0].replace(/};\s*$/, '');
const load = new AsyncFunction('showSkeleton','setLoading','setLoadFailed','base44','setTransactions','setBudgets','setNetWorth','setAccounts','toast',loadBody);
let loadFailed=false, commits=0, loading=true, failAccounts=true;
const entityApi = { entities: Object.fromEntries(['Transaction','Budget','NetWorthEntry','ConnectedAccount'].map(name=>[name,{list:async()=>{
  if(name==='ConnectedAccount' && failAccounts) throw new Error('Synthetic account read failure');
  return [];
}}])) };
const runLoad=()=>load(false,v=>{loading=v;},v=>{loadFailed=v;},entityApi,()=>{commits++;},()=>{commits++;},()=>{commits++;},()=>{commits++;},()=>{});
await runLoad();
assert.equal(loadFailed,true,'Unavailable bank accounts cannot be reported as zero accounts');
assert.equal(commits,0,'Retain previous financial data on a partial read failure');
assert.equal(loading,false);
failAccounts=false; await runLoad();
assert.equal(loadFailed,false); assert.equal(commits,4,'Retry applies a complete snapshot');
console.log('PASS: net worth save concurrency/failure recovery and account-load failure/retry');
