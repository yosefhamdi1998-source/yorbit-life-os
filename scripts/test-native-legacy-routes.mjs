import assert from 'node:assert/strict';
import fs from 'node:fs';
import React from 'react';
import { createRoutesFromChildren, matchRoutes, Route, Routes, Navigate } from 'react-router-dom';
import { transform } from 'esbuild';

// Evaluate App's real route tree and match URLs with React Router. Page bodies
// and auth are faked, so this test never reads account data or calls providers.
let platform = 'web';
const page = name => Object.assign(() => null, { displayName: name });
const source = fs.readFileSync('src/App.jsx', 'utf8');
const pageNames = [...source.matchAll(/^const (\w+) = lazy\(/gm)].map(match => match[1]);
const pages = Object.fromEntries(pageNames.map(name => [name, page(name)]));
globalThis.__legacyRouteTest = {
  React, Route, Routes, Navigate, ...pages,
  Layout: page('Layout'), ProtectedRoute: page('ProtectedRoute'), PageNotFound: page('PageNotFound'),
  useAuth: () => ({ isLoadingAuth: false, isLoadingPublicSettings: false }),
  isNative: () => platform !== 'web', isNativeIOS: () => platform === 'ios',
  FEATURES: { bankSync: true, launchChecklist: false },
};
const transformed = source
  .replace(/^import .*;?\r?\n/gm, '')
  .replace(/^const \w+ = lazy\(.*\);\r?\n/gm, '');
const prelude = `const { ${Object.keys(globalThis.__legacyRouteTest).join(',')} } = globalThis.__legacyRouteTest; const { Suspense } = React;`;
const { code } = await transform(prelude + transformed + '\nexport { AuthenticatedApp };', {
  loader: 'jsx', format: 'esm', define: { 'import.meta.env.DEV': 'false' },
});
const { AuthenticatedApp } = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
const legacy = [['/tasks','Tasks'], ['/habits','Habits'], ['/journal','Journal'], ['/health-log','HealthLog']];
const retained = [['/notes','Notes'], ['/forms','Forms'], ['/settings','Settings'], ['/login','Login'], ['/forgot-password','ForgotPassword'], ['/bank-oauth-return','BankOAuthReturn']];
let checks = 0;
for (platform of ['web','ios','android']) {
  const tree = AuthenticatedApp();
  const routes = createRoutesFromChildren(tree.props.children.props.children);
  for (const [path, name] of [...legacy, ...retained]) {
    const expected = platform === 'ios' && legacy.some(([url]) => url === path) ? 'PageNotFound' : name;
    const matches = matchRoutes(routes, path);
    assert.equal(matches?.at(-1).route.element.type.displayName, expected, `${platform}: ${path}`);
    checks++;
  }
}
console.log(`PASS native route behavior: ${checks} web/iOS/Android URL matches; iOS legacy routes unavailable, active and other-platform routes preserved`);
