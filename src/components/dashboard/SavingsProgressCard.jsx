import { PiggyBank } from 'lucide-react';
import AnimatedNumber from '@/components/AnimatedNumber';

function fmt(n) { return (n || 0).toLocaleString('en-US', { maximumFractionDigits: 0 }); }

export default function SavingsProgressCard({ netSaved, prevNetSaved, periodPhrase }) {
  const hasPrev = prevNetSaved !== null && prevNetSaved !== undefined;
  const diff = hasPrev ? netSaved - prevNetSaved : null;

  return (
    <div className="sky-card rounded-2xl p-4 lg:p-5 mb-5 flex items-center gap-4">
      <div className="w-11 h-11 rounded-xl bg-emerald-500/10 flex items-center justify-center shrink-0">
        <PiggyBank className="w-5 h-5 text-emerald-500" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm text-muted-foreground">
          You {netSaved >= 0 ? 'saved' : 'lost'}{' '}
          <span className="font-numeric font-bold text-foreground tabular-nums">
            <AnimatedNumber prefix="$" value={Math.abs(netSaved)} />
          </span>{' '}
          {periodPhrase}
        </p>
        {hasPrev && Math.abs(diff) >= 1 && (
          <p className={`text-xs font-semibold mt-0.5 ${diff >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
            {diff >= 0 ? '+' : '−'}${fmt(Math.abs(diff))} vs. last period
          </p>
        )}
      </div>
    </div>
  );
}
