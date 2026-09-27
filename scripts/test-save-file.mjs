import assert from 'node:assert/strict';
import fs from 'node:fs';

// Tests the real src/lib/saveFile.js with the platform check and the two
// Capacitor plugins replaced by recording fakes.
const source = fs.readFileSync('src/lib/saveFile.js', 'utf8')
  .replace(/^import .*;\r?\n/gm, '')
  .replace("import('@capacitor/filesystem')", 'globalThis.__sf.filesystem()')
  .replace("import('@capacitor/share')", 'globalThis.__sf.share()');
assert.ok(source.includes('globalThis.__sf.filesystem()') && source.includes('globalThis.__sf.share()'));
const sf = globalThis.__sf = { native: false };
const { saveFile } = await import('data:text/javascript;base64,' + Buffer.from('const isNative = () => globalThis.__sf.native;\n' + source).toString('base64'));

// Web: an ordinary download, URL released.
{
  const clicked = []; const revoked = [];
  globalThis.URL.createObjectURL = () => 'blob:synthetic';
  globalThis.URL.revokeObjectURL = url => revoked.push(url);
  globalThis.document = { createElement: tag => { assert.equal(tag, 'a'); const a = { click: () => clicked.push({ href: a.href, download: a.download }) }; return a; } };
  assert.equal(await saveFile(new Blob(['a,b']), 'report.csv'), true);
  assert.deepEqual(clicked, [{ href: 'blob:synthetic', download: 'report.csv' }]);
  assert.deepEqual(revoked, ['blob:synthetic']);
  delete globalThis.document;
}

// Native: written to the app cache, then offered through the share sheet.
const bytes = new Uint8Array(70000).map((_, i) => (i * 31 + 7) % 256); // > 2 chunks, all byte values
function nativeFakes({ shareError = null, writeError = null } = {}) {
  const log = { writes: [], shares: [] };
  sf.native = true;
  sf.filesystem = async () => ({
    Directory: { Cache: 'CACHE' },
    Filesystem: { writeFile: async args => { if (writeError) throw writeError; log.writes.push(args); return { uri: `file:///cache/${args.path}` }; } },
  });
  sf.share = async () => ({ Share: { share: async args => { log.shares.push(args); if (shareError) throw shareError; return {}; } } });
  return log;
}
{
  const log = nativeFakes();
  assert.equal(await saveFile(new Blob([bytes]), 'yorbit-export.json'), true);
  assert.equal(log.writes.length, 1);
  assert.equal(log.writes[0].directory, 'CACHE'); assert.equal(log.writes[0].path, 'yorbit-export.json');
  assert.deepEqual(new Uint8Array(Buffer.from(log.writes[0].data, 'base64')), bytes, 'the file written is byte-for-byte the export');
  assert.deepEqual(log.shares, [{ title: 'yorbit-export.json', url: 'file:///cache/yorbit-export.json' }]);
}
{
  nativeFakes({ shareError: new Error('Share canceled') });
  assert.equal(await saveFile(new Blob(['x']), 'a.pdf'), false, 'dismissing the share sheet is not an error');
  nativeFakes({ shareError: new Error('Unable to share') });
  await assert.rejects(() => saveFile(new Blob(['x']), 'a.pdf'), /Unable to share/);
  const log = nativeFakes({ writeError: new Error('Disk full') });
  await assert.rejects(() => saveFile(new Blob(['x']), 'a.pdf'), /Disk full/);
  assert.equal(log.shares.length, 0, 'nothing is shared when the write failed');
}

// Every export goes through saveFile; no bare browser download remains.
const offenders = [];
for (const dir of ['src/pages', 'src/components', 'src/lib']) {
  for (const f of fs.readdirSync(dir, { recursive: true })) {
    const p = `${dir}/${f}`;
    if (!/\.(jsx?|tsx?)$/.test(p) || p.endsWith('saveFile.js')) continue;
    const text = fs.readFileSync(p, 'utf8');
    if (/doc\.save\(|\.download\s*=/.test(text)) offenders.push(p);
  }
}
assert.deepEqual(offenders, [], 'bare downloads silently fail in the iOS app');
for (const p of ['src/pages/Settings.jsx', 'src/components/finance/ExportButtons.jsx', 'src/components/budget/BudgetExportMenu.jsx']) {
  assert.match(fs.readFileSync(p, 'utf8'), /import \{ saveFile \} from '@\/lib\/saveFile';/, p);
}
delete globalThis.__sf;
console.log('PASS save file: web downloads normally; native writes the exact bytes to the app cache and opens the share sheet; dismissal is not an error; failures surface; no bare downloads remain');
