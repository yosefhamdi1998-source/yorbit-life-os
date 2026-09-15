import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync('src/pages/AppStoreCopy.jsx','utf8');
const body=source.match(/const copy = async \(\) => \{([\s\S]*?)\n  \};/)[1];
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
const run=new AsyncFunction('navigator','content','setCopying','setCopied','setCopyError','setTimeout',body);
let complete;
const pending=new Promise(resolve=>{complete=resolve;});
const copied=[],busy=[],errors=[];
const task=run({clipboard:{writeText:()=>pending}},'Synthetic listing',v=>busy.push(v),v=>copied.push(v),v=>errors.push(v),()=>{});
assert.deepEqual(copied,[false],'No copied confirmation before clipboard accepts text');
complete(); await task;
assert.deepEqual(copied,[false,true]); assert.deepEqual(busy,[true,false]);
for(const navigator of [{},{clipboard:{writeText:async()=>{throw new Error('Permission denied');}}}]) {
 const flags=[],states=[],messages=[];
 await run(navigator,'Synthetic listing',v=>states.push(v),v=>flags.push(v),v=>messages.push(v),()=>{});
 assert.deepEqual(flags,[false]); assert.deepEqual(states,[true,false]); assert.match(messages.at(-1),/copy it manually/);
}
console.log('PASS: store-copy waits for clipboard success and offers manual recovery on denied or unavailable clipboard');
