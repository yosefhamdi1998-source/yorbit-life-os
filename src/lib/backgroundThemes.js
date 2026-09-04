// User-selectable background color themes. Separate from light/dark mode —
// dark mode stays as an accessibility/eye-comfort toggle; these change the
// *hue* of the light-mode ground and the dashboard hero, independent of it.
// Applied as CSS custom properties on :root at runtime, so nothing here can
// silently fight the stylesheet the way the old inline-style bug did — this
// is the one legitimate case for a runtime style write: a per-user choice
// that's supposed to override the default.

export const BACKGROUND_THEMES = {
  ocean: {
    label: 'Ocean',
    background: '224 38% 95%',
    secondary: '222 30% 92%',
    border: '222 25% 88%',
    primary: '217 91% 50%',
    heroFrom: '#1e40af', heroVia: '#4f46e5', heroTo: '#7c3aed',
    swatch: 'linear-gradient(135deg, #1e40af, #7c3aed)',
  },
  violet: {
    label: 'Violet Dusk',
    background: '272 40% 96%',
    secondary: '270 32% 93%',
    border: '270 26% 89%',
    primary: '272 70% 52%',
    heroFrom: '#6d28d9', heroVia: '#a21caf', heroTo: '#db2777',
    swatch: 'linear-gradient(135deg, #6d28d9, #db2777)',
  },
  emerald: {
    label: 'Emerald',
    background: '158 32% 95%',
    secondary: '158 26% 92%',
    border: '158 22% 87%',
    primary: '158 64% 38%',
    heroFrom: '#0f766e', heroVia: '#059669', heroTo: '#22c55e',
    swatch: 'linear-gradient(135deg, #0f766e, #22c55e)',
  },
  sunset: {
    label: 'Sunset',
    background: '22 45% 96%',
    secondary: '22 36% 92%',
    border: '22 28% 88%',
    primary: '18 88% 46%',
    heroFrom: '#b45309', heroVia: '#ea580c', heroTo: '#e11d48',
    swatch: 'linear-gradient(135deg, #b45309, #e11d48)',
  },
  slate: {
    label: 'Slate',
    background: '220 16% 95%',
    secondary: '220 14% 92%',
    border: '220 13% 87%',
    primary: '234 60% 50%',
    heroFrom: '#334155', heroVia: '#475569', heroTo: '#4f46e5',
    swatch: 'linear-gradient(135deg, #334155, #4f46e5)',
  },
  gold: {
    label: 'Black & Gold',
    background: '42 25% 95%',
    secondary: '40 20% 91%',
    border: '38 18% 86%',
    primary: '45 65% 45%',
    heroFrom: '#0a0a0a', heroVia: '#3d2f0a', heroTo: '#D4AF37',
    swatch: 'linear-gradient(135deg, #0a0a0a, #D4AF37)',
  },
  rose: {
    label: 'Rose',
    background: '340 42% 96%',
    secondary: '340 32% 93%',
    border: '340 26% 89%',
    primary: '336 70% 45%',
    heroFrom: '#9d174d', heroVia: '#db2777', heroTo: '#f97316',
    swatch: 'linear-gradient(135deg, #9d174d, #f97316)',
  },
  teal: {
    label: 'Teal',
    background: '190 40% 95%',
    secondary: '190 32% 91%',
    border: '190 26% 86%',
    primary: '192 75% 38%',
    heroFrom: '#155e75', heroVia: '#0891b2', heroTo: '#22d3ee',
    swatch: 'linear-gradient(135deg, #155e75, #22d3ee)',
  },
  sand: {
    label: 'Sand',
    background: '35 38% 95%',
    secondary: '35 30% 91%',
    border: '35 24% 86%',
    primary: '32 75% 42%',
    heroFrom: '#78350f', heroVia: '#b45309', heroTo: '#f59e0b',
    swatch: 'linear-gradient(135deg, #78350f, #f59e0b)',
  },
};

const DEFAULT_THEME = 'slate';
const STORAGE_KEY = 'bgTheme';

export function getBackgroundTheme() {
  const saved = localStorage.getItem(STORAGE_KEY);
  return BACKGROUND_THEMES[saved] ? saved : DEFAULT_THEME;
}

// isDark matters: an inline style on :root beats every class selector,
// including `.dark`, so setting the light-mode colors unconditionally would
// silently break dark mode the exact way a leftover inline style broke the
// background earlier tonight. In dark mode we clear these instead, so the
// stylesheet's `.dark` rule is what actually wins.
export function applyBackgroundTheme(key, isDark) {
  const theme = BACKGROUND_THEMES[key] || BACKGROUND_THEMES[DEFAULT_THEME];
  const root = document.documentElement.style;
  if (isDark) {
    root.removeProperty('--background');
    root.removeProperty('--secondary');
    root.removeProperty('--muted');
    root.removeProperty('--border');
    root.removeProperty('--input');
  } else {
    root.setProperty('--background', theme.background);
    root.setProperty('--secondary', theme.secondary);
    root.setProperty('--muted', theme.secondary);
    root.setProperty('--border', theme.border);
    root.setProperty('--input', theme.border);
  }
  // The hero gradient and primary accent look fine in both themes as-is, so
  // they apply either way — previously only the hero followed the chosen
  // theme, while --primary stayed a fixed blue everywhere else (every
  // button, active nav tab, link, focus ring), so a "Black & Gold" pick
  // recolored the top of Home and nothing else the user actually touches.
  root.setProperty('--hero-from', theme.heroFrom);
  root.setProperty('--hero-via', theme.heroVia);
  root.setProperty('--hero-to', theme.heroTo);
  root.setProperty('--primary', theme.primary);
  root.setProperty('--ring', theme.primary);
  localStorage.setItem(STORAGE_KEY, key);
}
