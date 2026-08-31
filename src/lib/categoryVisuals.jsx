import { Home, Utensils, Car, Clapperboard, HeartPulse, ShoppingBag, GraduationCap, PiggyBank, Wallet, Laptop, TrendingUp, MoreHorizontal } from 'lucide-react';

// Single source of truth for category color + icon, used everywhere a
// spending category shows up (Dashboard, Money, Budget, Spending Summary).
// Previously every page kept its own copy of this map, and at least one
// (SpendingByCategoryChart.jsx) drifted out of sync and silently dropped
// 'investment' entirely. Also: real vector icons instead of emoji, since
// emoji glyphs aren't guaranteed to render the same (or at all) across
// every font/platform — an emoji here previously rendered as literal
// garbled text on at least one device.
export const CAT_COLORS = {
  housing: '#7C3AED', food: '#F97316', transport: '#3B82F6', entertainment: '#EC4899',
  health: '#EF4444', shopping: '#F59E0B', education: '#10B981', savings: '#059669',
  salary: '#22C55E', freelance: '#6366F1', investment: '#0EA5E9', other: '#94A3B8',
};

const ICON_MAP = {
  housing: Home, food: Utensils, transport: Car, entertainment: Clapperboard,
  health: HeartPulse, shopping: ShoppingBag, education: GraduationCap,
  savings: PiggyBank, salary: Wallet, freelance: Laptop, investment: TrendingUp,
  other: MoreHorizontal,
};

export function CategoryIcon({ category, className = 'w-4 h-4', style }) {
  const Icon = ICON_MAP[category] || MoreHorizontal;
  return <Icon className={className} style={style} />;
}

// Reusable tinted badge: icon in a color-matched circle, the same visual
// language used for transaction rows and net worth entries.
export function CategoryBadge({ category, size = 'w-9 h-9', iconSize = 'w-4 h-4' }) {
  const color = CAT_COLORS[category] || CAT_COLORS.other;
  return (
    <div className={`${size} rounded-xl flex items-center justify-center shrink-0`} style={{ backgroundColor: color + '1F' }}>
      <CategoryIcon category={category} className={iconSize} style={{ color }} />
    </div>
  );
}
