// Stream a file through a secret redactor.
//
// Session transcripts capture everything that was typed, including any
// credential pasted into the conversation. That's fine on a local disk and
// not fine in cloud storage or anywhere shareable. This produces a copy
// with credential-shaped strings replaced, streaming so a 100MB+ log
// doesn't have to be held in memory.
//
// Redaction is not a substitute for rotating a leaked key. It only stops
// the copy from spreading further.
//
// Usage: node scripts/redact-secrets.js <input> <output>

import fs from 'node:fs';
import readline from 'node:readline';
import { redact } from './lib/secretPatterns.js';

const [, , INPUT, OUTPUT] = process.argv;
if (!INPUT || !OUTPUT) {
  console.error('Usage: node scripts/redact-secrets.js <input> <output>');
  process.exit(1);
}

const counts = new Map();

const out = fs.createWriteStream(OUTPUT, { encoding: 'utf8' });
const rl = readline.createInterface({
  input: fs.createReadStream(INPUT, { encoding: 'utf8' }),
  crlfDelay: Infinity,
});

for await (const line of rl) {
  const { text, counts: hit } = redact(line);
  for (const [k, v] of hit) counts.set(k, (counts.get(k) || 0) + v);
  out.write(text + '\n');
}

out.end();
await new Promise(r => out.on('finish', r));

const mb = (fs.statSync(OUTPUT).size / 1024 / 1024).toFixed(2);
console.log(`Wrote ${OUTPUT} (${mb} MB)`);
if (counts.size) {
  console.log('Redacted:');
  for (const [k, v] of counts) console.log(`  ${k}: ${v}`);
  console.log('\nRotate these credentials. Redacting this copy does not');
  console.log('un-leak a key that was already written to disk.');
} else {
  console.log('Nothing matched - no credential-shaped strings found.');
}
