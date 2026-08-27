import { useLocation } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import useGoBack from '@/hooks/useGoBack';

export default function PageHeader({ title, subtitle, icon: Icon, gradient, action, showBack }) {
  const location = useLocation();
  const ROOT_PATHS = ['/', '/finance', '/budget', '/bills', '/coach'];
  const isRoot = ROOT_PATHS.includes(location.pathname);
  const showBackBtn = showBack || !isRoot;
  const goBack = useGoBack('/');

  return (
    <div className="flex items-center justify-between mb-5 gap-2">
      <div className="flex items-center gap-2 min-w-0">
        {showBackBtn && (
          <Button
            variant="ghost"
            size="icon"
            onClick={goBack}
            className="min-h-[44px] min-w-[44px] shrink-0"
            aria-label="Go back"
          >
            <ChevronLeft className="w-5 h-5" />
          </Button>
        )}
        {Icon && (
          <div className={`w-12 h-12 rounded-2xl ${gradient} flex items-center justify-center shadow-lg shrink-0`}>
            <Icon className="w-6 h-6 text-white" />
          </div>
        )}
        <div className="min-w-0">
          <h1 className="text-xl font-black tracking-tight leading-tight">{title}</h1>
          {subtitle && <p className="text-muted-foreground text-xs mt-0.5 truncate">{subtitle}</p>}
        </div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}