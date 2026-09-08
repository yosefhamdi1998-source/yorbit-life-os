import { getSimpleMode } from '@/lib/simpleMode';
import { NavLink } from 'react-router-dom';
import { PLAN_NAV } from '@/lib/navigation';

export default function PlanNavigation() {
  const items = getSimpleMode() ? PLAN_NAV.filter(item => ['/budget', '/bills'].includes(item.path)) : PLAN_NAV;
  return <nav aria-label="Plan sections" className="grid grid-flow-col auto-cols-fr gap-1 rounded-xl bg-secondary p-1 mt-4 mb-2">
    {items.map(item => <NavLink key={item.path} to={item.path} className={({ isActive }) => `min-h-[44px] flex items-center justify-center rounded-lg text-sm font-semibold ${isActive ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'}`}>{item.label}</NavLink>)}
  </nav>;
}
