// Configuration presence/format check only; it does not authenticate with Apple or RevenueCat.
const appId = (process.env.APP_STORE_APPLE_ID || '').trim();
const publicKey = (process.env.VITE_REVENUECAT_APPLE_API_KEY || '').trim();
const errors = [];
if (!/^[1-9][0-9]*$/.test(appId)) errors.push('Set APP_STORE_APPLE_ID to the numeric Apple application ID.');
if (!/^appl_[A-Za-z0-9_]+$/.test(publicKey) || /^appl_x+$/i.test(publicKey)) errors.push('Set VITE_REVENUECAT_APPLE_API_KEY to the Apple public SDK key, not a secret or another platform key.');
if (errors.length) {
  console.error('Native release configuration incomplete:\n' + errors.join('\n'));
  process.exitCode = 1;
} else console.log('Native public configuration format checks passed. Account, products, signing and device tests remain required.');
