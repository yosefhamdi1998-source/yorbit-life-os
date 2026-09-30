import assert from 'node:assert/strict';
import fs from 'node:fs';

// After Stripe Checkout redirects to /settings?success=1, the webhook usually
// lands seconds later. Settings re-checks on its own, briefly and boundedly,
// and only offers the manual button once that has run out.
// Browser behaviour is exercised with the fixture scenario "checkout-return".
const source = fs.readFileSync('src/pages/Settings.jsx', 'utf8');
const effect = source.match(/const \[autoCheckDone, setAutoCheckDone\] = useState\(!purchaseSuccess\);\r?\n\s*useEffect\(\(\) => \{([\s\S]*?)\r?\n\s*\}, \[purchaseSuccess, isPro, autoCheckDone\]\);/);
assert.ok(effect, 'auto re-check effect keyed on purchaseSuccess/isPro/autoCheckDone');
const body = effect[1];
assert.match(body, /if \(!purchaseSuccess \|\| isPro \|\| autoCheckDone\) return undefined;/, 'only after checkout, and never once Pro is confirmed');
assert.match(body, /setInterval\(\(\) => \{[\s\S]*refreshSubscriptionStatus\(\);[\s\S]*\}, 3000\);/);
assert.match(body, /if \(attempts >= 10\) \{ clearInterval\(timer\); setAutoCheckDone\(true\); \}/, 'bounded: about 30 seconds');
assert.match(body, /return \(\) => clearInterval\(timer\);/, 'stops when Pro appears or the page closes');
assert.match(source, /\{!isPro && autoCheckDone && <Button/, 'manual re-check only after the automatic one ends');
const fixture = fs.readFileSync('fixtures/entitiesFixture.js', 'utf8');
assert.match(fixture, /scenarioName === 'checkout-return'/);
console.log('PASS checkout return: Settings re-checks the subscription every 3s for ~30s after checkout, stops once Pro appears, then offers the manual check');
