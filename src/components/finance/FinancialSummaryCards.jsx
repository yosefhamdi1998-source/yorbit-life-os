import { TrendingUp, TrendingDown, Wallet, PiggyBank } from 'lucide-react';

export default function FinancialSummaryCards({ monthIncome, monthExpenses, totalBalance }) {
  const saved = monthIncome - monthExpenses;
  const savingsRate = monthIncome > 0 ? Math.round((saved / monthIncome) * 100) : 0;

  const cards = [
    {
      label: 'Monthly Income',
      value: `$${monthIncome.toLocaleString('en-US', { maximumFractionDigits: 0 })}`,
      icon: TrendingUp,
      color: 'text-emerald-500',
      bg: 'bg-emerald-500/10',
    },
    {
      label: 'Monthly Spending',
      value: `$${monthExpenses.toLocaleString('en-US', { maximumFractionDigits: 0 })}`,
      icon: TrendingDown,
      color: 'text-red-500',
      bg: 'bg-red-500/10',
    },
    {
      label: 'Saved This Month',
      value: `$${Math.max(0, saved).toLocaleString('en-US', { maximumFractionDigits: 0 })}`,
      icon: Wallet,
      color: 'text-blue-500',
      bg: 'bg-blue-500/10',
    },
    {
      label: 'Savings Rate',
      value: `${savingsRate}%`,
      icon: PiggyBank,
      color: savingsRate >= 20 ? 'text-emerald-500' : savingsRate >= 10 ? 'text-yellow-500' : 'text-red-500',
      bg: savingsRate >= 20 ? 'bg-emerald-500/10' : savingsRate >= 10 ? 'bg-yellow-500/10' : 'bg-red-500/10',
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 mb-6">
      {cards.map(({ label, value, icon: Icon, color, bg }) => (
        <div key={label} className="bg-card border border-border rounded-2xl p-4 glow-card">
          <div className={`w-8 h-8 ${bg} rounded-xl flex items-center justify-center mb-3`}>
            <Icon className={`w-4 h-4 ${color}`} />
          </div>
          <p className="text-xl font-black leading-none mb-1">{value}</p>
          <p className="text-xs text-muted-foreground">{label}</p>
        </div>
      ))}
    </div>
  );
}