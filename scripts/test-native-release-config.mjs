import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
const run=(appId,publicKey)=>spawnSync(process.execPath,['scripts/check-native-release.mjs'],{encoding:'utf8',env:{...process.env,APP_STORE_APPLE_ID:appId,VITE_REVENUECAT_APPLE_API_KEY:publicKey}});
for (const [id,key] of [['',''],['app.yorbit','appl_fixture123'],['123','sk_fixtureSecret'],['123','goog_fixture'],['123','appl_xxxxx']]) {
 const result=run(id,key);
 assert.equal(result.status,1);
 if(key) assert.equal(result.stderr.includes(key),false,'Never echo supplied key');
}
assert.equal(run('123456789','appl_fixture123').status,0);
assert.equal(run(' 123456789 ',' appl_fixture123 ').status,0);
console.log('PASS: native preflight rejects missing/invalid/secret/platform/placeholder values without exposing them; accepts valid format');
