import { AlertTriangle, X } from 'lucide-react';
import { useState } from 'react';

export default function BudgetWarnings({ monthTx, budgets, thisMonth }) {
  const [dismissed, setDismissed] = useState([]);

  const warnings = budgets
    .filter(b => b.month === thisMonth)
    .map(b => {
      const spent = monthTx
        .filter(t => t.type === 'expense' && t.category === b.category)
        .reduce((s, t) => s + (t.amount || 0), 0);
      const pct = b.monthly_limit > 0 ? (spent / b.monthly_limit) * 100 : 0;
      return { category: b.category, spent, limit: b.monthly_limit, pct };
    })
    .filter(w => w.pct >= 90 && !dismissed.includes(w.category))
    .sort((a, b) => b.pct - a.pct);

  if (warnings.length === 0) return null;

  return (
    <div className="space-y-2 mb-6">
      {warnings.map(w => (
        <div
          key={w.category}
          className={`flex items-start gap-3 px-4 py-3 rounded-2xl border ${
            w.pct >= 100
              ? 'bg-red-500/10 border-red-500/25'
              : 'bg-yellow-500/10 border-yellow-500/25'
          }`}
        >
          <AlertTriangle className={`w-4 h-4 mt-0.5 shrink-0 ${w.pct >= 100 ? 'text-red-500' : 'text-yellow-500'}`} />
          <div className="flex-1 min-w-0">
            <p className={`text-sm font-semibold capitalize ${w.pct >= 100 ? 'text-red-600' : 'text-amber-600'}`}>
              {w.category}: {w.pct >= 100 ? 'Over budget' : 'Close to limit'}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              ${w.spent.toFixed(0)} spent of ${w.limit.toFixed(0)} limit · <span className={`font-semibold ${w.pct >= 100 ? 'text-red-500' : 'text-amber-500'}`}>{Math.round(w.pct)}% used</span>
            </p>
          </div>
          <button onClick={() => setDismissed(d => [...d, w.category])} className="shrink-0 text-muted-foreground hover:text-foreground transition-colors">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}