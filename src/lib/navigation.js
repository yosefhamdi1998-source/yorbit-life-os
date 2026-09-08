import { Home, Wallet, TrendingUp, CalendarDays, Brain } from 'lucide-react';

export const PRIMARY_NAV = [
  { path: '/', label: 'Home', icon: Home, routes: ['/'] },
  { path: '/finance', label: 'Money', icon: Wallet, routes: ['/finance', '/bank-sync', '/csv-import', '/spending-summary', '/totals', '/payments-sent'] },
  { path: '/investments', label: 'Invest', icon: TrendingUp, routes: ['/investments'] },
  { path: '/budget', label: 'Plan', icon: CalendarDays, routes: ['/budget', '/bills', '/recurring', '/goals'] },
  { path: '/coach', label: 'Coach', icon: Brain, routes: ['/coach', '/save-more'] },
];
export function navIsActive(item, pathname) {
  return item.routes.some(path => pathname === path || (path !== '/' && pathname.startsWith(`${path}/`)));
}
export const PLAN_NAV = [
  { path: '/budget', label: 'Budget' },
  { path: '/bills', label: 'Bills' },
  { path: '/recurring', label: 'Recurring' },
  { path: '/goals', label: 'Goals' },
];
