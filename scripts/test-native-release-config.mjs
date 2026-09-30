import assert from 'node:assert/strict';
import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
import {loadEnv} from 'vite';
const run=(appId,publicKey,extra={})=>spawnSync(process.execPath,['scripts/check-native-release.mjs'],{encoding:'utf8',env:{...process.env,APP_STORE_APPLE_ID:appId,VITE_REVENUECAT_APPLE_API_KEY:publicKey,...extra}});
for (const [id,key] of [['',''],['app.yorbit','appl_fixture123'],['123','sk_fixtureSecret'],['123','goog_fixture'],['123','appl_xxxxx']]) {
 const result=run(id,key);
 assert.equal(result.status,1);
 if(key) assert.equal(result.stderr.includes(key),false,'Never echo supplied key');
}
assert.equal(run('123456789','appl_fixture123').status,0);
assert.equal(run(' 123456789 ',' appl_fixture123 ').status,0);
console.log('PASS: native preflight rejects missing/invalid/secret/platform/placeholder values without exposing them; accepts valid format');

// The cloud iOS build has no Vercel settings: the app's Supabase project must
// come from the tracked public .env.production, and only publishable values
// may ever be there or in the environment.
const file=fs.readFileSync('.env.production','utf8');
const vars=Object.fromEntries(file.split(/\r?\n/).filter(l=>/^[A-Z]/.test(l)).map(l=>[l.slice(0,l.indexOf('=')),l.slice(l.indexOf('=')+1)]));
assert.deepEqual(Object.keys(vars).sort(),['VITE_SUPABASE_ANON_KEY','VITE_SUPABASE_URL'],'only public Supabase settings belong in the tracked file');
assert.match(vars.VITE_SUPABASE_URL,/^https:\/\/[a-z0-9]{20}\.supabase\.co$/);
assert.match(vars.VITE_SUPABASE_ANON_KEY,/^sb_publishable_/);
// Vite reads the file in a production build, and an environment value wins.
const saved={url:process.env.VITE_SUPABASE_URL,key:process.env.VITE_SUPABASE_ANON_KEY};
delete process.env.VITE_SUPABASE_URL; delete process.env.VITE_SUPABASE_ANON_KEY;
assert.equal(loadEnv('production',process.cwd(),'VITE_').VITE_SUPABASE_URL,vars.VITE_SUPABASE_URL);
process.env.VITE_SUPABASE_URL='https://abcdefghijklmnopqrst.supabase.co';
assert.equal(loadEnv('production',process.cwd(),'VITE_').VITE_SUPABASE_URL,'https://abcdefghijklmnopqrst.supabase.co','Vercel settings keep precedence');
delete process.env.VITE_SUPABASE_URL;
if(saved.url!==undefined)process.env.VITE_SUPABASE_URL=saved.url; if(saved.key!==undefined)process.env.VITE_SUPABASE_ANON_KEY=saved.key;

const ok=['123456789','appl_fixture123'];
const jwt=role=>['{"alg":"HS256","typ":"JWT"}',JSON.stringify({role})].map(s=>Buffer.from(s).toString('base64url')).join('.')+'.fixture';
for (const [label,extra] of [
 ['secret key',{VITE_SUPABASE_ANON_KEY:['sb','secret','fixtureValue'].join('_')}],
 ['service_role JWT',{VITE_SUPABASE_ANON_KEY:jwt('service_role')}],
 ['unreadable JWT',{VITE_SUPABASE_ANON_KEY:'eyJnot-a-token'}],
 ['wrong URL',{VITE_SUPABASE_URL:'https://evil.example.com'}],
 ['no file and no environment',{YORBIT_PUBLIC_ENV_FILE:'does-not-exist.env'}],
]) {
 const result=run(...ok,extra);
 assert.equal(result.status,1,label);
 for (const value of Object.values(extra)) if(!value.endsWith('.env')) assert.equal(result.stderr.includes(value),false,`${label}: never echo supplied values`);
}
assert.equal(run(...ok,{VITE_SUPABASE_ANON_KEY:jwt('anon')}).status,0,'a legacy anon JWT is publishable');
assert.equal(run(...ok,{YORBIT_PUBLIC_ENV_FILE:'does-not-exist.env',VITE_SUPABASE_URL:vars.VITE_SUPABASE_URL,VITE_SUPABASE_ANON_KEY:vars.VITE_SUPABASE_ANON_KEY}).status,0,'environment alone is enough');
console.log('PASS: the iOS build gets the Supabase project from environment or tracked .env.production (environment wins); only publishable keys pass, secret/service_role keys are refused without being echoed');
