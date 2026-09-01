import AnimatedNumber from '@/components/AnimatedNumber';

// The app's key-figure treatment: a large numeral over a small uppercase
// label. Used for every top-of-page metric row so figures read the same
// everywhere. `tone` colors the numeral (income green, expenses red, etc).
const TONES = {
  default: 'text-foreground',
  positive: 'text-emerald-600 dark:text-emerald-400',
  negative: 'text-red-600 dark:text-red-400',
  warning: 'text-amber-600 dark:text-amber-400',
  primary: 'text-primary',
};

// Tinted badge + faint card wash per tone, so a row of stats reads its
// color story at a glance instead of every tile looking identical.
const BADGE_BG = {
  default: 'bg-secondary text-muted-foreground',
  positive: 'bg-emerald-500/12 text-emerald-600 dark:text-emerald-400',
  negative: 'bg-red-500/12 text-red-600 dark:text-red-400',
  warning: 'bg-amber-500/12 text-amber-600 dark:text-amber-400',
  primary: 'bg-primary/12 text-primary',
};

export default function StatCard({
  label,
  value,
  prefix = '',
  suffix = '',
  decimals = 0,
  tone = 'default',
  sub,
  animate = true,
  icon: Icon,
}) {
  const numeric = typeof value === 'number';
  const negative = numeric && value < 0;

  return (
    <div className="sky-card rounded-2xl px-4 py-4 lg:px-5 lg:py-5">
      {Icon && (
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-3 ${BADGE_BG[tone] || BADGE_BG.default}`}>
          <Icon className="w-4 h-4" strokeWidth={2.25} />
        </div>
      )}
      <p className={`font-numeric text-2xl lg:text-[28px] font-black tracking-tight leading-none mb-1.5 tabular-nums ${TONES[tone] || TONES.default}`}>
        {numeric ? (
          <>
            {negative && '−'}
            {animate
              ? <AnimatedNumber prefix={prefix} value={Math.abs(value)} suffix={suffix} decimals={decimals} />
              : `${prefix}${Math.abs(value).toLocaleString('en-US', { maximumFractionDigits: decimals })}${suffix}`}
          </>
        ) : (
          value
        )}
      </p>
      <p className="text-[10px] lg:text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      {sub && <p className="text-[11px] text-muted-foreground mt-1 truncate">{sub}</p>}
    </div>
  );
}
