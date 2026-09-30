// Configuration presence/format check only; it does not authenticate with Apple or RevenueCat.
import fs from 'node:fs';

const appId = (process.env.APP_STORE_APPLE_ID || '').trim();
const publicKey = (process.env.VITE_REVENUECAT_APPLE_API_KEY || '').trim();
const errors = [];
if (!/^[1-9][0-9]*$/.test(appId)) errors.push('Set APP_STORE_APPLE_ID to the numeric Apple application ID.');
if (!/^appl_[A-Za-z0-9_]+$/.test(publicKey) || /^appl_x+$/i.test(publicKey)) errors.push('Set VITE_REVENUECAT_APPLE_API_KEY to the Apple public SDK key, not a secret or another platform key.');

// The app cannot start without its Supabase project. The build takes these
// from the environment first, then from the tracked public .env.production
// (Vite never overwrites a value the environment already set). Whatever is
// used ships inside the app, so it must be the publishable key: a secret or
// service_role key here would hand every user full database access.
function fileValues(path) {
  if (!fs.existsSync(path)) return {};
  return Object.fromEntries(fs.readFileSync(path, 'utf8').split(/\r?\n/)
    .map(line => /^\s*(VITE_[A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line)).filter(Boolean)
    .map(([, name, value]) => [name, value.replace(/^(['"])(.*)\1$/, '$2')]));
}
const file = fileValues(process.env.YORBIT_PUBLIC_ENV_FILE || '.env.production');
const supabaseUrl = (process.env.VITE_SUPABASE_URL || file.VITE_SUPABASE_URL || '').trim();
const supabaseKey = (process.env.VITE_SUPABASE_ANON_KEY || file.VITE_SUPABASE_ANON_KEY || '').trim();
function jwtRole(token) {
  const part = token.split('.')[1];
  if (!part) return null;
  try { return JSON.parse(Buffer.from(part.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'))?.role ?? null; }
  catch { return null; }
}
if (!/^https:\/\/[a-z0-9]{20}\.supabase\.co$/.test(supabaseUrl)) errors.push('Set VITE_SUPABASE_URL (environment or .env.production) to the https://<project>.supabase.co URL.');
const publishable = /^sb_publishable_[A-Za-z0-9_-]+$/.test(supabaseKey) || (/^eyJ/.test(supabaseKey) && jwtRole(supabaseKey) === 'anon');
if (!publishable) errors.push('Set VITE_SUPABASE_ANON_KEY (environment or .env.production) to the publishable key. Never a secret or service_role key: it ships inside the app.');

if (errors.length) {
  console.error('Native release configuration incomplete:\n' + errors.join('\n'));
  process.exitCode = 1;
} else console.log('Native public configuration format checks passed. Account, products, signing and device tests remain required.');
