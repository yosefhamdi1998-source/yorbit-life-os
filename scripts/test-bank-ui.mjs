import assert from 'node:assert/strict';
import fs from 'node:fs';
const source=fs.readFileSync('src/pages/BankSync.jsx','utf8');
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
const syncBody=source.match(/const syncAccount = async \(id, accountType, full = false\) => \{([\s\S]*?)\n  \};/)[1];
const sync=new AsyncFunction('scope', 'with(scope){'+syncBody+'}');
for(const kind of ['checking','investment']) for(const outcome of ['success','failure','unconfirmed']) {
 let loads=0,busy='untouched',error=null,result=null;
 await sync({id:'fixture',accountType:kind,full:false,setSyncingId:v=>busy=v,setSyncResult:v=>result=v,setError:v=>error=v,
 base44:{functions:{invoke:async()=>{if(outcome==='failure')throw new Error('Synthetic');return outcome==='unconfirmed'?{}:{success:true,imported:2,synced:3};}}},loadAccounts:async()=>{loads++;}});
 assert.equal(loads,1);assert.equal(busy,null);assert.equal(Boolean(error),outcome!=='success');assert.equal(Boolean(result),outcome==='success');
}
const disconnectBody=source.match(/const disconnect = async \(id\) => \{([\s\S]*?)\n  \};/)[1];
const disconnect=new AsyncFunction('scope','with(scope){'+disconnectBody+'}');
for(const fails of [false,true]) {
 let removed=0,error=null,busy='untouched';
 await disconnect({id:'fixture',setDisconnectingId:v=>busy=v,setError:v=>error=v,setAccounts:()=>removed++,setHoldings:()=>removed++,base44:{entities:{ConnectedAccount:{update:async()=>{if(fails)throw new Error('Synthetic');}}}}});
 assert.equal(removed,fails?0:2);assert.equal(Boolean(error),fails);assert.equal(busy,null);
}
console.log('PASS bank UI: failed/unconfirmed sync refreshes status, success confirmed, failed disconnect retains records and releases controls');
