import { HeartPulse } from 'lucide-react';

const ringColor = (score) =>
  score >= 80 ? '#10B981' : score >= 60 ? '#0EA5E9' : score >= 40 ? '#F59E0B' : '#EF4444';

// `bare` drops the card wrapper/heading so this can sit inside a shared
// card with WhatsNextCard instead of stacking as its own full section —
// two cards for "your score" and "what to do about it" read as more
// clutter than one card covering both.
export default function FinancialHealthScore({ score, label, explanation, bare = false }) {
  const color = ringColor(score);
  // Simple ring via conic-gradient — no chart library needed for one number.
  const ringStyle = {
    background: `conic-gradient(${color} ${score * 3.6}deg, hsl(var(--secondary)) 0deg)`,
  };

  const content = (
    <div className="flex items-center gap-4">
      <div className={`relative shrink-0 rounded-full p-1.5 ${bare ? 'w-16 h-16' : 'w-20 h-20'}`} style={ringStyle}>
        <div className="w-full h-full rounded-full bg-card flex items-center justify-center">
          <span className={`font-numeric font-black tabular-nums ${bare ? 'text-xl' : 'text-2xl'}`} style={{ color }}>{score}</span>
        </div>
      </div>
      <div className="min-w-0">
        <p className={`font-bold text-foreground mb-1 ${bare ? 'text-sm' : 'text-base'}`}>{label}</p>
        <p className="text-sm text-muted-foreground leading-snug">{explanation}</p>
      </div>
    </div>
  );

  if (bare) return content;

  return (
    <div className="sky-card rounded-2xl p-4 lg:p-5 mb-5">
      <div className="flex items-center gap-2 mb-3">
        <HeartPulse className="w-4 h-4 text-muted-foreground" />
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Financial Health Score</p>
      </div>
      {content}
    </div>
  );
}
