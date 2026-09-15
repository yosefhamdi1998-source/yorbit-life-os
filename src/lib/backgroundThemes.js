export const BACKGROUND_THEMES = {
  aurora: {
    label: 'Aurora', description: 'Luminous gradients, floating cards, geometric numbers', style: 'aurora',
    background: '250 45% 95%', secondary: '250 35% 91%', border: '250 28% 80%', primary: '262 65% 45%',
    heroFrom: '#312e81', heroVia: '#7e22ce', heroTo: '#0e7490', swatch: 'linear-gradient(135deg, #312e81, #9333ea, #22d3ee)',
  },
  editorial: {
    label: 'Editorial', description: 'Warm paper, fine borders, classic serif headings', style: 'editorial',
    background: '40 35% 92%', secondary: '40 25% 87%', border: '35 20% 75%', primary: '24 55% 32%',
    heroFrom: '#44403c', heroVia: '#78350f', heroTo: '#a16207', swatch: 'linear-gradient(135deg, #ede4d3, #a88b64)',
  },
  coastal: {
    label: 'Coastal', description: 'Airy blue surfaces, soft shapes, calm typography', style: 'coastal',
    background: '190 40% 94%', secondary: '190 35% 88%', border: '190 30% 77%', primary: '192 80% 30%',
    heroFrom: '#164e63', heroVia: '#0e7490', heroTo: '#0f766e', swatch: 'linear-gradient(135deg, #cffafe, #0e7490)',
  },
  club: {
    label: 'Midnight Club', description: 'Gold details, tailored cards, elegant display type', style: 'club',
    background: '40 20% 93%', secondary: '40 18% 87%', border: '40 25% 72%', primary: '40 70% 32%',
    heroFrom: '#151311', heroVia: '#493719', heroTo: '#8a651f', swatch: 'linear-gradient(135deg, #111111, #b89145)',
  },
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
    heroFrom: '#9d174d', heroVia: '#db2777', heroTo: '#DD8163',
    swatch: 'linear-gradient(135deg, #9d174d, #DD8163)',
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
  let saved;
  try { saved = localStorage.getItem(STORAGE_KEY); } catch { return DEFAULT_THEME; }
  return BACKGROUND_THEMES[saved] ? saved : DEFAULT_THEME;
}

// Theme surfaces follow the selected hue in both appearance modes.
export function applyBackgroundTheme(key, isDark) {
  const selected = BACKGROUND_THEMES[key] ? key : DEFAULT_THEME;
  const theme = BACKGROUND_THEMES[selected];
  const hue = theme.primary.split(' ')[0];
  const root = document.documentElement.style;
  const style = theme.style || 'classic';
  document.documentElement.dataset.themeStyle = style;
  const serif = style === 'editorial' || style === 'club';
  const headingFont = serif ? 'Georgia, "Times New Roman", serif' : '"Space Grotesk", Inter, sans-serif';
  const foreground = isDark ? `${hue} 18% 94%` : `${hue} 30% 13%`;
  const tintedCard = style === 'editorial' ? `${hue} 25% 97%` : `${hue} 35% 99%`;
  const backdrop = style === 'aurora'
    ? `radial-gradient(ellipse at 0% 0%, hsl(270 80% 60% / ${isDark ? '.18' : '.12'}), transparent 60%), radial-gradient(ellipse at 100% 60%, hsl(190 80% 50% / .12), transparent 55%)`
    : style === 'editorial' ? 'repeating-linear-gradient(0deg, transparent 0 31px, hsl(35 35% 50% / .035) 31px 32px)'
    : style === 'coastal' ? 'radial-gradient(ellipse at 100% 0%, hsl(175 65% 60% / .15), transparent 70%)' : 'none';
  const values = {
    '--foreground': foreground,
    '--card-foreground': foreground,
    '--popover-foreground': foreground,
    '--secondary-foreground': isDark ? `${hue} 20% 86%` : `${hue} 25% 24%`,
    '--muted-foreground': isDark ? `${hue} 14% 72%` : `${hue} 15% 37%`,
    '--theme-heading': headingFont,
    '--theme-numbers': style === 'club' ? 'Georgia, serif' : '"Space Grotesk", Inter, sans-serif',
    '--theme-backdrop': backdrop,
    '--theme-radius': style === 'editorial' ? '.45rem' : style === 'coastal' ? '1.8rem' : style === 'club' ? '.85rem' : '1.25rem',
    '--theme-shadow': style === 'editorial' ? '2px 3px 0 hsl(var(--border) / .4)' : style === 'aurora' ? '0 12px 36px -18px hsl(var(--primary) / .35)' : '0 4px 18px -10px hsl(var(--foreground) / .18)',
    '--theme-nav': isDark ? `${hue} 22% 11%` : `${hue} 30% 97%`,
    '--chart-income': isDark ? '#6ee7b7' : '#187354',
    '--chart-expense': style === 'club' ? (isDark ? '#e5be76' : '#946413') : style === 'coastal' ? (isDark ? '#7dd3fc' : '#0369a1') : style === 'aurora' ? (isDark ? '#c4b5fd' : '#7c3aed') : (isDark ? '#fdba74' : '#b45309'),
    '--background': isDark ? hue + ' 24% 9%' : theme.background,
    '--card': isDark ? hue + ' 22% 13%' : tintedCard,
    '--popover': isDark ? hue + ' 22% 13%' : '0 0% 100%',
    '--secondary': isDark ? hue + ' 24% 19%' : theme.secondary,
    '--muted': isDark ? hue + ' 24% 19%' : theme.secondary,
    '--border': isDark ? hue + ' 24% 26%' : theme.border,
    '--input': isDark ? hue + ' 24% 26%' : theme.border,
    '--primary': theme.primary,
    '--primary-text': hue + (isDark ? ' 80% 78%' : ' 70% 32%'),
    '--primary-foreground': selected === 'gold' || selected === 'emerald' || selected === 'teal' ? '0 0% 5%' : '0 0% 100%',
    '--ring': hue + (isDark ? ' 80% 70%' : ' 70% 40%'),
    '--hero-from': theme.heroFrom,
    '--hero-via': theme.heroVia,
    '--hero-to': theme.heroTo,
  };
  for (const [name, value] of Object.entries(values)) root.setProperty(name, value);
  try { localStorage.setItem(STORAGE_KEY, selected); } catch { /* The theme still applies for this session. */ }
}
