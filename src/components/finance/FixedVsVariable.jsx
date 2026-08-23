import { useMemo } from 'react';
import { RefreshCw, TrendingDown, BarChart2, Lock, Shuffle } from 'lucide-react';

// A transaction is "recurring" if a similar title appears in 2+ different months
function detectRecurring(transactions) {
  const expenseOnly = transactions.filter(t => t.type === 'expense');

  // Group by normalized title
  const byTitle = {};
  expenseOnly.forEach(tx => {
    const key = tx.title.trim().toLowerCase();
    if (!byTitle[key]) byTitle[key] = [];
    byTitle[key].push(tx);
  });

  const recurring = [];
  const variable = [];

  Object.entries(byTitle).forEach(([key, txs]) => {
    const months = new Set(txs.map(tx => tx.date?.slice(0, 7)));
    if (months.size >= 2) {
      // Use average amount across occurrences
      const avg = txs.reduce((s, t) => s + (t.amount || 0), 0) / txs.length;
      recurring.push({ key, title: txs[0].title, avg, months: months.size, txs, category: txs[0].category });
    } else {
      txs.forEach(tx => variable.push(tx));
    }
  });

  // Sort recurring by avg amount descending
  recurring.sort((a, b) => b.avg - a.avg);

  return { recurring, variable };
}

const CAT_COLORS = { housing: '#7C3AED', food: '#F97316', transport: '#3B82F6', entertainment: '#EC4899', health: '#EF4444', shopping: '#F59E0B', education: '#10B981', savings: '#059669', salary: '#22C55E', freelance: '#6366F1', investment: '#0EA5E9', other: '#94A3B8' };

export default function FixedVsVariable({ transactions }) {
  const thisMonth = new Date().toISOString().slice(0, 7);

  const { recurring, variable } = useMemo(() => detectRecurring(transactions), [transactions]);

  const fixedTotal = recurring.reduce((s, r) => s + r.avg, 0);
  const variableTotal = variable
    .filter(t => t.date?.startsWith(thisMonth))
    .reduce((s, t) => s + (t.amount || 0), 0);
  const totalExpenses = fixedTotal + variableTotal;
  const fixedPct = totalExpenses > 0 ? Math.round((fixedTotal / totalExpenses) * 100) : 0;

  const thisMonthVariable = variable.filter(t => t.date?.startsWith(thisMonth));

  return (
    <div className="space-y-5">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-violet-500/10 border border-violet-500/20 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <Lock className="w-4 h-4 text-violet-500" />
            <span className="text-xs font-semibold text-violet-600 uppercase tracking-wider">Fixed Costs</span>
          </div>
          <p className="text-2xl font-black">${fixedTotal.toFixed(0)}</p>
          <p className="text-xs text-muted-foreground mt-1">{recurring.length} recurring · {fixedPct}% of spend</p>
        </div>
        <div className="bg-orange-500/10 border border-orange-500/20 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <Shuffle className="w-4 h-4 text-orange-500" />
            <span className="text-xs font-semibold text-orange-600 uppercase tracking-wider">Variable</span>
          </div>
          <p className="text-2xl font-black">${variableTotal.toFixed(0)}</p>
          <p className="text-xs text-muted-foreground mt-1">{thisMonthVariable.length} this month · {100 - fixedPct}% of spend</p>
        </div>
      </div>

      {/* Fixed/Variable bar */}
      {totalExpenses > 0 && (
        <div>
          <div className="flex justify-between text-xs text-muted-foreground mb-1.5">
            <span>Fixed {fixedPct}%</span>
            <span>Variable {100 - fixedPct}%</span>
          </div>
          <div className="h-3 bg-secondary rounded-full overflow-hidden flex">
            <div className="h-full bg-violet-500 transition-all" style={{ width: `${fixedPct}%` }} />
            <div className="h-full bg-orange-400 flex-1" />
          </div>
        </div>
      )}

      {/* Recurring Transactions */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <RefreshCw className="w-3.5 h-3.5 text-violet-500" />
          <h3 className="text-sm font-semibold">Recurring (Fixed Costs)</h3>
          <span className="ml-auto text-xs bg-violet-500/10 text-violet-600 px-2 py-0.5 rounded-full font-medium">{recurring.length} detected</span>
        </div>

        {recurring.length === 0 ? (
          <p className="text-sm text-muted-foreground py-3">No recurring transactions detected yet. Add transactions across multiple months to identify patterns.</p>
        ) : (
          <div className="space-y-2">
            {recurring.map(r => (
              <div key={r.key} className="bg-card border border-border rounded-xl p-3 flex items-center gap-3">
                <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: (CAT_COLORS[r.category] || '#94A3B8') + '22' }}>
                  <RefreshCw className="w-3.5 h-3.5" style={{ color: CAT_COLORS[r.category] || '#94A3B8' }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate capitalize">{r.title}</p>
                  <p className="text-xs text-muted-foreground capitalize">{r.category} · seen {r.months} months</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-bold text-violet-600">~${r.avg.toFixed(0)}/mo</p>
                  <span className="text-[10px] bg-violet-500/10 text-violet-600 px-1.5 py-0.5 rounded-full">recurring</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Variable Expenses this month */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <BarChart2 className="w-3.5 h-3.5 text-orange-500" />
          <h3 className="text-sm font-semibold">Variable Expenses This Month</h3>
          <span className="ml-auto text-xs bg-orange-500/10 text-orange-600 px-2 py-0.5 rounded-full font-medium">{thisMonthVariable.length} items</span>
        </div>

        {thisMonthVariable.length === 0 ? (
          <p className="text-sm text-muted-foreground py-3">No one-off expenses this month.</p>
        ) : (
          <div className="space-y-2">
            {thisMonthVariable.sort((a, b) => (b.amount || 0) - (a.amount || 0)).map(tx => (
              <div key={tx.id} className="bg-card border border-border rounded-xl p-3 flex items-center gap-3">
                <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: (CAT_COLORS[tx.category] || '#94A3B8') + '22' }}>
                  <TrendingDown className="w-3.5 h-3.5" style={{ color: CAT_COLORS[tx.category] || '#94A3B8' }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{tx.title}</p>
                  <p className="text-xs text-muted-foreground capitalize">{tx.category} · {tx.date}</p>
                </div>
                <span className="text-sm font-bold text-orange-500 shrink-0">-${tx.amount?.toFixed(0)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}