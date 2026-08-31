import { Link } from 'react-router-dom';
import { ChevronRight, PieChart } from 'lucide-react';
import { CAT_COLORS, CategoryBadge } from '@/lib/categoryVisuals';

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
      <div className="px-4 pb-4 space-y-4">
        {rows.map(({ cat, spent }) => {
          const pct = total > 0 ? Math.round((spent / total) * 100) : 0;
          const color = CAT_COLORS[cat] || '#94A3B8';
          return (
            <div key={cat} className="flex items-center gap-3">
              <CategoryBadge category={cat} size="w-10 h-10" iconSize="w-[18px] h-[18px]" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-bold capitalize text-foreground truncate">{cat}</span>
                  <span className="text-sm font-bold text-foreground tabular-nums shrink-0">${fmt(spent)}</span>
                </div>
                <p className="text-xs text-muted-foreground font-medium mt-0.5">{pct}% of spending</p>
                <div className="h-2 rounded-full overflow-hidden mt-1.5" style={{ backgroundColor: color + '22' }}>
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${pct}%`, background: color }}
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
