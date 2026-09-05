import { useEffect, useRef, useState } from 'react';

// Animates a numeric value toward its target whenever it changes.
// Pass `format` for custom display (e.g. "1.2k" abbreviation) instead of
// prefix/suffix/decimals - it receives the in-flight animated number.
//
// THE BUG THIS REPLACES
//
// The previous version tracked where the animation started in a ref that was
// assigned in exactly one place: the final frame.
//
//     if (t < 1) rafRef.current = requestAnimationFrame(tick);
//     else fromRef.current = to;          // only on completion
//     ...
//     return () => cancelAnimationFrame(rafRef.current);   // cancels mid-flight
//
// So any interruption - a new target arriving mid-animation, a re-render, or
// React's development double-invoke of effects - cancelled the frame and left
// fromRef holding a value the display had already moved away from. The next
// change then animated from a stale origin, and when the guard
// `if (from === to) return` matched that stale origin the animation never ran
// at all: `display` kept whatever number it happened to be showing, forever.
//
// Observed on the Dashboard: switching the hero between 2025, 2026 and the
// last 30 days left INCOME reading $1,328 and EXPENSES $2,301 in all three,
// while the savings rate beside them correctly showed 22%, -138% and -73%.
// The arithmetic was never wrong - the savings rate proved the right figures
// existed - the component simply refused to display them. The minus sign is
// rendered by the caller, outside this component, which is why the sign
// tracked the period while the digits did not.
//
// A number component that silently shows a stale figure is worse than one
// that does not animate, and in a finance app it is worse than most bugs
// that crash, because nothing looks wrong.
//
// THE RULE NOW: `display` converges on `target`, always. Animation is a
// presentation detail that may be interrupted, skipped or disabled; the
// displayed value landing on the real one is not optional.
export default function AnimatedNumber({ value, prefix = '', suffix = '', decimals = 0, format }) {
  const target = Number.isFinite(value) ? value : 0;
  const [display, setDisplay] = useState(target);
  // Tracks what is CURRENTLY on screen, updated every frame - not just at
  // completion. This is the fix: the next animation always starts from the
  // number the user is actually looking at.
  const displayRef = useRef(target);
  const rafRef = useRef(null);

  useEffect(() => {
    const from = displayRef.current;
    const to = target;

    const settle = () => {
      displayRef.current = to;
      setDisplay(to);
    };

    if (from === to) {
      // Already correct, but make the ref authoritative in case a previous
      // run was interrupted between frames.
      displayRef.current = to;
      return undefined;
    }

    // Someone who has asked the OS to reduce motion gets the number, not a
    // count-up. Also the safe path if matchMedia is unavailable.
    const prefersReduced =
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced) {
      settle();
      return undefined;
    }

    const duration = 600;
    const start = performance.now();
    cancelAnimationFrame(rafRef.current);

    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
      const current = from + (to - from) * eased;
      displayRef.current = current;
      setDisplay(current);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        settle();
      }
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafRef.current);
      // Land on the target rather than freezing part-way. An interrupted
      // animation must never leave a number that is neither where it started
      // nor where it belongs - that is precisely how $1,328 outlived the
      // period it was computed for.
      displayRef.current = to;
    };
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
