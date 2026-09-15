import assert from 'node:assert/strict';
import fs from 'node:fs';
const source = fs.readFileSync('src/pages/ResetPassword.jsx','utf8');
const body = source.split('  useEffect(() => {')[1].split('  }, []);')[0];
const run = new Function('supabase','setReady','setInvalid','setTimeout','clearTimeout',body);
const tick = async()=>{await Promise.resolve();await Promise.resolve();};
function harness() {
  const state={ready:false,invalid:false,unsubscribed:false};
  let event, timeout;
  const requests=[];
  const cleanup=run({auth:{getSession:()=>new Promise((resolve,reject)=>requests.push({resolve,reject})),onAuthStateChange:fn=>{event=fn;return {data:{subscription:{unsubscribe:()=>{state.unsubscribed=true;}}}};}}},v=>{state.ready=v;},v=>{state.invalid=v;},fn=>{timeout=fn;return 1;},()=>{});
  return {state,requests,cleanup,event:kind=>event(kind),timeout:()=>timeout()};
}
{
 const h=harness();h.requests[0].reject(new Error('Offline'));await tick();
 assert.equal(h.state.invalid,true);assert.equal(h.state.ready,false);
 h.event('PASSWORD_RECOVERY');assert.equal(h.state.ready,true);assert.equal(h.state.invalid,false);h.cleanup();
}
{
 const h=harness();h.requests[0].resolve({data:null,error:new Error('Storage unavailable')});await tick();
 assert.equal(h.state.invalid,true);h.cleanup();
}
{
 const h=harness();h.event('SIGNED_OUT');h.requests[0].resolve({data:{session:{}}});await tick();
 assert.equal(h.state.ready,false,'Stale session cannot re-enable reset after sign-out');h.cleanup();
}
{
 const h=harness();h.timeout();h.requests[1].resolve({data:{session:{}}});await tick();
 h.requests[0].reject(new Error('Old failure'));await tick();assert.equal(h.state.ready,true);assert.equal(h.state.invalid,false);h.cleanup();
}
{
 const h=harness();h.requests[0].resolve({data:{session:null}});await tick();assert.equal(h.state.invalid,false);
 h.timeout();h.requests[1].resolve({data:{session:null}});await tick();assert.equal(h.state.invalid,true);h.cleanup();
}
{
 const h=harness();h.cleanup();h.requests[0].resolve({data:{session:{}}});await tick();
 assert.equal(h.state.ready,false);assert.equal(h.state.unsubscribed,true);
}
console.log('PASS password recovery: rejected/error reads, late recovery, stale sign-out results, timeout ordering, missing session, cleanup');
