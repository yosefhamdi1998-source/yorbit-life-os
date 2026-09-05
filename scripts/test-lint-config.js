// The linter must actually catch a crash-class mistake.
//
// WHY THIS EXISTS
//
// eslint.config.js brings in the recommended rule set by spreading the config
// object:
//
//     ...pluginJs.configs.recommended,
//     ...pluginReact.configs.flat.recommended,
//     languageOptions: { ... },
//     rules: { "no-unused-vars": "off", ... },
//
// The later `rules` key REPLACES the rules object those spreads contributed
// rather than merging into it. Every recommended rule was therefore off -
// no-undef, no-redeclare, no-const-assign, the lot - while `npm run lint`
// reported zero problems.
//
// What that cost: Coach.jsx called computeSavingsRate() and savingsRateLabel()
// without importing either. Lint passed. The build passed. The AI Coach - the
// feature the Go Pro button is selling - threw ReferenceError on render and
// showed the error boundary to every user who opened it.
//
// A linter that reports success while a page cannot render is worse than no
// linter, because it is trusted. Asserting the rule is "on" in the config file
// is not enough either: it has to be on in the RESOLVED config for a real file
// path, which is what the spread-vs-merge bug broke. So this lints an actual
// fixture and requires the error.
//
// Usage: node scripts/test-lint-config.js

import { ESLint } from 'eslint';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let failures = 0;
const check = (label, got, expected) => {
  const ok = got === expected;
  if (!ok) failures++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}: got ${got}, expected ${expected}`);
};

// Written inside src/pages so it matches the same config block the real pages
// do. A fixture elsewhere would prove nothing about the files that ship.
const fixture = path.join(root, 'src', 'pages', '__lint_fixture__.jsx');

const CASES = [
  {
    name: 'undefined identifier (the Coach crash)',
    rule: 'no-undef',
    code: 'export default function F() {\n  return <div>{someUndefinedHelper(1)}</div>;\n}\n',
  },
  {
    name: 'assignment to a const',
    rule: 'no-const-assign',
    code: 'export default function F() {\n  const a = 1;\n  a = 2;\n  return <div>{a}</div>;\n}\n',
  },
  {
    name: 'duplicate object key',
    rule: 'no-dupe-keys',
    code: 'export default function F() {\n  const o = { a: 1, a: 2 };\n  return <div>{o.a}</div>;\n}\n',
  },
];

async function main() {
  const eslint = new ESLint({ cwd: root });
  console.log('Lint config must catch crash-class mistakes\n');

  for (const c of CASES) {
    fs.writeFileSync(fixture, c.code);
    let ruleIds = [];
    try {
      const results = await eslint.lintFiles([fixture]);
      ruleIds = results.flatMap(r => r.messages.map(m => m.ruleId));
    } finally {
      fs.rmSync(fixture, { force: true });
    }
    check(`${c.name} -> ${c.rule} reported`, ruleIds.includes(c.rule), true);
  }

  // And the real file that broke, still clean.
  const coach = path.join(root, 'src', 'pages', 'Coach.jsx');
  const results = await eslint.lintFiles([coach]);
  const undef = results.flatMap(r => r.messages.filter(m => m.ruleId === 'no-undef'));
  check('Coach.jsx has no undefined identifiers', undef.length, 0);

  console.log('');
  if (failures) {
    console.log(`${failures} check(s) failed. The linter is not catching what it must.`);
    process.exit(1);
  }
  console.log('Lint config verified: undefined identifiers and friends are caught.');
}

main().catch(err => { console.error(err); process.exit(1); });
