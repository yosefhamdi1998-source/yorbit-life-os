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

const [, , INPUT, OUTPUT] = process.argv;
if (!INPUT || !OUTPUT) {
  console.error('Usage: node scripts/export-session.js <input.jsonl> <output.md>');
  process.exit(1);
}

// Patterns worth warning about before this file goes anywhere. Not a
// security scanner — just enough to catch an obvious pasted secret so it
// isn't synced to cloud storage unnoticed.
const SECRET_PATTERNS = [
  [/\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, 'JWT'],
  [/\bsk-[A-Za-z0-9_-]{20,}/g, 'OpenAI-style key'],
  [/\bsbp_[a-f0-9]{40,}/g, 'Supabase access token'],
  [/\baccess-(sandbox|development|production)-[a-f0-9-]{20,}/g, 'Plaid access token'],
  [/\bghp_[A-Za-z0-9]{30,}/g, 'GitHub token'],
  [/\bAKIA[0-9A-Z]{16}\b/g, 'AWS key id'],
];
const secretHits = new Map();

function scan(text) {
  for (const [re, label] of SECRET_PATTERNS) {
    const m = text.match(re);
    if (m) secretHits.set(label, (secretHits.get(label) || 0) + m.length);
  }
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
      texts.push(b.text);
      scan(b.text);
    } else if (b.type === 'tool_use') {
      toolCalls++;
      // One line per tool call: the name plus the most identifying field.
      const i = b.input || {};
      const hint = i.file_path || i.command || i.pattern || i.path || i.url || i.prompt || '';
      tools.push(`${b.name}${hint ? ': ' + clip(String(hint).replace(/\s+/g, ' '), 160) : ''}`);
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
  console.log('\nWARNING - secret-shaped strings found in the conversation text:');
  for (const [k, v] of secretHits) console.log(`  ${k}: ${v} occurrence(s)`);
  console.log('Review before putting this file in cloud storage.');
} else {
  console.log('\nNo secret-shaped strings found in the conversation text.');
}
