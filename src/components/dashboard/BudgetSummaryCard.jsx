import { Link } from 'react-router-dom';
import { AlertTriangle, CheckCircle, Clock, ChevronRight, PiggyBank } from 'lucide-react';

const CAT_ICONS = { housing: '🏠', food: '🍔', transport: '🚗', entertainment: '🎬', health: '💊', shopping: '🛍️', education: '📚', other: '💸' };

function fmt(n) { return (n || 0).toLocaleString('en-US', { maximumFractionDigits: 0 }); }

export default function BudgetSummaryCard({ transactions, budgets, thisMonth }) {
  const EXPENSE_CATS = ['housing', 'food', 'transport', 'entertainment', 'health', 'shopping', 'education', 'other'];

  const monthTx = transactions.filter(t => t.date?.startsWith(thisMonth));

  const rows = EXPENSE_CATS.map(cat => ({
    cat,
    spent: monthTx.filter(t => t.type === 'expense' && t.category === cat).reduce((s, t) => s + (t.amount || 0), 0),
    budget: budgets.find(b => b.category === cat && b.month === thisMonth),
  })).filter(d => d.spent > 0 || d.budget);

  const totalBudget = rows.reduce((s, r) => s + (r.budget?.monthly_limit || 0), 0);
  const totalSpent = rows.reduce((s, r) => s + r.spent, 0);
  const overCount = rows.filter(r => r.budget && r.spent > r.budget.monthly_limit).length;
  const closeCount = rows.filter(r => {
    if (!r.budget || r.spent > r.budget.monthly_limit) return false;
    return (r.spent / r.budget.monthly_limit) >= 0.75;
  }).length;
  const budgetPct = totalBudget > 0 ? Math.min(100, Math.round((totalSpent / totalBudget) * 100)) : 0;
  const remaining = totalBudget - totalSpent;

  if (rows.length === 0) {
    return (
      <div className="sky-card rounded-2xl p-5 text-center border border-dashed border-emerald-200">
        <PiggyBank className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
        <p className="text-sm font-semibold text-foreground mb-1">No budgets set</p>
        <p className="text-xs text-muted-foreground mb-3">Set spending limits to track your progress.</p>
        <Link to="/budget" className="text-xs font-bold text-primary underline underline-offset-2">Set a budget →</Link>
      </div>
    );
  }

  // Alert rows: over limit first, then close, max 3
  const alertRows = [
    ...rows.filter(r => r.budget && r.spent > r.budget.monthly_limit),
    ...rows.filter(r => {
      if (!r.budget || r.spent > r.budget.monthly_limit) return false;
      return (r.spent / r.budget.monthly_limit) >= 0.75;
    }),
  ].slice(0, 3);

  const onTrackRows = rows
    .filter(r => r.budget && r.spent <= r.budget.monthly_limit * 0.74)
    .slice(0, 2);

  const displayRows = [...alertRows, ...onTrackRows].slice(0, 4);

  return (
    <div className="sky-card rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-4 pb-3">
        <p className="font-bold text-base">Monthly Budget</p>
        <Link to="/budget" className="text-xs text-primary font-semibold flex items-center gap-0.5">
          Manage <ChevronRight className="w-3 h-3" />
        </Link>
      </div>

      {/* Top-level summary bar */}
      {totalBudget > 0 && (
        <div className="px-4 pb-3">
          <div className="flex items-end justify-between mb-1.5">
            <div>
              <span className={`text-2xl font-black ${totalSpent > totalBudget ? 'text-red-500' : 'text-foreground'}`}>
                ${fmt(totalSpent)}
              </span>
              <span className="text-sm text-muted-foreground font-medium"> / ${fmt(totalBudget)}</span>
            </div>
            <span className={`text-sm font-bold ${remaining < 0 ? 'text-red-500' : 'text-emerald-500'}`}>
              {remaining < 0 ? `$${fmt(Math.abs(remaining))} over` : `$${fmt(remaining)} left`}
            </span>
          </div>
          <div className="h-2.5 bg-secondary rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${budgetPct > 100 ? 'bg-red-500' : budgetPct >= 80 ? 'bg-amber-500' : 'bg-emerald-500'}`}
              style={{ width: `${budgetPct}%` }}
            />
          </div>
          <div className="flex items-center justify-between mt-1.5">
            <span className="text-xs text-muted-foreground">{budgetPct}% used</span>
            <div className="flex items-center gap-2">
              {overCount > 0 && (
                <span className="text-[10px] font-bold text-red-500 flex items-center gap-0.5">
                  <AlertTriangle className="w-2.5 h-2.5" /> {overCount} over limit
                </span>
              )}
              {closeCount > 0 && overCount === 0 && (
                <span className="text-[10px] font-bold text-amber-500 flex items-center gap-0.5">
                  <Clock className="w-2.5 h-2.5" /> {closeCount} near limit
                </span>
              )}
              {overCount === 0 && closeCount === 0 && (
                <span className="text-[10px] font-bold text-emerald-500 flex items-center gap-0.5">
                  <CheckCircle className="w-2.5 h-2.5" /> All on track
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Category rows */}
      <div className="divide-y divide-border/40">
        {displayRows.map(({ cat, spent, budget }) => {
          const limit = budget?.monthly_limit || 0;
          const rawPct = limit > 0 ? (spent / limit) * 100 : 0;
          const pct = Math.min(100, rawPct);
          const over = limit > 0 && spent > limit;
          const close = limit > 0 && !over && rawPct >= 75;

          return (
            <div key={cat} className="px-4 py-3">
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-sm">{CAT_ICONS[cat]}</span>
                  <span className="text-sm font-semibold capitalize text-foreground">{cat}</span>
                  {over && (
                    <span className="text-[10px] font-bold text-red-500 bg-red-50 px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
                      <AlertTriangle className="w-2.5 h-2.5" /> Over
                    </span>
                  )}
                  {close && (
                    <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
                      <Clock className="w-2.5 h-2.5" /> {Math.round(rawPct)}%
                    </span>
                  )}
                </div>
                <div className="text-right">
                  <span className={`text-sm font-bold ${over ? 'text-red-500' : 'text-foreground'}`}>${fmt(spent)}</span>
                  {limit > 0 && <span className="text-xs text-muted-foreground"> / ${fmt(limit)}</span>}
                </div>
              </div>
              {limit > 0 && (
                <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${over ? 'bg-red-500' : close ? 'bg-amber-500' : 'bg-emerald-500'}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer — show more link if more rows exist */}
      {rows.length > 4 && (
        <div className="px-4 py-3 border-t border-border/50">
          <Link to="/budget" className="flex items-center justify-center gap-1 text-xs text-primary font-semibold">
            View all {rows.length} categories <ChevronRight className="w-3 h-3" />
          </Link>
        </div>
      )}
    </div>
  );
}