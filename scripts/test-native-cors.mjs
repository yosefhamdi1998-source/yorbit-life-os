import assert from 'node:assert/strict';
import fs from 'node:fs';
import { transformSync } from 'esbuild';
const js = transformSync(fs.readFileSync('supabase/functions/_shared/cors.ts','utf8'),{loader:'ts',format:'esm'}).code;
const {handleOptions,jsonResponse} = await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
for (const origin of ['capacitor://localhost','https://localhost','https://yorbit-life-os.vercel.app']) {
 const req = new Request('https://fixture.invalid',{method:'OPTIONS',headers:{Origin:origin}});
 const response=handleOptions(req);
 assert.equal(response.headers.get('Access-Control-Allow-Origin'),origin);
 assert.match(response.headers.get('Access-Control-Allow-Headers'),/authorization/);
 assert.equal(response.headers.get('Vary'),'Origin');
 assert.equal(jsonResponse({ok:true},200,{},req).headers.get('Access-Control-Allow-Origin'),origin);
}
for (const origin of ['null','https://evil.test','capacitor://evil','https://localhost.evil.test']) {
 const response=handleOptions(new Request('https://fixture.invalid',{method:'OPTIONS',headers:{Origin:origin}}));
 assert.notEqual(response.headers.get('Access-Control-Allow-Origin'),origin);
 assert.notEqual(response.headers.get('Access-Control-Allow-Origin'),'*');
}
console.log('PASS native CORS: packaged iOS/Android and web origins, preflight/response, hostile origins denied');
