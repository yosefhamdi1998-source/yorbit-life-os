import assert from 'node:assert/strict';
import fs from 'node:fs';
import { transform } from 'esbuild';
const source = fs.readFileSync('supabase/functions/_shared/serviceBearer.ts','utf8');
const js = (await transform(source,{loader:'ts',format:'esm'})).code;
const { isServiceBearer } = await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
const key='synthetic-service-key';
for (const missing of [undefined,'','   ']) {
 for (const header of [null,'','Bearer __none__',`Bearer ${key}`]) assert.equal(isServiceBearer(header,missing),false);
}
for (const header of [null,'','__none__',`Basic ${key}`,key,`Bearer prefix${key}`,`Bearer ${key}suffix`,`Bearer ${key} extra`,`Bearer  ${key}`,`Bearer ${key}\n`]) assert.equal(isServiceBearer(header,key),false,header);
assert.equal(isServiceBearer(`Bearer ${key}`,key),true);
assert.equal(isServiceBearer(`bearer ${key}`,key),true);
for (const file of ['_shared/supabase.ts','plaid-sync-holdings/index.ts','plaid-sync-transactions/index.ts']) {
 const s=fs.readFileSync('supabase/functions/'+file,'utf8');
 assert.ok(s.includes('isServiceBearer(authHeader,'),file);
 assert.ok(!s.includes('__none__'),file);
 assert.ok(!s.includes('authHeader.includes('),file);
}
console.log('PASS: actual service guard rejects missing secrets, placeholders, malformed and partial credentials; all three call sites use it');
