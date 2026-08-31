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
    heroFrom: '#1e40af', heroVia: '#4f46e5', heroTo: '#7c3aed',
    swatch: 'linear-gradient(135deg, #1e40af, #7c3aed)',
  },
  violet: {
    label: 'Violet Dusk',
    background: '272 40% 96%',
    secondary: '270 32% 93%',
    border: '270 26% 89%',
    heroFrom: '#6d28d9', heroVia: '#a21caf', heroTo: '#db2777',
    swatch: 'linear-gradient(135deg, #6d28d9, #db2777)',
  },
  emerald: {
    label: 'Emerald',
    background: '158 32% 95%',
    secondary: '158 26% 92%',
    border: '158 22% 87%',
    heroFrom: '#0f766e', heroVia: '#059669', heroTo: '#22c55e',
    swatch: 'linear-gradient(135deg, #0f766e, #22c55e)',
  },
  sunset: {
    label: 'Sunset',
    background: '22 45% 96%',
    secondary: '22 36% 92%',
    border: '22 28% 88%',
    heroFrom: '#b45309', heroVia: '#ea580c', heroTo: '#e11d48',
    swatch: 'linear-gradient(135deg, #b45309, #e11d48)',
  },
  slate: {
    label: 'Slate',
    background: '220 16% 95%',
    secondary: '220 14% 92%',
    border: '220 13% 87%',
    heroFrom: '#334155', heroVia: '#475569', heroTo: '#4f46e5',
    swatch: 'linear-gradient(135deg, #334155, #4f46e5)',
  },
};

const DEFAULT_THEME = 'ocean';
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
  // The hero gradient looks fine in both themes as-is, so it applies either way.
  root.setProperty('--hero-from', theme.heroFrom);
  root.setProperty('--hero-via', theme.heroVia);
  root.setProperty('--hero-to', theme.heroTo);
  localStorage.setItem(STORAGE_KEY, key);
}
