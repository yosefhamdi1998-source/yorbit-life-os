// "Simple Mode" — a reduced-complexity experience for someone who just
// wants to see their money and not get lost in period-range pickers and
// niche pages (a teenager, or anyone who finds the full app noisy). Same
// localStorage-preference pattern as textSize.js — a per-device choice,
// not tied to the account, so switching it doesn't touch anyone's data.
const STORAGE_KEY = 'simpleMode';

export function getSimpleMode() {
  return localStorage.getItem(STORAGE_KEY) === '1';
}

export function setSimpleMode(simple) {
  localStorage.setItem(STORAGE_KEY, simple ? '1' : '0');
}
