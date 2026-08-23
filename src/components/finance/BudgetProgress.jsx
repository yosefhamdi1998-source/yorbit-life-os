import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';

const EXPENSE_CATS = ['housing', 'food', 'transport', 'entertainment', 'health', 'shopping', 'education', 'other'];

export default function BudgetProgress({ monthTx, budgets, thisMonth }) {
  const catData = EXPENSE_CATS.map(cat => ({
    name: cat,
    spent: monthTx.filter(t => t.type === 'expense' && t.category === cat).reduce((s, t) => s + (t.amount || 0), 0),
    budget: budgets.find(b => b.category === cat && b.month === thisMonth)?.monthly_limit || 0,
  })).filter(d => d.spent > 0 || d.budget > 0);

  if (catData.length === 0) {
    return (
      <div className="bg-card border border-dashed border-border rounded-2xl p-6 text-center mb-4">
        <p className="text-sm font-medium mb-1">No budget data yet</p>
        <p className="text-xs text-muted-foreground mb-3">Create a budget to start tracking your progress.</p>
        <Link to="/finance">
          <Button size="sm" className="gap-1"><Plus className="w-3.5 h-3.5" /> Create Budget</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-2 mb-4">
      {catData.map(({ name, spent, budget }) => {
        const pct = budget > 0 ? Math.min((spent / budget) * 100, 100) : 0;
        const over = budget > 0 && spent > budget;
        return (
          <div key={name} className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground capitalize w-20 shrink-0">{name}</span>
            <div className="flex-1 h-1.5 bg-secondary rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${over ? 'bg-red-500' : pct > 75 ? 'bg-yellow-500' : 'bg-emerald-500'}`}
                style={{ width: `${budget > 0 ? pct : 0}%` }}
              />
            </div>
            <span className={`text-xs font-medium w-16 text-right shrink-0 ${over ? 'text-red-500' : 'text-muted-foreground'}`}>
              ${spent.toFixed(0)}{budget > 0 ? `/${budget}` : ''}
            </span>
          </div>
        );
      })}
    </div>
  );
}