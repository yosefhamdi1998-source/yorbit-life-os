// Captures App Store screenshots from the fixture build (vite.fixture.config.js):
// entirely synthetic data from fixtures/scenarios.js ('store' scenario), no
// production database, no real account. Drives the locally installed
// Microsoft Edge headlessly, so no browser download is needed:
//
//   npm i --no-save playwright-core@1
//   node scripts/capture-store-screenshots.mjs
//
// JPEG on purpose: App Store Connect rejects images with an alpha channel.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const PORT = 5199;
const OUT = 'store-assets/screenshots';
const DEVICES = {
  // 6.9" iPhone: 440 x 956 points @3x = 1320 x 2868 (an accepted 6.9" size).
  'iphone-6.9': { viewport: { width: 440, height: 956 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
  // 13" iPad: 1024 x 1366 points @2x = 2048 x 2732. Needed only while the
  // Xcode target stays universal (TARGETED_DEVICE_FAMILY = 1,2).
  'ipad-13': { viewport: { width: 1024, height: 1366 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
};
const SCREENS = [
  ['01-home', '/', 'Home'],
  ['02-money', '/finance', 'Money'],
  ['03-budget', '/budget', 'Plan > Budget'],
  ['04-invest', '/investments', 'Invest'],
  ['05-coach', '/coach', 'Coach consent'],
  ['06-bills', '/bills', 'Plan > Bills'],
];

function jpegSize(file) {
  const b = fs.readFileSync(file);
  for (let i = 2; i < b.length - 9;) {
    if (b[i] !== 0xff) { i++; continue; }
    const marker = b[i + 1];
    if (marker >= 0xc0 && marker <= 0xc3) return { height: b.readUInt16BE(i + 5), width: b.readUInt16BE(i + 7) };
    i += 2 + b.readUInt16BE(i + 2);
  }
  throw new Error(`No JPEG frame header in ${file}`);
}

const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--config', 'vite.fixture.config.js', '--port', String(PORT), '--strictPort'], { stdio: ['ignore', 'pipe', 'pipe'] });
try {
  // Vite prints nothing when its output is piped, so wait for the port.
  let exited = null;
  server.on('exit', code => { exited = code; });
  for (let waited = 0; ; waited += 500) {
    if (exited !== null) throw new Error(`Fixture server exited (${exited})`);
    if (waited > 90000) throw new Error('Fixture server did not start');
    try { if ((await fetch(`http://localhost:${PORT}/`)).ok) break; } catch { /* not up yet */ }
    await new Promise(r => setTimeout(r, 500));
  }
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    for (const [device, options] of Object.entries(DEVICES)) {
      fs.mkdirSync(path.join(OUT, device), { recursive: true });
      const context = await browser.newContext({ ...options, colorScheme: 'light', locale: 'en-US', timezoneId: 'America/New_York' });
      const page = await context.newPage();
      for (const [name, route, label] of SCREENS) {
        await page.goto(`http://localhost:${PORT}${route}?scenario=store`, { waitUntil: 'networkidle' });
        await page.waitForTimeout(2500); // entrance animations and animated totals settle
        const file = path.join(OUT, device, `${name}.jpg`);
        await page.screenshot({ path: file, type: 'jpeg', quality: 92 });
        const { width, height } = jpegSize(file);
        const expected = { width: options.viewport.width * options.deviceScaleFactor, height: options.viewport.height * options.deviceScaleFactor };
        if (width !== expected.width || height !== expected.height) throw new Error(`${file} is ${width}x${height}, expected ${expected.width}x${expected.height}`);
        console.log(`${device}/${name}.jpg  ${width}x${height}  ${label}`);
      }
      await context.close();
    }
  } finally {
    await browser.close();
  }
} finally {
  server.kill();
}
