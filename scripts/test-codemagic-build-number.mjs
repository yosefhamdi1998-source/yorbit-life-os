import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import yaml from 'js-yaml';

// Runs the real "Increment build number" step from codemagic.yaml in bash,
// with Codemagic's app-store-connect CLI and Apple's agvtool stubbed.
// Codemagic's get-latest-* commands print nothing (exit 0) when no build is
// found; get-latest-app-store-build-number ignores TestFlight-only builds.
const config = yaml.load(fs.readFileSync('codemagic.yaml', 'utf8'));
const step = config.workflows['ios-app-store'].scripts.find(s => s.name === 'Increment build number');
assert.ok(step, 'the iOS workflow increments the build number');

function run({ appId = '1234567890', lookup }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cm-build-'));
  fs.mkdirSync(path.join(dir, 'ios', 'App'), { recursive: true });
  const log = path.join(dir, 'calls.log');
  const prelude = `
app-store-connect() { echo "asc $*" >> "$CALLS"; ${lookup}; }
agvtool() { echo "agvtool $* in $(basename "$PWD")" >> "$CALLS"; }
`;
  const result = spawnSync('bash', ['-c', prelude + step.script], {
    encoding: 'utf8', env: { ...process.env, APP_STORE_APPLE_ID: appId, CM_BUILD_DIR: dir, CALLS: log },
  });
  const calls = fs.existsSync(log) ? fs.readFileSync(log, 'utf8').trim().split('\n') : [];
  fs.rmSync(dir, { recursive: true, force: true });
  return { status: result.status, calls };
}

let r = run({ lookup: 'echo 41' });
assert.equal(r.status, 0);
assert.deepEqual(r.calls, ['asc get-latest-build-number 1234567890', 'agvtool new-version -all 42 in App']);

r = run({ lookup: 'return 0' });
assert.equal(r.status, 0, 'no builds yet (TestFlight-only history or a new app) is the first build, not a failure');
assert.equal(r.calls.at(-1), 'agvtool new-version -all 1 in App');

for (const [label, lookup] of [['lookup failure', 'return 1'], ['non-numeric output', 'echo "not a number"']]) {
  r = run({ lookup });
  assert.notEqual(r.status, 0, label);
  assert.ok(!r.calls.some(c => c.startsWith('agvtool')), `${label}: no version is written`);
}
for (const appId of ['', 'app.yorbit']) {
  r = run({ appId, lookup: 'echo 41' });
  assert.notEqual(r.status, 0, `app id ${JSON.stringify(appId)}`);
  assert.equal(r.calls.length, 0);
}
assert.ok(!step.script.split(/\r?\n/).some(line => !line.trim().startsWith('#') && line.includes('get-latest-app-store-build-number')), 'App Store-only lookup never sees TestFlight uploads');
console.log('PASS Codemagic build number: counts TestFlight builds, starts at 1 with no builds, stops on lookup failure, bad output or bad app id');
