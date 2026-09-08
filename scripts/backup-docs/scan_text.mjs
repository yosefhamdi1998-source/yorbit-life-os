// Scans a single file for credential-shaped strings using the SAME pattern
// list export-session.js already uses for the transcript — reusing
// secretPatterns.js instead of reimplementing the regexes here a second
// time. Two copies of a pattern list is exactly the enums.js/ai_context
// class of bug this project has already been burned by twice.
//
// Usage: node scan_text.mjs <file>
// Prints JSON {leaks: [[label, count], ...]} to stdout. Exit 0 always —
// the CALLER (update-backup-docs.sh) decides what a non-empty leak list
// means; this script's only job is to report accurately.
import fs from 'node:fs';
import { scan } from '../lib/secretPatterns.js';

const filePath = process.argv[2];
if (!filePath) {
  console.error('Usage: node scan_text.mjs <file>');
  process.exit(2);
}

const text = fs.readFileSync(filePath, 'utf-8');
const found = scan(text);
console.log(JSON.stringify({ leaks: [...found.entries()] }));
