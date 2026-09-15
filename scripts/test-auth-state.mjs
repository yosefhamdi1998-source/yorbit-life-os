import assert from 'node:assert/strict';
import fs from 'node:fs';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { transform } from 'esbuild';

const dom = new JSDOM('<div id="root"></div>', { url: 'https://example.test' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let callback, latest, root, requests = [], unsubscribed = false, insideCallback = false;
const base44 = { auth: {
  me: () => {
    assert.equal(insideCallback, false, 'No auth request inside the auth event callback');
    return new Promise((resolve, reject) => requests.push({ resolve, reject }));
  },
  logout: async () => {}, redirectToLogin: () => {},
} };
const supabase = { auth: { onAuthStateChange: handler => {
  callback = handler;
  return { data: { subscription: { unsubscribe: () => { unsubscribed = true; } } } };
} } };
globalThis.__authTest = { React, base44, supabase };
const source = fs.readFileSync('src/lib/AuthContext.jsx', 'utf8').replace(/^import .*;\r?\n/gm, '');
const prelude = 'const {React,base44,supabase}=globalThis.__authTest; const {createContext,useState,useContext,useEffect,useRef}=React;';
const { code } = await transform(prelude + source, { loader: 'jsx', format: 'esm' });
const { AuthProvider, useAuth } = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
function Reader() { latest = useAuth(); return null; }
const settle = fn => act(async () => { fn?.(); await new Promise(resolve => setTimeout(resolve, 5)); });
async function mount() {
  requests = []; unsubscribed = false;
  root = createRoot(document.getElementById('root'));
  await settle(() => root.render(React.createElement(AuthProvider, null, React.createElement(Reader))));
}
function emit(id) {
  insideCallback = true;
  try { callback(id ? 'SIGNED_IN' : 'SIGNED_OUT', id ? { user: { id } } : null); }
  finally { insideCallback = false; }
}
await mount();
const initial = requests[0];
await settle(() => emit(null));
await settle(() => initial.resolve({ id: 'old-account' }));
assert.equal(latest.user, null, 'Initial request cannot restore a signed-out account');
assert.equal(latest.isAuthenticated, false);
await settle(() => emit('account-a'));
const accountA = requests.at(-1);
await settle(() => emit('account-b'));
const accountB = requests.at(-1);
await settle(() => accountB.resolve({ id: 'account-b' }));
await settle(() => accountA.resolve({ id: 'account-a' }));
assert.equal(latest.user.id, 'account-b', 'Old success cannot overwrite the newer account');
await settle(() => emit('account-b'));
const oldFailure = requests.at(-1);
await settle(() => emit('account-c'));
const accountC = requests.at(-1);
await settle(() => accountC.resolve({ id: 'account-c' }));
await settle(() => oldFailure.reject(Object.assign(new Error('Expired'), { status: 401 })));
assert.equal(latest.user.id, 'account-c', 'Stale failure cannot clear a newer account');
assert.equal(latest.authError, null);
await settle(() => emit('account-d'));
await settle(() => requests.at(-1).resolve({ id: 'wrong-account' }));
assert.equal(latest.user, null, 'Mismatched profile is rejected');
assert.equal(latest.isAuthenticated, false);
await settle(() => emit('account-e'));
const beforeLogout = requests.at(-1);
await settle(() => latest.logout(false));
await settle(() => beforeLogout.resolve({ id: 'account-e' }));
assert.equal(latest.user, null, 'Logout invalidates in-flight profile reads before the server event');
await settle(() => root.unmount());
assert.equal(unsubscribed, true);
await mount();
const beforeUnmount = requests[0];
await settle(() => root.unmount());
const snapshot = latest;
await settle(() => beforeUnmount.resolve({ id: 'unmounted' }));
assert.equal(latest, snapshot, 'Unmounted request cannot publish state');
console.log('PASS auth state: sign-out, account switch, stale failure, identity mismatch, logout, cleanup, deferred API calls');
