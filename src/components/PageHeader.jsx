import { useLocation } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import useGoBack from '@/hooks/useGoBack';

// `icon` and `gradient` are still accepted from callers but no longer
// rendered — the header is now a plain eyebrow + title, matching the
// dashboard and leaving color to the content below it.
export default function PageHeader({ title, subtitle, action, showBack }) {
  const location = useLocation();
  const ROOT_PATHS = ['/', '/finance', '/budget', '/bills', '/coach'];
  const isRoot = ROOT_PATHS.includes(location.pathname);
  const showBackBtn = showBack || !isRoot;
  const goBack = useGoBack('/');

  return (
    // Title and actions share a row once there's width for it; on a phone the
    // actions drop to their own line so the subtitle isn't truncated to
    // "TRACK SPENDING AGAINST …".
    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="flex items-center gap-1.5 min-w-0">
        {showBackBtn && (
          <Button
            variant="ghost"
            size="icon"
            onClick={goBack}
            className="min-h-[44px] min-w-[44px] shrink-0 -ml-2.5"
            aria-label="Go back"
          >
            <ChevronLeft className="w-5 h-5" />
          </Button>
        )}
        <div className="min-w-0">
          {subtitle && (
            <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-1">
              {subtitle}
            </p>
          )}
          <h1 className="text-2xl lg:text-3xl font-black tracking-tight leading-none truncate">{title}</h1>
        </div>
      </div>
      {action && <div className="shrink-0 flex items-center gap-1.5">{action}</div>}
    </div>
  );
}