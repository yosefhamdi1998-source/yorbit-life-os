import assert from 'node:assert/strict';
import fs from 'node:fs';

// Tasks, Habits, Journal and Health Log are life-organizer leftovers with no
// navigation entry. The iOS app has no address bar, so registering them there
// would ship dormant features (App Review guideline 2.3.1) and put health data
// into the App Store privacy answers. They stay on the web for existing data.
// Fixture-browser check: ?scenario=native-preview shows "Page not found" for
// each; the web route still renders.
const app = fs.readFileSync('src/App.jsx', 'utf8');
assert.match(app, /import \{ isNative \} from '@\/lib\/platform';/);
for (const [path, page] of [['/tasks', 'Tasks'], ['/habits', 'Habits'], ['/journal', 'Journal'], ['/health-log', 'HealthLog']]) {
  const routes = [...app.matchAll(new RegExp(`(.{0,20})<Route path="${path}" element=\\{<${page} />\\} />`, 'g'))];
  assert.equal(routes.length, 1, `${path} registered once`);
  assert.match(routes[0][1], /\{!isNative\(\) && $/, `${path} is not registered in the native app`);
}

// Nothing the user can reach links to them, on either platform.
const offenders = [];
for (const dir of ['src/pages', 'src/components', 'src/lib']) {
  for (const f of fs.readdirSync(dir, { recursive: true })) {
    if (!/\.(jsx?|tsx?)$/.test(f)) continue;
    const text = fs.readFileSync(`${dir}/${f}`, 'utf8');
    if (/['"`]\/(tasks|habits|journal|health-log)['"`]/.test(text)) offenders.push(`${dir}/${f}`);
  }
}
assert.deepEqual(offenders, [], 'no in-app link to a legacy page');

// Notes and Custom records are real, linked features: they stay everywhere
// and must appear in the App Store privacy answers as user content.
assert.match(app, /\n\s*<Route path="\/notes" element=\{<Notes \/>\} \/>/);
assert.match(app, /\n\s*<Route path="\/forms" element=\{<Forms \/>\} \/>/);
console.log('PASS native routes: Tasks/Habits/Journal/Health Log are not registered in the iOS app and nothing links to them; Notes and Custom records remain');
