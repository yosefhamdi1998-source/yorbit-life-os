// Export a Claude Code session transcript to readable Markdown.
//
// The raw .jsonl is ~100MB because every tool result (file reads, build
// output, query dumps) is stored verbatim. This streams it line by line
// rather than loading it, keeps the actual conversation, and collapses
// each tool call to a one-line summary so the result is readable instead
// of being a wall of JSON.
//
// Usage: node scripts/export-session.js <input.jsonl> <output.md>

import fs from 'node:fs';
import readline from 'node:readline';
import { redact } from './lib/secretPatterns.js';

const [, , INPUT, OUTPUT] = process.argv;
if (!INPUT || !OUTPUT) {
  console.error('Usage: node scripts/export-session.js <input.jsonl> <output.md>');
  process.exit(1);
}

// Credentials are stripped AS THE FILE IS WRITTEN, not detected afterwards.
// The earlier version only warned, which meant the unredacted export
// already existed on disk — and in cloud storage — by the time anyone read
// the warning. A warning about a file that has already been written is not
// a control.
const secretHits = new Map();

// Every string that reaches the output passes through here first.
function clean(text) {
  const { text: out, counts } = redact(text);
  for (const [k, v] of counts) secretHits.set(k, (secretHits.get(k) || 0) + v);
  return out;
}

const out = fs.createWriteStream(OUTPUT, { encoding: 'utf8' });
const rl = readline.createInterface({
  input: fs.createReadStream(INPUT, { encoding: 'utf8' }),
  crlfDelay: Infinity,
});

let userTurns = 0, assistantTurns = 0, toolCalls = 0, skipped = 0;
let lastRole = null;

const clip = (s, n) => (s.length > n ? s.slice(0, n) + ` … [${s.length - n} more chars]` : s);

out.write('# Yorbit session transcript\n\n');
out.write(`Source: \`${INPUT}\`\n\nExported: ${new Date().toISOString()}\n\n---\n\n`);

for await (const line of rl) {
  if (!line.trim()) continue;
  let rec;
  try { rec = JSON.parse(line); } catch { skipped++; continue; }

  const msg = rec.message;
  if (!msg || !msg.role) continue;
  const content = msg.content;
  if (content == null) continue;

  const blocks = Array.isArray(content) ? content : [{ type: 'text', text: String(content) }];

  const texts = [];
  const tools = [];
  for (const b of blocks) {
    if (!b || typeof b !== 'object') continue;
    if (b.type === 'text' && b.text && b.text.trim()) {
      texts.push(clean(b.text));
    } else if (b.type === 'tool_use') {
      toolCalls++;
      // One line per tool call: the name plus the most identifying field.
      // Cleaned too — a secret pasted into a shell command lives here, not
      // in the prose.
      const i = b.input || {};
      const hint = i.file_path || i.command || i.pattern || i.path || i.url || i.prompt || '';
      tools.push(clean(`${b.name}${hint ? ': ' + clip(String(hint).replace(/\s+/g, ' '), 160) : ''}`));
    }
    // tool_result blocks are deliberately dropped - they are the bulk of
    // the file and almost never what someone rereads a session for.
  }

  if (!texts.length && !tools.length) continue;

  if (msg.role === 'user') userTurns++; else assistantTurns++;

  if (msg.role !== lastRole) {
    out.write(`\n## ${msg.role === 'user' ? 'Yosef' : 'Claude'}\n\n`);
    lastRole = msg.role;
  }

  for (const t of texts) out.write(t.trimEnd() + '\n\n');
  if (tools.length) {
    out.write('<details><summary>' + tools.length + ' tool call' + (tools.length > 1 ? 's' : '') + '</summary>\n\n');
    for (const t of tools) out.write('- `' + t.replace(/`/g, "'") + '`\n');
    out.write('\n</details>\n\n');
  }
}

out.write(`\n---\n\nTurns: ${userTurns} from Yosef, ${assistantTurns} from Claude. Tool calls: ${toolCalls}.\n`);
out.end();

await new Promise(r => out.on('finish', r));

const size = fs.statSync(OUTPUT).size;
console.log(`Wrote ${OUTPUT}`);
console.log(`  ${(size / 1024 / 1024).toFixed(2)} MB`);
console.log(`  ${userTurns} user turns, ${assistantTurns} assistant turns, ${toolCalls} tool calls`);
if (skipped) console.log(`  ${skipped} unparseable lines skipped`);

if (secretHits.size) {
  console.log('\nRedacted from this export (already replaced in the output):');
  for (const [k, v] of secretHits) console.log(`  ${k}: ${v}`);
  console.log('\nThese were present in the SOURCE log, which is unredacted on');
  console.log('disk. Redacting the export does not un-leak them - rotate them.');
} else {
  console.log('\nNo credential-shaped strings found.');
}
