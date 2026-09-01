import { useEffect, useRef, useState } from 'react';

// Animates a numeric value counting up/down to its target whenever it changes.
// Pass `format` for custom display (e.g. "1.2k" abbreviation) instead of
// prefix/suffix/decimals - it receives the in-flight animated number.
export default function AnimatedNumber({ value, prefix = '', suffix = '', decimals = 0, format }) {
  const target = Number.isFinite(value) ? value : 0;
  const [display, setDisplay] = useState(target);
  const fromRef = useRef(target);
  const rafRef = useRef(null);

  useEffect(() => {
    const from = fromRef.current;
    const to = target;
    if (from === to) return;
    const duration = 600;
    const start = performance.now();

    cancelAnimationFrame(rafRef.current);
    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
      setDisplay(from + (to - from) * eased);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        fromRef.current = to;
      }
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [target]);

  if (format) return <span className="font-numeric">{format(display)}</span>;

  return (
    <span className="font-numeric">
      {prefix}
      {display.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}
      {suffix}
    </span>
  );
}
