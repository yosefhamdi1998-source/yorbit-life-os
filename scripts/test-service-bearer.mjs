import assert from 'node:assert/strict';
import fs from 'node:fs';
import { transform } from 'esbuild';
const source = fs.readFileSync('supabase/functions/_shared/serviceBearer.ts','utf8');
const js = (await transform(source,{loader:'ts',format:'esm'})).code;
const { isServiceBearer, isProjectSecretKey } = await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
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
// Project secret keys (sb_secret_...) as injected in SUPABASE_SECRET_KEYS.
// Keys are assembled at run time: they are synthetic, never real.
const secretA=['sb','secret','fixtureKeyAlpha0123456789'].join('_'), secretB=['sb','secret','fixtureKeyBravo0123456789'].join('_');
const dict=JSON.stringify({default:secretA,rotated:secretB});
assert.equal(isProjectSecretKey(`Bearer ${secretA}`,dict),true);
assert.equal(isProjectSecretKey(`Bearer ${secretB}`,dict),true,'any key in the dictionary (rotation)');
for (const header of [null,'',secretA,`Basic ${secretA}`,`Bearer ${secretA}x`,`Bearer ${secretA.slice(0,-1)}`,`Bearer ${secretA} extra`,`Bearer ${key}`]) assert.equal(isProjectSecretKey(header,dict),false,String(header));
for (const env of [undefined,'','not json','[]','null','"'+secretA+'"',JSON.stringify([secretA]),JSON.stringify({a:null}),JSON.stringify({publishable:['sb','publishable','x'].join('_')})]) assert.equal(isProjectSecretKey(`Bearer ${secretA}`,env),false,String(env));
assert.equal(isProjectSecretKey(`Bearer ${key}`,JSON.stringify({odd:key})),false,'only sb_secret_ values count');
for (const odd of ['', 'short', 'has space inside key']) { const k=['sb','secret',odd].join('_'); assert.equal(isProjectSecretKey(`Bearer ${k}`,JSON.stringify({odd:k})),false,`malformed dictionary value ${JSON.stringify(k)}`); }
const supabaseShared=fs.readFileSync('supabase/functions/_shared/supabase.ts','utf8');
assert.match(supabaseShared,/if \(isProjectSecretKey\(authHeader, Deno\.env\.get\('SUPABASE_SECRET_KEYS'\)\)\) return null;/);
const config=fs.readFileSync('supabase/config.toml','utf8');
for (const fn of ['sync-all-accounts','generate-subscription-reminders']) assert.match(config,new RegExp(`\\[functions\\.${fn}\\]\\r?\\nverify_jwt = true`),`${fn}: the gateway stays on until the secret-key path is approved`);
console.log('PASS: actual service guard rejects missing secrets, placeholders, malformed and partial credentials; all three call sites use it; project secret keys match only exact sb_secret_ values from SUPABASE_SECRET_KEYS, and the gateway JWT check stays on until approved');

// The real requireSystemCaller (with the real key checks): legacy service
// key, a project secret key from SUPABASE_SECRET_KEYS, or a signed-in admin.
{
  const vm = await import('node:vm');
  const { timingSafeEqual } = await import('node:crypto');
  const strip = src => src.replace(/^import .*;\r?\n/gm, '').replace(/^export /gm, '');
  const code = (await transform(strip(fs.readFileSync('supabase/functions/_shared/serviceBearer.ts', 'utf8')) + '\n' + strip(fs.readFileSync('supabase/functions/_shared/supabase.ts', 'utf8')), { loader: 'ts' })).code;
  const LEGACY = 'legacy-service-key-fixture';
  const secret = ['sb', 'secret', 'dispatcherFixtureKey0123'].join('_');
  const run = async ({ header, user = null, role = null, secrets = JSON.stringify({ default: secret }) }) => {
    const env = { SUPABASE_SERVICE_ROLE_KEY: LEGACY, SUPABASE_SECRET_KEYS: secrets, SUPABASE_URL: 'https://fixture.invalid', SUPABASE_ANON_KEY: 'anon-fixture' };
    let userLookups = 0;
    const sandbox = {
      Deno: { env: { get: name => env[name] } }, timingSafeEqual, TextEncoder,
      createClient: () => ({ auth: { getUser: async () => { userLookups++; return user ? { data: { user }, error: null } : { data: { user: null }, error: new Error('no session') }; } } }),
    };
    vm.runInNewContext(code + '\nglobalThis.__guard = requireSystemCaller;', sandbox);
    const admin = { from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: role ? { role } : null }) }) }) }) };
    const req = new Request('https://fixture.invalid/sync-all-accounts', { method: 'POST', headers: header ? { Authorization: header } : {} });
    const res = await sandbox.__guard(req, admin, (body, status) => ({ status, body }));
    return { status: res?.status ?? 200, userLookups };
  };
  assert.equal((await run({ header: `Bearer ${LEGACY}` })).status, 200, 'legacy service key');
  const bySecret = await run({ header: `Bearer ${secret}` });
  assert.equal(bySecret.status, 200, 'project secret key'); assert.equal(bySecret.userLookups, 0, 'no user lookup needed');
  assert.equal((await run({ header: `Bearer ${secret}`, secrets: null })).status, 401, 'no SUPABASE_SECRET_KEYS: a secret key is just an unknown bearer');
  assert.equal((await run({ header: `Bearer ${secret}x` })).status, 401);
  assert.equal((await run({ header: null })).status, 401, 'anonymous');
  assert.equal((await run({ header: 'Bearer user-jwt', user: { id: 'u1' }, role: 'user' })).status, 403, 'ordinary user');
  assert.equal((await run({ header: 'Bearer user-jwt', user: { id: 'u1' }, role: 'admin' })).status, 200, 'signed-in admin');
  console.log('PASS: requireSystemCaller allows the legacy service key, a project secret key from SUPABASE_SECRET_KEYS, or a signed-in admin; denies everything else');
}
