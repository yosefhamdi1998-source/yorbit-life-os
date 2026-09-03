import { NavLink } from 'react-router-dom';
import { Grid2x2, Settings } from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import { getVisibleSidebarItems } from '@/components/Layout';

// Everything already reachable from the bottom tab bar on mobile — no need to
// duplicate it here.
const BOTTOM_TAB_PATHS = new Set(['/', '/finance', '/budget', '/bills', '/coach']);

export default function More() {
  const items = getVisibleSidebarItems().filter(i => !BOTTOM_TAB_PATHS.has(i.path));

  return (
    <div className="py-4">
      <PageHeader title="More" subtitle="Everything else in Yorbit" icon={Grid2x2} gradient="gradient-primary" showBack />
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
        {items.map(({ path, icon: Icon, label }) => (
          <NavLink
            key={path}
            to={path}
            className="flex flex-col items-center justify-center gap-2 sky-card rounded-2xl py-6 px-3 text-center transition-transform active:scale-95"
          >
            <div className="w-11 h-11 rounded-xl bg-secondary flex items-center justify-center">
              <Icon className="w-5 h-5 text-foreground" />
            </div>
            <span className="text-sm font-semibold">{label}</span>
          </NavLink>
        ))}
        <NavLink
          to="/settings"
          className="flex flex-col items-center justify-center gap-2 sky-card rounded-2xl py-6 px-3 text-center transition-transform active:scale-95"
        >
          <div className="w-11 h-11 rounded-xl bg-secondary flex items-center justify-center">
            <Settings className="w-5 h-5 text-foreground" />
          </div>
          <span className="text-sm font-semibold">Settings</span>
        </NavLink>
      </div>
    </div>
  );
}
