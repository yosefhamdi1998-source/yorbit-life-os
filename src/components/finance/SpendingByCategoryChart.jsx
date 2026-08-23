import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';

const CAT_COLORS = {
  housing: '#7C3AED', food: '#F97316', transport: '#3B82F6',
  entertainment: '#EC4899', health: '#EF4444', shopping: '#F59E0B',
  education: '#10B981', other: '#94A3B8',
};
const CAT_ICONS = {
  housing: '🏠', food: '🍔', transport: '🚗', entertainment: '🎬',
  health: '💊', shopping: '🛍️', education: '📚', other: '💸',
};

function fmt(n) { return (n || 0).toLocaleString('en-US', { maximumFractionDigits: 0 }); }

const CustomTooltip = ({ active, payload }) => {
  if (active && payload?.length) {
    const { name, value } = payload[0];
    return (
      <div className="bg-white border border-gray-200 rounded-xl px-3 py-2 shadow-lg">
        <p className="text-xs font-bold text-gray-800 capitalize">{CAT_ICONS[name]} {name}</p>
        <p className="text-sm font-black text-gray-900">${fmt(value)}</p>
      </div>
    );
  }
  return null;
};

export default function SpendingByCategoryChart({ catData, totalExpenses }) {
  if (!catData || catData.length === 0) return null;

  const sorted = [...catData].sort((a, b) => b.spent - a.spent);

  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden mb-4">
      <div className="px-4 pt-4 pb-2">
        <p className="font-bold text-sm text-gray-800">Spending by Category</p>
        <p className="text-xs text-gray-500 font-medium">This month · ${fmt(totalExpenses)} total</p>
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

      {/* Category breakdown list */}
      <div className="px-4 pb-4 space-y-2.5">
        {sorted.map(({ name, spent, budget }) => {
          const pct = totalExpenses > 0 ? Math.round((spent / totalExpenses) * 100) : 0;
          const budgetPct = budget > 0 ? Math.min(100, Math.round((spent / budget) * 100)) : null;
          const over = budget > 0 && spent > budget;
          const close = budget > 0 && !over && budgetPct >= 80;
          const color = CAT_COLORS[name] || '#94A3B8';

          return (
            <div key={name}>
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
                  <span className="text-xs font-semibold text-gray-800 capitalize">
                    {CAT_ICONS[name]} {name}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {budget > 0 && (
                    <span className={`text-[10px] font-semibold ${over ? 'text-red-500' : close ? 'text-amber-500' : 'text-gray-500'}`}>
                      {over ? '⚠️ ' : ''}{budgetPct}% of ${fmt(budget)} budget
                    </span>
                  )}
                  <span className="text-xs font-bold text-gray-800">${fmt(spent)}</span>
                  <span className="text-[10px] text-gray-400 font-medium w-8 text-right">{pct}%</span>
                </div>
              </div>
              <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: color + '22' }}>
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${pct}%`, backgroundColor: color }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}