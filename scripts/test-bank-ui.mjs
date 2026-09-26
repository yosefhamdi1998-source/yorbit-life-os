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
// The server tells a live conflict ("someone else is already syncing this
// account") apart from a real failure with a short, specific message -
// base44's client already turns it into a safe Error. Showing a fixed
// "please try again" for both used to tell someone who merely double-
// clicked that something was broken; this asserts the actual message is
// what reaches the screen, not just that some error did.
for(const kind of ['checking','investment']) {
 let error=null;
 await sync({id:'fixture',accountType:kind,full:false,setSyncingId:()=>{},setSyncResult:()=>{},setError:v=>error=v,
 base44:{functions:{invoke:async()=>{throw new Error('This account is already syncing.');}}},loadAccounts:async()=>{}});
 assert.equal(error,'This account is already syncing.','the server\'s own message reaches the screen unmodified');
}
// A message-less throw (e.g. base44's client falling back on something
// that looked internal) must not leave the banner blank.
{
 let error=null;
 await sync({id:'fixture',accountType:'checking',full:false,setSyncingId:()=>{},setSyncResult:()=>{},setError:v=>error=v,
 base44:{functions:{invoke:async()=>{const e=new Error();e.message='';throw e;}}},loadAccounts:async()=>{}});
 assert.equal(error,"We couldn't sync your transactions. Please try again.",'an empty message falls back to the fixed one, not a blank banner');
}
const disconnectBody=source.match(/const disconnect = async \(id\) => \{([\s\S]*?)\n  \};/)[1];
const disconnect=new AsyncFunction('scope','with(scope){'+disconnectBody+'}');
for(const outcome of ['success','failure','unconfirmed']) {
 let removed=0,error=null,busy='untouched';
 await disconnect({id:'fixture',setDisconnectingId:v=>busy=v,setError:v=>error=v,setAccounts:()=>removed++,setHoldings:()=>removed++,
 base44:{functions:{invoke:async()=>{if(outcome==='failure')throw new Error('Synthetic');return outcome==='unconfirmed'?{}:{success:true};}}}});
 assert.equal(removed,outcome==='success'?2:0);assert.equal(Boolean(error),outcome!=='success');assert.equal(busy,null);
}
// The server's own message (e.g. a blocked-by-sibling or provider failure)
// must reach the screen unmodified, not a fixed string - matching connectBank/syncAccount.
{
 let error=null;
 await disconnect({id:'fixture',setDisconnectingId:()=>{},setError:v=>error=v,setAccounts:()=>{},setHoldings:()=>{},
 base44:{functions:{invoke:async()=>{throw new Error("We couldn't confirm the disconnect with your bank. Please try again.");}}}});
 assert.equal(error,"We couldn't confirm the disconnect with your bank. Please try again.");
}
console.log('PASS bank UI: failed/unconfirmed sync refreshes status, success confirmed, failed/unconfirmed disconnect retains records, releases controls, and surfaces the server\'s own message');
