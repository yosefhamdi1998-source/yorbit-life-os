import { ArrowRight, AlertTriangle, Lightbulb, CheckCircle, Target, TrendingUp } from 'lucide-react';

export default function NextBestAction({ transactions, budgets, goals, thisMonth, monthIncome, monthExpenses, onNavigate }) {
  const monthTx = transactions.filter(t => t.date?.startsWith(thisMonth));
  const EXPENSE_CATS = ['housing', 'food', 'transport', 'entertainment', 'health', 'shopping', 'education', 'other'];

  const getAction = () => {
    if (transactions.length === 0) {
      return {
        type: 'onboard',
        icon: Lightbulb,
        text: 'Add your first transaction to start tracking your finances.',
        cta: 'Add Transaction',
      };
    }

    const thisMonthBudgets = budgets.filter(b => b.month === thisMonth);
    if (thisMonthBudgets.length === 0) {
      return {
        type: 'budget',
        icon: Lightbulb,
        text: 'Create a budget to see where your money is going each month.',
        cta: 'Set Budget',
      };
    }

    const overBudget = EXPENSE_CATS.find(cat => {
      const b = thisMonthBudgets.find(b => b.category === cat);
      if (!b) return false;
      const spent = monthTx.filter(t => t.type === 'expense' && t.category === cat).reduce((s, t) => s + (t.amount || 0), 0);
      return spent > b.monthly_limit;
    });
    if (overBudget) {
      return {
        type: 'warning',
        icon: AlertTriangle,
        text: `${overBudget.charAt(0).toUpperCase() + overBudget.slice(1)} is over budget this month. Try reducing spending in this category.`,
        cta: 'Review Budget',
      };
    }

    const closeCat = EXPENSE_CATS.find(cat => {
      const b = thisMonthBudgets.find(b => b.category === cat);
      if (!b) return false;
      const spent = monthTx.filter(t => t.type === 'expense' && t.category === cat).reduce((s, t) => s + (t.amount || 0), 0);
      return spent / b.monthly_limit >= 0.8 && spent <= b.monthly_limit;
    });
    if (closeCat) {
      return {
        type: 'warning',
        icon: AlertTriangle,
        text: `${closeCat.charAt(0).toUpperCase() + closeCat.slice(1)} is close to its monthly limit. Slow down a bit this week.`,
        cta: 'View Budget',
      };
    }

    if (goals.length === 0) {
      return {
        type: 'goal',
        icon: Target,
        text: 'Pick one financial goal to work toward this month.',
        cta: 'Add Goal',
      };
    }

    const savingsRate = monthIncome > 0 ? Math.round(((monthIncome - monthExpenses) / monthIncome) * 100) : 0;
    if (savingsRate >= 20) {
      return {
        type: 'good',
        icon: CheckCircle,
        text: `You're saving ${savingsRate}% this month — great discipline. Keep it up.`,
        cta: null,
      };
    }

    return {
      type: 'neutral',
      icon: TrendingUp,
      text: 'Review your recent transactions and look for one recurring expense to reduce.',
      cta: 'View Transactions',
    };
  };

  const action = getAction();
  const Icon = action.icon;

  const styles = {
    onboard: { bg: 'bg-blue-50 border-blue-200', iconBg: 'bg-blue-100', iconColor: 'text-blue-600', cta: 'text-blue-700 bg-blue-100 hover:bg-blue-200' },
    budget:  { bg: 'bg-amber-50 border-amber-200', iconBg: 'bg-amber-100', iconColor: 'text-amber-600', cta: 'text-amber-700 bg-amber-100 hover:bg-amber-200' },
    warning: { bg: 'bg-orange-50 border-orange-200', iconBg: 'bg-orange-100', iconColor: 'text-orange-600', cta: 'text-orange-700 bg-orange-100 hover:bg-orange-200' },
    goal:    { bg: 'bg-purple-50 border-purple-200', iconBg: 'bg-purple-100', iconColor: 'text-purple-600', cta: 'text-purple-700 bg-purple-100 hover:bg-purple-200' },
    good:    { bg: 'bg-emerald-50 border-emerald-200', iconBg: 'bg-emerald-100', iconColor: 'text-emerald-600', cta: 'text-emerald-700 bg-emerald-100 hover:bg-emerald-200' },
    neutral: { bg: 'bg-slate-50 border-slate-200', iconBg: 'bg-slate-100', iconColor: 'text-slate-600', cta: 'text-slate-700 bg-slate-100 hover:bg-slate-200' },
  };

  const s = styles[action.type] || styles.neutral;

  return (
    <div className={`${s.bg} border rounded-2xl p-4 flex items-center gap-3`}>
      <div className={`w-9 h-9 ${s.iconBg} rounded-xl flex items-center justify-center shrink-0`}>
        <Icon className={`w-4.5 h-4.5 ${s.iconColor}`} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-0.5">Today's Action</p>
        <p className="text-sm font-medium text-foreground leading-snug">{action.text}</p>
      </div>
      {action.cta && (
        <button
          onClick={() => onNavigate && onNavigate(action.type)}
          className={`shrink-0 text-xs font-semibold px-3 py-2 rounded-xl flex items-center gap-1 transition-colors ${s.cta}`}
        >
          {action.cta} <ArrowRight className="w-3 h-3" />
        </button>
      )}
    </div>
  );
}