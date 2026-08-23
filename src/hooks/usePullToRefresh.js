import { useState, useRef, useEffect, useCallback } from 'react';

const THRESHOLD = 70;

/**
 * Attaches native touch listeners to the window to implement pull-to-refresh.
 * Only activates when window.scrollY is at 0 (page scrolled to top).
 */
export function usePullToRefresh(onRefresh, enabled = true) {
  const [pullY, setPullY] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startYRef = useRef(null);
  const pullYRef = useRef(0);
  const refreshingRef = useRef(false);

  const doRefresh = useCallback(async () => {
    if (refreshingRef.current) return;
    refreshingRef.current = true;
    setRefreshing(true);
    setPullY(THRESHOLD);
    await onRefresh();
    refreshingRef.current = false;
    setRefreshing(false);
    pullYRef.current = 0;
    setPullY(0);
  }, [onRefresh]);

  useEffect(() => {
    if (!enabled) return;

    const onTouchStart = (e) => {
      if (window.scrollY > 5 || refreshingRef.current) return;
      startYRef.current = e.touches[0].clientY;
    };

    const onTouchMove = (e) => {
      if (startYRef.current === null) return;
      const delta = e.touches[0].clientY - startYRef.current;
      if (delta > 0 && window.scrollY <= 0) {
        const py = Math.min(delta * 0.4, THRESHOLD);
        pullYRef.current = py;
        setPullY(py);
        if (py > 8) e.preventDefault(); // prevent browser native pull-to-refresh
      } else if (delta <= 0) {
        startYRef.current = null;
        pullYRef.current = 0;
        setPullY(0);
      }
    };

    const onTouchEnd = () => {
      if (startYRef.current === null) return;
      startYRef.current = null;
      if (pullYRef.current >= THRESHOLD * 0.85) {
        doRefresh();
      } else {
        pullYRef.current = 0;
        setPullY(0);
      }
    };

    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: false });
    window.addEventListener('touchend', onTouchEnd, { passive: true });

    return () => {
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
    };
  }, [enabled, doRefresh]);

  return { pullY, refreshing, threshold: THRESHOLD };
}