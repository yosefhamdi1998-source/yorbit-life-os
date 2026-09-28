import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const entitlementPath = 'ios/App/App/App.entitlements';
assert.ok(fs.existsSync(entitlementPath), 'Native bank return requires an Associated Domains entitlement');
const entitlement = fs.readFileSync(entitlementPath, 'utf8');
assert.match(entitlement, /<key>com\.apple\.developer\.associated-domains<\/key>/);
assert.match(entitlement, /<string>applinks:yorbit-life-os\.vercel\.app<\/string>/);
assert.equal((entitlement.match(/<string>/g) || []).length, 1, 'Do not claim unrelated domains or services');
const project = fs.readFileSync('ios/App/App.xcodeproj/project.pbxproj', 'utf8');
assert.equal((project.match(/CODE_SIGN_ENTITLEMENTS = App\/App\.entitlements;/g) || []).length, 2, 'Both app build configurations must sign the entitlement');

const { associationFor, saveAssociation, readAssociation, verifyHostedAssociation, ASSOCIATION_URL } = await import('./ios-universal-links.mjs');
const prefix = 'A1B2C3D4E5'; // Synthetic; never written to public/ or deployed.
const expected = {
  applinks: { details: [{ appIDs: [prefix + '.app.yorbit'], components: [{ '/': '/bank-oauth-return' }] }] },
};
assert.deepEqual(associationFor(prefix), expected);
assert.deepEqual(associationFor(' ' + prefix + ' '), expected);
for (const invalid of ['', '123', 'a1b2c3d4e5', 'A1B2C3D4E5.app.yorbit', 'ABCDE12345', 'XXXXXXXXXX', 'YOURTEAMID', 'A1B2C3D4E*']) {
  assert.throws(() => associationFor(invalid), /prefix/);
}
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yorbit-ios-links-'));
try {
  assert.ok(path.isAbsolute(dir) && path.dirname(dir) === path.resolve(os.tmpdir()), 'Fixture directory must stay directly inside the system temp directory');
  const file = path.join(dir, '.well-known', 'apple-app-site-association');
  assert.throws(() => readAssociation(file, prefix), /not prepared/);
  saveAssociation(file, prefix);
  assert.deepEqual(readAssociation(file, prefix), expected);
  const original = fs.readFileSync(file, 'utf8');
  saveAssociation(file, prefix);
  assert.equal(fs.readFileSync(file, 'utf8'), original, 'Same configuration is idempotent');
  assert.throws(() => saveAssociation(file, 'B2C3D4E5F6'), /different/);
  assert.equal(fs.readFileSync(file, 'utf8'), original, 'Do not overwrite a different existing app association');
  const widened = structuredClone(expected);
  widened.applinks.details[0].components[0]['/'] = '/*';
  fs.writeFileSync(file, JSON.stringify(widened));
  assert.throws(() => readAssociation(file, prefix), /match/);
  assert.throws(() => saveAssociation(file, prefix), /different/);
  assert.equal(JSON.parse(fs.readFileSync(file)).applinks.details[0].components[0]['/'], '/*');
  fs.writeFileSync(file, '<html>Fallback page</html>');
  assert.throws(() => readAssociation(file, prefix), /JSON/);
} finally {
  // Only the freshly created test directory, with its literal absolute path.
  fs.rmSync(dir, { recursive: true, force: true });
}

let fetchCalls = 0;
const fetchWith = response => async (url, options) => {
  fetchCalls++;
  assert.equal(url, ASSOCIATION_URL);
  assert.equal(options.redirect, 'error', 'Apple requires a direct response without redirects');
  assert.ok(options.signal instanceof AbortSignal);
  return response;
};
await verifyHostedAssociation(prefix, fetchWith(new Response(JSON.stringify(expected), { headers: { 'content-type': 'application/json; charset=utf-8' } })));
for (const response of [
  new Response(JSON.stringify(expected), { status: 404, headers: { 'content-type': 'application/json' } }),
  new Response(JSON.stringify(expected), { status: 302, headers: { location: 'https://example.invalid' } }),
  new Response('<html>App</html>', { headers: { 'content-type': 'text/html' } }),
  new Response('bad json', { headers: { 'content-type': 'application/json' } }),
  new Response(JSON.stringify(associationFor('B2C3D4E5F6')), { headers: { 'content-type': 'application/json' } }),
  new Response(JSON.stringify({ applinks: { details: [] } }), { headers: { 'content-type': 'application/json' } }),
]) await assert.rejects(verifyHostedAssociation(prefix, fetchWith(response)));
await assert.rejects(verifyHostedAssociation(prefix, async () => { throw new Error('network fixture'); }), /network fixture/);
const before = fetchCalls;
await assert.rejects(verifyHostedAssociation('', fetchWith(null)), /prefix/);
assert.equal(fetchCalls, before, 'Invalid identity fails before requesting the site');
const cli = spawnSync(process.execPath, ['scripts/ios-universal-links.mjs', '--unknown'], { encoding: 'utf8' });
assert.equal(cli.status, 1);
assert.match(cli.stderr, /Usage/);
const pipeline = fs.readFileSync('codemagic.yaml', 'utf8');
assert.ok(pipeline.indexOf('ios-universal-links.mjs --check-live') < pipeline.indexOf('npm ci'));
assert.ok(pipeline.includes('ios-universal-links.mjs --check-live "$APPLE_APP_ID_PREFIX"'));
const hosting = JSON.parse(fs.readFileSync('vercel.json', 'utf8'));
const header = hosting.headers.find(entry => entry.source === '/.well-known/apple-app-site-association');
assert.ok(header.headers.some(({ key, value }) => key === 'Content-Type' && value === 'application/json'));
const spaFallback = new RegExp('^' + hosting.rewrites.find(entry => entry.destination === '/index.html').source + '$');
assert.equal(spaFallback.test('/.well-known/apple-app-site-association'), false, 'Missing Apple association must not become the app HTML with status 200');
for (const route of ['/', '/login', '/bank-oauth-return', '/settings']) assert.ok(spaFallback.test(route), 'Normal client route still uses the SPA fallback');
console.log('PASS: iOS entitlement signing, exact bank-return association, prefix validation, safe/idempotent generation, missing/malformed/broad/mismatched association refusal, hosted HTTP/JSON/no-redirect validation and native build gate');
