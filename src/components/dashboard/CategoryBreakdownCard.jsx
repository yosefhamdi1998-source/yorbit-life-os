import { Link } from 'react-router-dom';
import { ChevronRight, PieChart } from 'lucide-react';

// Kept in sync with SpendingSummary.jsx's palette/icons so a category looks
// the same wherever it shows up in the app.
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

export default function CategoryBreakdownCard({ transactions, thisMonth }) {
  const monthExpenses = transactions.filter(t => t.type === 'expense' && t.date?.startsWith(thisMonth));
  const total = monthExpenses.reduce((s, t) => s + (t.amount || 0), 0);

  const byCat = {};
  for (const t of monthExpenses) {
    byCat[t.category || 'other'] = (byCat[t.category || 'other'] || 0) + (t.amount || 0);
  }
  const rows = Object.entries(byCat)
    .map(([cat, spent]) => ({ cat, spent }))
    .sort((a, b) => b.spent - a.spent)
    .slice(0, 5);

  if (rows.length === 0) return null;

  return (
    <div className="sky-card rounded-2xl overflow-hidden">
      <div className="flex items-center justify-between px-4 pt-4 pb-3">
        <div className="flex items-center gap-2">
          <PieChart className="w-4 h-4 text-muted-foreground" />
          <p className="font-bold text-sm">Where it went</p>
        </div>
        <Link to="/spending-summary" className="text-xs text-primary font-semibold flex items-center gap-0.5">
          Full breakdown <ChevronRight className="w-3 h-3" />
        </Link>
      </div>
      <div className="px-4 pb-4 space-y-3">
        {rows.map(({ cat, spent }) => {
          const pct = total > 0 ? Math.round((spent / total) * 100) : 0;
          return (
            <div key={cat}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-semibold capitalize text-foreground flex items-center gap-1.5">
                  <span>{CAT_ICONS[cat] || '💸'}</span> {cat}
                </span>
                <span className="text-sm font-bold text-foreground tabular-nums">
                  ${fmt(spent)} <span className="text-muted-foreground font-medium">· {pct}%</span>
                </span>
              </div>
              <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${pct}%`, background: CAT_COLORS[cat] || '#94A3B8' }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
