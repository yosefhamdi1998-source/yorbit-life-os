// Tiny inline trend line for stat rows. Deliberately axis-less and
// label-less: it conveys direction at a glance, the number beside it
// carries the precision.
export default function Sparkline({ values = [], width = 88, height = 28, tone = 'positive' }) {
  if (!values || values.length < 2) return null;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const stepX = width / (values.length - 1);

  const points = values.map((v, i) => {
    const x = i * stepX;
    const y = height - ((v - min) / span) * (height - 3) - 1.5;
    return [x, y];
  });

  const line = points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const area = `${line} L${width},${height} L0,${height} Z`;

  const stroke = tone === 'negative' ? '#DC2626' : tone === 'primary' ? 'hsl(var(--primary))' : '#059669';
  const gradId = `spark-${tone}`;

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true" className="overflow-visible">
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity={0.22} />
          <stop offset="100%" stopColor={stroke} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gradId})`} />
      <path d={line} fill="none" stroke={stroke} strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={points[points.length - 1][0]} cy={points[points.length - 1][1]} r={2.25} fill={stroke} />
    </svg>
  );
}
