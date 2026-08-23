import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { Link } from 'react-router-dom';

const COLORS = ['#2563EB', '#7C3AED', '#10B981', '#F59E0B', '#EF4444', '#06B6D4', '#EC4899', '#6366F1'];
const CAT_ICONS = { housing: '🏠', food: '🍔', transport: '🚗', entertainment: '🎬', health: '💊', shopping: '🛍️', education: '📚', other: '💸' };

function fmt(n) { return (n || 0).toLocaleString('en-US', { maximumFractionDigits: 0 }); }

const CustomTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  const { name, value } = payload[0];
  return (
    <div className="sky-card rounded-xl px-3 py-2 text-sm shadow-lg">
      <p className="font-semibold text-foreground capitalize">{CAT_ICONS[name] || '💸'} {name}</p>
      <p className="font-bold text-primary">${fmt(value)}</p>
    </div>
  );
};

export default function SpendingDonutChart({ transactions, thisMonth }) {
  const EXPENSE_CATS = ['housing', 'food', 'transport', 'entertainment', 'health', 'shopping', 'education', 'other'];

  const monthExpenses = transactions.filter(t => t.date?.startsWith(thisMonth) && t.type === 'expense');
  const total = monthExpenses.reduce((s, t) => s + (t.amount || 0), 0);

  const data = EXPENSE_CATS
    .map(cat => ({
      name: cat,
      value: monthExpenses.filter(t => t.category === cat).reduce((s, t) => s + (t.amount || 0), 0),
    }))
    .filter(d => d.value > 0)
    .sort((a, b) => b.value - a.value);

  if (data.length === 0) return null;

  return (
    <div className="sky-card rounded-2xl overflow-hidden">
      <div className="flex items-center justify-between px-4 pt-4 pb-1">
        <p className="font-bold text-sm">Spending Breakdown</p>
        <Link to="/finance" className="text-xs text-primary font-semibold">Details →</Link>
      </div>

      <div className="flex flex-col sm:flex-row items-center gap-2 px-4 pb-4 pt-2">
        {/* Donut */}
        <div className="w-full sm:w-48 shrink-0" style={{ height: 160 }}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius="58%"
                outerRadius="80%"
                paddingAngle={2}
                dataKey="value"
                strokeWidth={0}
              >
                {data.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Legend */}
        <div className="flex-1 w-full grid grid-cols-2 gap-x-4 gap-y-2.5">
          {data.slice(0, 6).map((item, i) => {
            const pct = total > 0 ? Math.round((item.value / total) * 100) : 0;
            return (
              <div key={item.name} className="flex items-center gap-2 min-w-0">
                <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: COLORS[i % COLORS.length] }} />
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-foreground capitalize truncate">{item.name}</p>
                  <p className="text-[10px] text-muted-foreground">${fmt(item.value)} · {pct}%</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}