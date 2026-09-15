import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createNativeAuthHandler, parseNativeAuthUrl, NATIVE_AUTH_REDIRECT } from '../src/lib/nativeAuth.js';
const callback = code => `${NATIVE_AUTH_REDIRECT}?code=${code}`;
for (const url of ['https://evil.test/auth/callback?code=x','app.yorbit://evil/callback?code=x','app.yorbit://auth/other?code=x','app.yorbit://user@auth/callback?code=x','app.yorbit://auth:12/callback?code=x','garbage']) assert.equal(parseNativeAuthUrl(url),null);
for (const url of [NATIVE_AUTH_REDIRECT,`${NATIVE_AUTH_REDIRECT}?code=`,`${NATIVE_AUTH_REDIRECT}?code=a&code=b`,`${NATIVE_AUTH_REDIRECT}?code=x#error=bad`,`${NATIVE_AUTH_REDIRECT}#access_token=x&refresh_token=y`,`${NATIVE_AUTH_REDIRECT}?code=x&error=denied`,`${NATIVE_AUTH_REDIRECT}?code=x&access_token=y`,`${NATIVE_AUTH_REDIRECT}?code=x&refresh_token=y`]) assert.equal(parseNativeAuthUrl(url).invalid,true);
const calls=[], destinations=[]; let errors=0, closed=0, release;
const pending=new Promise(r=>{release=r;});
const handle=createNativeAuthHandler({exchange:async code=>{calls.push(code); await pending; return {data:{session:{user:{id:'synthetic'}},redirectType:'recovery'}};},navigate:path=>destinations.push(path),closeBrowser:async()=>{closed++;},onError:()=>{errors++;}});
await handle('https://evil.test?code=x'); assert.equal(calls.length,0);
const first=handle(callback('one')); const duplicate=handle(callback('one'));
release(); await Promise.all([first,duplicate]); assert.deepEqual(calls,['one']); assert.deepEqual(destinations,['/reset-password']); assert.equal(closed,1);
await handle(callback('one')); assert.equal(calls.length,1);
for (const result of [{error:new Error('secret')},{data:{session:null}},null]) {
 let failure=0;
 const h=createNativeAuthHandler({exchange:async()=>result,navigate:()=>assert.fail('must not navigate'),closeBrowser:()=>assert.fail('must not close'),onError:()=>failure++});
 await h(callback('fail')); assert.equal(failure,1);
}
let thrownErrors=0;
await createNativeAuthHandler({exchange:async()=>{throw new Error('provider secret');},navigate:()=>assert.fail(),closeBrowser:()=>{},onError:()=>thrownErrors++})(callback('throw'));
assert.equal(thrownErrors,1);
const routes=[];
await createNativeAuthHandler({exchange:async()=>({data:{session:{user:{id:'synthetic'}},redirectType:null}}),navigate:p=>routes.push(p),closeBrowser:async()=>{throw new Error('not open');},onError:()=>assert.fail()})(callback('valid')+'&type=recovery&redirect=https://evil.test');
assert.deepEqual(routes,['/']);
await handle(`${NATIVE_AUTH_REDIRECT}#access_token=synthetic`); assert.equal(errors,1);
// Integration contracts: no auth callback tokens copied into route/history; only native switches to PKCE.
const client=fs.readFileSync('src/api/supabaseClient.js','utf8');
assert.match(client,/flowType: isNative\(\) \? 'pkce' : 'implicit'/);
assert.match(client,/detectSessionInUrl: !isNative\(\)/);
assert.match(fs.readFileSync('ios/App/App/Info.plist','utf8'),/<key>CFBundleURLSchemes<\/key><array><string>app.yorbit<\/string>/);
console.log('PASS native auth: exact callback allowlist, token rejection, duplicate delivery, PKCE session confirmation, recovery routing, failed exchange, safe browser close');

assert.ok(!fs.readFileSync('ios/App/CapApp-SPM/Package.swift','utf8').includes('\\'), 'Swift package paths must use forward slashes on macOS');
