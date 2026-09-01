// Accessibility text-size preference. Tailwind's text-* utilities are all
// rem-based, so scaling the root font-size scales every number and label
// in the app proportionally, without touching individual components.
const STORAGE_KEY = 'largeText';

export function getLargeText() {
  return localStorage.getItem(STORAGE_KEY) === '1';
}

export function applyTextSize(large) {
  document.documentElement.style.fontSize = large ? '112.5%' : '';
  localStorage.setItem(STORAGE_KEY, large ? '1' : '0');
}
