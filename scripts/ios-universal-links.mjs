import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { NATIVE_BANK_LINK_REDIRECT_URI } from '../src/lib/plaidLink.js';

const bankReturn = new URL(NATIVE_BANK_LINK_REDIRECT_URI);
export const ASSOCIATION_URL = bankReturn.origin + '/.well-known/apple-app-site-association';
const associationFile = new URL('../public/.well-known/apple-app-site-association', import.meta.url);

export function associationFor(appIdPrefix) {
  const prefix = String(appIdPrefix || '').trim();
  // This is the signed application's identifier prefix, usually (not always) the Team ID.
  // Reject obvious documentation placeholders; format alone does not authenticate Apple ownership.
  if (!/^[A-Z0-9]{10}$/.test(prefix) || /^(.)\1{9}$/.test(prefix) || ['ABCDE12345', '0123456789', 'YOURTEAMID'].includes(prefix)) {
    throw new Error('Supply the real 10-character Apple application identifier prefix; placeholders are not accepted.');
  }
  return { applinks: { details: [{ appIDs: [prefix + '.app.yorbit'], components: [{ '/': bankReturn.pathname }] }] } };
}

export function readAssociation(file, prefix) {
  const expected = associationFor(prefix);
  if (!fs.existsSync(file)) throw new Error('Association file not prepared. Run ios-universal-links.mjs --write with the owner-supplied application identifier prefix.');
  let actual;
  try { actual = JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { throw new Error('Association file must contain valid JSON.'); }
  if (!isDeepStrictEqual(actual, expected)) throw new Error('Association file must match the selected app and exact bank-return path; review it before replacing.');
  return actual;
}

export function saveAssociation(file, prefix) {
  const expected = associationFor(prefix);
  if (fs.existsSync(file)) {
    try { readAssociation(file, prefix); }
    catch { throw new Error('Refusing to replace a different existing association file. Review the existing identity and routes first.'); }
    return; // Existing equivalent configuration is preserved byte for byte.
  }
  const parent = file instanceof URL ? new URL('.', file) : path.dirname(file);
  fs.mkdirSync(parent, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(expected, null, 2) + '\n', { encoding: 'utf8', flag: 'wx' });
}

export async function verifyHostedAssociation(prefix, fetchImpl = fetch) {
  const expected = associationFor(prefix);
  const response = await fetchImpl(ASSOCIATION_URL, {
    redirect: 'error',
    signal: AbortSignal.timeout(15000),
    headers: { Accept: 'application/json' },
  });
  if (response.status !== 200 || response.redirected) throw new Error('Published association must return HTTP 200 directly, without redirects.');
  if (response.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') {
    throw new Error('Published association is not JSON; check static-file hosting and SPA fallback.');
  }
  let actual;
  try { actual = await response.json(); }
  catch { throw new Error('Published association does not contain valid JSON.'); }
  if (!isDeepStrictEqual(actual, expected)) throw new Error('Published association does not match this app and exact bank-return path.');
}

// No Apple API, key lookup, deployment, signing, or bank call happens here.
// A successful check establishes configuration only, not a working signed-device return.
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const [mode, prefix, ...extra] = process.argv.slice(2);
    if (extra.length || !['--write', '--check', '--check-live'].includes(mode)) {
      throw new Error('Usage: node scripts/ios-universal-links.mjs --write|--check|--check-live APP_ID_PREFIX');
    }
    if (mode === '--write') {
      saveAssociation(associationFile, prefix);
      console.log('Prepared the exact iOS bank-return association. Review, commit and deploy it before building iOS.');
    } else {
      readAssociation(associationFile, prefix);
      if (mode === '--check-live') await verifyHostedAssociation(prefix);
      console.log('Association configuration matches. Apple capability/profile and signed-device tests are still required.');
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
