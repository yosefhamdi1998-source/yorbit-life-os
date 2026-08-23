import { RefreshCw } from 'lucide-react';

/**
 * Renders the visual indicator for pull-to-refresh.
 * Always rendered (height: 0 when inactive) so CSS transition can animate the collapse.
 */
export default function PullToRefreshIndicator({ pullY, refreshing, threshold = 70 }) {
  const isActive = pullY > 0 || refreshing;
  const height = isActive ? (refreshing ? threshold : pullY) : 0;
  const opacity = refreshing ? 1 : Math.min(1, pullY / (threshold * 0.4));
  const rotation = refreshing ? 0 : (pullY / threshold) * 360;

  return (
    <div
      className="flex items-center justify-center overflow-hidden"
      style={{
        height,
        minHeight: 0,
        // Animate collapse; no transition while user is actively pulling
        transition: pullY === 0 ? 'height 0.3s ease' : 'none',
      }}
    >
      <RefreshCw
        className={`w-5 h-5 text-primary ${refreshing ? 'animate-spin' : ''}`}
        style={{
          opacity,
          transform: refreshing ? undefined : `rotate(${rotation}deg)`,
        }}
      />
    </div>
  );
}