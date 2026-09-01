import { HeartPulse } from 'lucide-react';

const ringColor = (score) =>
  score >= 80 ? '#10B981' : score >= 60 ? '#0EA5E9' : score >= 40 ? '#F59E0B' : '#EF4444';

export default function FinancialHealthScore({ score, label, explanation }) {
  const color = ringColor(score);
  // Simple ring via conic-gradient — no chart library needed for one number.
  const ringStyle = {
    background: `conic-gradient(${color} ${score * 3.6}deg, hsl(var(--secondary)) 0deg)`,
  };

  return (
    <div className="sky-card rounded-2xl p-4 lg:p-5 mb-5">
      <div className="flex items-center gap-2 mb-3">
        <HeartPulse className="w-4 h-4 text-muted-foreground" />
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Financial Health Score</p>
      </div>
      <div className="flex items-center gap-4">
        <div className="relative w-20 h-20 shrink-0 rounded-full p-1.5" style={ringStyle}>
          <div className="w-full h-full rounded-full bg-card flex items-center justify-center">
            <span className="font-numeric text-2xl font-black tabular-nums" style={{ color }}>{score}</span>
          </div>
        </div>
        <div className="min-w-0">
          <p className="text-base font-bold text-foreground mb-1">{label}</p>
          <p className="text-sm text-muted-foreground leading-snug">{explanation}</p>
        </div>
      </div>
    </div>
  );
}
