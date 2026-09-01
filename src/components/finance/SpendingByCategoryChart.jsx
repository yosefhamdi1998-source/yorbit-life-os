import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { CAT_COLORS, CategoryBadge } from '@/lib/categoryVisuals';

function fmt(n) { return (n || 0).toLocaleString('en-US', { maximumFractionDigits: 0 }); }

const CustomTooltip = ({ active, payload }) => {
  if (active && payload?.length) {
    const { name, value } = payload[0];
    return (
      <div className="sky-card rounded-xl px-3 py-2 shadow-lg">
        <p className="text-xs font-bold text-foreground capitalize">{name}</p>
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

      {/* Donut chart — a bare ring with nothing else on the card read as
          half-empty, so the total lives in the hole (the standard pattern
          for this chart) and the top 3 categories sit beside it as a
          compact legend instead of leaving that whole side blank. */}
      <div className="flex items-center gap-2 px-2">
        <div className="relative w-[190px] h-[190px] shrink-0 mx-auto">
          <ResponsiveContainer width="100%" height="100%">
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
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Total</p>
            <p className="text-lg font-black text-foreground tabular-nums">${fmt(totalExpenses)}</p>
          </div>
        </div>
        <div className="flex-1 min-w-0 space-y-2 pr-1">
          {sorted.slice(0, 4).map(({ name, spent }) => {
            const pct = totalExpenses > 0 ? Math.round((spent / totalExpenses) * 100) : 0;
            return (
              <div key={name} className="flex items-center gap-2 min-w-0">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: CAT_COLORS[name] || '#94A3B8' }} />
                <span className="text-xs font-semibold text-foreground capitalize truncate flex-1">{name}</span>
                <span className="text-xs font-bold text-muted-foreground tabular-nums shrink-0">{pct}%</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Category breakdown list. Two clear lines per row instead of four
          numbers crammed onto one — name+total on top (what you'd scan
          for), share-of-spending and budget-progress below in smaller,
          muted text (context, not headline). */}
      <div className="px-4 pb-4 space-y-4">
        {sorted.map(({ name, spent, budget }) => {
          const pct = totalExpenses > 0 ? Math.round((spent / totalExpenses) * 100) : 0;
          const budgetPct = budget > 0 ? Math.min(100, Math.round((spent / budget) * 100)) : null;
          const over = budget > 0 && spent > budget;
          const close = budget > 0 && !over && budgetPct >= 80;
          const color = CAT_COLORS[name] || '#94A3B8';

          return (
            <div key={name} className="flex items-center gap-3">
              <CategoryBadge category={name} size="w-10 h-10" iconSize="w-[18px] h-[18px]" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-bold text-foreground capitalize truncate">{name}</span>
                  <span className="text-sm font-bold text-foreground tabular-nums shrink-0">${fmt(spent)}</span>
                </div>
                <div className="flex items-center justify-between gap-2 mt-0.5">
                  <span className="text-xs text-muted-foreground font-medium">{pct}% of spending</span>
                  {budget > 0 && (
                    <span className={`text-xs font-semibold shrink-0 ${over ? 'text-red-500' : close ? 'text-amber-500' : 'text-muted-foreground'}`}>
                      {over ? '⚠ ' : ''}{budgetPct}% of ${fmt(budget)} budget
                    </span>
                  )}
                </div>
                <div className="h-2 rounded-full overflow-hidden mt-1.5" style={{ backgroundColor: color + '22' }}>
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
