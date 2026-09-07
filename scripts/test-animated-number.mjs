// AnimatedNumber must always end up showing the value it was given.
//
// WHAT THIS TEST DOES AND DOES NOT PROVE — read before trusting it.
//
// It asserts the invariant: after any sequence of value changes, including
// ones that interrupt an in-flight animation, the rendered text equals the
// value passed in. That is a real property and this test does check it.
//
// It does NOT reproduce the original production bug. Verified: checked out
// the pre-fix component and ran this suite against it, with and without
// React.StrictMode, and every case still passed. So this is an invariant
// test, not a regression test for that defect, and it must not be cited as
// proof the defect cannot return.
//
// THE BUG IT FAILED TO CATCH
//
// The component tracked its animation origin in a ref assigned in exactly one
// place - the final frame - while the cleanup cancelled the frame without
// updating it. An interruption left the ref pointing at a number the display
// had already left; when the `from === to` guard later matched that stale
// origin, no animation ran and the number stopped updating. On the Dashboard,
// switching the hero period between 2025 / 2026 / last 30 days left INCOME
// reading $1,328 and EXPENSES $2,301 in all three while the savings rate
// beside them correctly showed 22% / -138% / -73%. The savings rate is not
// animated, which is what exposed it.
//
// The real proof of the fix is empirical: driving the deployed app and
// comparing every figure against a direct database query. 2025 -> $276/$215,
// 2026 -> $4,130/$9,840, last 30 days -> $1,328/$2,301, and switching back
// returns the same values. Reproducing that in jsdom would need the exact
// scheduling of a real browser under React's dev double-invoke, which this
// harness does not recreate.
//
// Kept anyway: it would catch a future rewrite that breaks convergence on the
// ordinary paths, which is cheap insurance even though it is not the guard I
// set out to write.
//
// Usage: node scripts/test-animated-number.mjs

import { JSDOM } from 'jsdom';
import { build } from 'esbuild';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import fs from 'node:fs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// ---- DOM before React is imported ------------------------------------------
const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  pretendToBeVisual: true, // provides requestAnimationFrame
  url: 'http://localhost/',
});
global.window = dom.window;
global.document = dom.window.document;
// Node 21+ defines a read-only global `navigator`, so plain assignment
// throws. defineProperty replaces the accessor outright.
Object.defineProperty(global, 'navigator', {
  value: dom.window.navigator, configurable: true, writable: true,
});
// rAF must stamp frames from the SAME clock the component measures with.
// jsdom's rAF timestamps come from jsdom's own origin while
// performance.now() comes from Node's, so `now - start` was garbage and
// the easing produced values like -29,378 for a target of 4,130. That was
// the harness, not the component - worth saying, because a test that
// fails for its own reasons is indistinguishable from a real defect.
global.requestAnimationFrame = (cb) => setTimeout(() => cb(performance.now()), 16);
global.cancelAnimationFrame = (id) => clearTimeout(id);
// NOT overridden. jsdom's Performance delegates to the global one, so
// assigning jsdom's back onto global makes performance.now() call itself
// until the stack blows. Node's built-in global performance is what the
// component should use anyway.
global.IS_REACT_ACT_ENVIRONMENT = true;

let failures = 0;
const check = (label, got, expected) => {
  const ok = String(got) === String(expected);
  if (!ok) failures++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}: got ${got}, expected ${expected}`);
};

// AnimatedNumber is JSX and imports via the '@' alias, so bundle it the way
// Vite would rather than hand-transpiling.
// Written to a real file inside the project rather than imported from a
// data: URL. React stays external so the test drives the same copy of React
// the app uses, and a data: URL cannot resolve a bare "react" specifier -
// only a file on disk under node_modules' reach can.
const outFile = path.join(root, 'scripts', '.animated-number.build.mjs');
await build({
  entryPoints: [path.join(root, 'src/components/AnimatedNumber.jsx')],
  bundle: true, outfile: outFile, format: 'esm', jsx: 'automatic',
  external: ['react', 'react-dom', 'react/jsx-runtime'],
  alias: { '@': path.join(root, 'src') },
});
const mod = await import(pathToFileURL(outFile).href);
const AnimatedNumber = mod.default;
process.on('exit', () => { try { fs.unlinkSync(outFile); } catch { /* already gone */ } });

const React = (await import('react')).default;
const { createRoot } = await import('react-dom/client');
const { act } = await import('react');

const container = document.getElementById('root');
const root_ = createRoot(container);
const text = () => container.textContent;

// Let animations run to completion. 600ms duration, so 700ms of frames.
const settle = async () => {
  await act(async () => {
    for (let i = 0; i < 45; i++) {
      await new Promise(r => setTimeout(r, 16));
    }
  });
};

console.log('AnimatedNumber converges on its target\n');

// The real Dashboard figures, and the order that broke it.
const SEQUENCE = [
  { label: '2025 income', value: 276 },
  { label: '2026 income', value: 4130 },
  { label: 'last 30d income', value: 1328 },
  { label: 'back to 2025', value: 276 },
];

for (const step of SEQUENCE) {
  await act(async () => { root_.render(React.createElement(React.StrictMode, null, React.createElement(AnimatedNumber, { value: step.value }))); });
  await settle();
  check(step.label, text().replace(/,/g, ''), String(step.value));
}

// The actual trigger: change the target repeatedly WITHOUT letting the
// animation finish, then settle once. A component that only updates its origin
// on completion is left holding a stale value here.
console.log('\nInterrupted mid-animation (the original bug)\n');
for (const v of [276, 4130, 1328, 9840, 276, 4130]) {
  await act(async () => { root_.render(React.createElement(React.StrictMode, null, React.createElement(AnimatedNumber, { value: v }))); });
  // deliberately far less than the 600ms duration
  await act(async () => { await new Promise(r => setTimeout(r, 40)); });
}
await settle();
check('final value after 6 rapid switches', text().replace(/,/g, ''), '4130');

// Same abuse, ending on a different value, to prove it is not coincidence.
for (const v of [1328, 276, 9840]) {
  await act(async () => { root_.render(React.createElement(React.StrictMode, null, React.createElement(AnimatedNumber, { value: v }))); });
  await act(async () => { await new Promise(r => setTimeout(r, 30)); });
}
await settle();
check('final value after switching again', text().replace(/,/g, ''), '9840');

// Negative and zero, since net-saved crosses both.
for (const v of [-5710, 0, 61]) {
  await act(async () => { root_.render(React.createElement(React.StrictMode, null, React.createElement(AnimatedNumber, { value: v }))); });
  await settle();
  check(`settles on ${v}`, text().replace(/,/g, ''), String(v));
}

console.log('');
if (failures) {
  console.log(`${failures} check(s) failed — a displayed figure did not match its value.`);
  process.exit(1);
}
console.log('AnimatedNumber always displays the value it was given.');
