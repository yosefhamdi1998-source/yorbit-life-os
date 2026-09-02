// Shared money-formatting helpers. Split out once the "All Time" period
// (and a second, much bigger crypto account) started producing 6-7 digit
// totals that a plain `.toLocaleString()` would either overflow a tight
// card or force onto two lines — every caller was solving this ad hoc
// with its own `fmt()`, so the two formats that actually need to differ
// (full precision vs. a compact card-safe form) live here once.

// Full precision, comma-grouped, no cents — for places with room to
// breathe (big hero numbers, tables, totals pages).
export function fmtFull(n) {
  const v = n || 0;
  return (v < 0 ? '−' : '') + Math.abs(v).toLocaleString('en-US', { maximumFractionDigits: 0 });
}

// Compact K/M form for tight stat tiles — "$1.36M" instead of "$1,355,406"
// silently clipping inside a 3-column grid on mobile. Kept lossless enough
// to still be meaningful (2 decimals on M, whole numbers on K), with the
// exact figure always available via the `title` attribute callers attach.
export function fmtCompact(n) {
  const v = n || 0;
  const abs = Math.abs(v);
  const sign = v < 0 ? '−' : '';
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(abs >= 10_000_000 ? 1 : 2)}M`;
  if (abs >= 10_000) return `${sign}$${Math.round(abs / 1000)}K`;
  return `${sign}$${fmtFull(abs)}`;
}

// Chart axis ticks get their own, more aggressive compact form — an axis
// column is only ~46px wide, so even fmtCompact's "$4,500" (fine inside a
// roomy stat card) overflows it and gets silently clipped down to "500"
// with no dollar sign or leading digit. Always-K-from-$1,000 keeps every
// tick short enough to actually fit.
export function fmtAxisCompact(n) {
  const v = n || 0;
  const abs = Math.abs(v);
  const sign = v < 0 ? '−' : '';
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}$${Math.round(abs / 1000)}K`;
  return `${sign}$${Math.round(abs)}`;
}

// Adaptive Tailwind size classes for the one big hero number — a plain
// fixed text-6xl reads as huge and confident at "$1,240" but overflows or
// wraps mid-digit once totals cross into 7-8 characters (an "All Time" net
// figure on a crypto-heavy account easily does). Picks a smaller scale as
// the formatted string gets longer instead of letting CSS clip it.
export function heroValueSizeClass(formattedValue) {
  const len = String(formattedValue).replace(/[^0-9]/g, '').length;
  if (len <= 6) return 'text-4xl lg:text-6xl';
  if (len <= 8) return 'text-3xl lg:text-5xl';
  return 'text-2xl lg:text-4xl';
}
