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

// Containment: BANK_DISCONNECT_AVAILABLE is currently false in the real
// source (the corrected backend isn't deployed yet - see YORBIT_PROGRESS.md
// 2026-09-27). Confirm the button fails safe on its own, without ever
// calling the missing function, and never engages the busy lock.
assert.match(source,/const BANK_DISCONNECT_AVAILABLE = false;/,'containment must still be active - do not flip this back without deploying and verifying the corrected backend first');
{
 let error=null,busy='untouched',invoked=0;
 await disconnect({id:'fixture',setDisconnectingId:v=>busy=v,setError:v=>error=v,setAccounts:()=>{},setHoldings:()=>{},
 BANK_DISCONNECT_AVAILABLE:false,DISCONNECT_UNAVAILABLE_MESSAGE:'fixture unavailable message',
 base44:{functions:{invoke:async()=>{invoked++;return {success:true};}}}});
 assert.equal(invoked,0,'must never call the missing backend function while disabled');
 assert.equal(error,'fixture unavailable message');
 assert.equal(busy,'untouched','short-circuits before ever engaging the busy lock');
}

// The real network path, exercised with the flag force-enabled through the
// harness scope so re-enabling it later (a one-line flip in the real
// source, once the corrected backend is deployed and verified) is provably
// still correct today, not just assumed to still work.
for(const outcome of ['success','failure','unconfirmed']) {
 let removed=0,error=null,busy='untouched',reloads=0;
 await disconnect({id:'fixture',setDisconnectingId:v=>busy=v,setError:v=>error=v,setAccounts:()=>removed++,setHoldings:()=>removed++,
 loadAccounts:async()=>{reloads++;},BANK_DISCONNECT_AVAILABLE:true,
 base44:{functions:{invoke:async()=>{if(outcome==='failure')throw new Error('Synthetic');return outcome==='unconfirmed'?{}:{success:true};}}}});
 assert.equal(removed,outcome==='success'?2:0);assert.equal(Boolean(error),outcome!=='success');assert.equal(busy,null);
 // A failed or unconfirmed disconnect may have left the account 'disconnecting'
 // on the server; reloading is what makes that unfinished state visible.
 assert.equal(reloads,outcome==='success'?0:1,'failure must reload so an unfinished disconnect is shown, not hidden');
}
// The server's own message (e.g. a blocked-by-sibling or provider failure)
// must reach the screen unmodified, not a fixed string - matching connectBank/syncAccount.
{
 let error=null;
 await disconnect({id:'fixture',setDisconnectingId:()=>{},setError:v=>error=v,setAccounts:()=>{},setHoldings:()=>{},
 loadAccounts:async()=>{},BANK_DISCONNECT_AVAILABLE:true,
 base44:{functions:{invoke:async()=>{throw new Error("We couldn't confirm the disconnect with your bank. Please try again.");}}}});
 assert.equal(error,"We couldn't confirm the disconnect with your bank. Please try again.");
}
assert.match(source,/disconnecting: \{ icon: AlertCircle/,'disconnecting needs its own visible status label');
assert.match(source,/acct\.sync_status === 'disconnecting' \? \(/,'a disconnecting account must get its own action (retry), checked before Sync/Reconnect');
assert.match(source,/x\.sync_status !== 'disconnecting'\)/,'bulk full-history sync must skip accounts that are mid-disconnect');
console.log('PASS bank UI: failed/unconfirmed sync refreshes status, success confirmed, disconnect containment fails safe with no network call, and the underlying disconnect path (force-enabled) still retains records, releases controls, and surfaces the server\'s own message');
