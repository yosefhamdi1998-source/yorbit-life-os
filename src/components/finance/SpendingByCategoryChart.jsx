import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';

// Kept in sync with the app's other category maps (SpendingSummary,
// CategoryBreakdownCard) — this one was missing investment/savings/salary/
// freelance entirely, so any category not in this list silently fell back
// to the same gray as "Other" with no icon, making it invisible.
const CAT_COLORS = {
  housing: '#7C3AED', food: '#F97316', transport: '#3B82F6', entertainment: '#EC4899',
  health: '#EF4444', shopping: '#F59E0B', education: '#10B981', savings: '#059669',
  salary: '#22C55E', freelance: '#6366F1', investment: '#0EA5E9', other: '#94A3B8',
};
const CAT_ICONS = {
  housing: '🏠', food: '🍔', transport: '🚗', entertainment: '🎬', health: '💊',
  shopping: '🛍️', education: '📚', savings: '💰', salary: '💵', freelance: '💻',
  investment: '📈', other: '💸',
};

function fmt(n) { return (n || 0).toLocaleString('en-US', { maximumFractionDigits: 0 }); }

const CustomTooltip = ({ active, payload }) => {
  if (active && payload?.length) {
    const { name, value } = payload[0];
    return (
      <div className="sky-card rounded-xl px-3 py-2 shadow-lg">
        <p className="text-xs font-bold text-foreground capitalize">{CAT_ICONS[name] || '💸'} {name}</p>
        <p className="text-sm font-black text-foreground">${fmt(value)}</p>
      </div>
    );
  }
  return null;
};

export default function SpendingByCategoryChart({ catData, totalExpenses }) {
  if (!catData || catData.length === 0) return null;

  const sorted = [...catData].sort((a, b) => b.spent - a.spent);

  return (
    <div className="sky-card rounded-2xl overflow-hidden mb-4">
      <div className="px-4 pt-4 pb-2">
        <p className="font-bold text-sm text-foreground">Spending by Category</p>
        <p className="text-xs text-muted-foreground font-medium">This month · ${fmt(totalExpenses)} total</p>
      </div>

      {/* Donut chart */}
      <div className="flex justify-center">
        <ResponsiveContainer width="100%" height={200}>
          <PieChart>
            <Pie
              data={sorted}
              dataKey="spent"
              nameKey="name"
              cx="50%"
              cy="50%"
              innerRadius={55}
              outerRadius={85}
              paddingAngle={2}
              strokeWidth={0}
            >
              {sorted.map((entry) => (
                <Cell key={entry.name} fill={CAT_COLORS[entry.name] || '#94A3B8'} />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
          </PieChart>
        </ResponsiveContainer>
      </div>

      {/* Category breakdown list — each row gets a real icon chip in its
          category color, so the biggest slice is never just an unlabeled
          gray sliver next to everything else. */}
      <div className="px-4 pb-4 space-y-2.5">
        {sorted.map(({ name, spent, budget }) => {
          const pct = totalExpenses > 0 ? Math.round((spent / totalExpenses) * 100) : 0;
          const budgetPct = budget > 0 ? Math.min(100, Math.round((spent / budget) * 100)) : null;
          const over = budget > 0 && spent > budget;
          const close = budget > 0 && !over && budgetPct >= 80;
          const color = CAT_COLORS[name] || '#94A3B8';

          return (
            <div key={name} className="flex items-center gap-3">
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 text-base"
                style={{ backgroundColor: color + '1F' }}
              >
                {CAT_ICONS[name] || '💸'}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="text-sm font-semibold text-foreground capitalize truncate">{name}</span>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {budget > 0 && (
                      <span className={`text-[10px] font-semibold ${over ? 'text-red-500' : close ? 'text-amber-500' : 'text-muted-foreground'}`}>
                        {over ? '⚠️ ' : ''}{budgetPct}% of ${fmt(budget)}
                      </span>
                    )}
                    <span className="text-sm font-bold text-foreground tabular-nums">${fmt(spent)}</span>
                    <span className="text-xs text-muted-foreground font-medium tabular-nums w-9 text-right">{pct}%</span>
                  </div>
                </div>
                <div className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: color + '22' }}>
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${pct}%`, backgroundColor: color }}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
