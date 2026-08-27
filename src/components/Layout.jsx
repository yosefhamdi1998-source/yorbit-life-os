import { Outlet, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useState, useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  LayoutDashboard, DollarSign, Target, Brain, PiggyBank,
  Sparkles, Sun, Moon, Settings, Receipt, Upload, Landmark, BarChart2, FileText, Bell,
  StickyNote, CheckSquare, Flame, BookOpen, HeartPulse, Grid2x2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FEATURES } from '@/lib/features';
import QuickAddFAB from '@/components/QuickAddFAB';
import ErrorBoundary from '@/components/ErrorBoundary';
import { recordRoute } from '@/hooks/useGoBack';

const bottomNavItems = [
  { path: '/', icon: LayoutDashboard, label: 'Home' },
  { path: '/finance', icon: DollarSign, label: 'Money' },
  { path: '/budget', icon: BarChart2, label: 'Budget' },
  { path: '/bills', icon: Receipt, label: 'Bills' },
  { path: '/coach', icon: Brain, label: 'Coach' },
];

export const sidebarItems = [
  { path: '/', icon: LayoutDashboard, label: 'Home' },
  { path: '/finance', icon: DollarSign, label: 'Transactions' },
  { path: '/budget', icon: PiggyBank, label: 'Budget' },
  { path: '/bills', icon: Receipt, label: 'Bills' },
  { path: '/goals', icon: Target, label: 'Goals' },
  { path: '/notes', icon: StickyNote, label: 'Notes' },
  { path: '/tasks', icon: CheckSquare, label: 'Tasks' },
  { path: '/habits', icon: Flame, label: 'Habits' },
  { path: '/journal', icon: BookOpen, label: 'Journal' },
  { path: '/health-log', icon: HeartPulse, label: 'Health Log' },
  { path: '/notifications', icon: Bell, label: 'Notifications' },
  { path: '/coach', icon: Brain, label: 'AI Coach' },
  ...(FEATURES.bankSync ? [{ path: '/bank-sync', icon: Landmark, label: 'Bank Sync' }] : []),
  { path: '/csv-import', icon: Upload, label: 'Import CSV' },
  { path: '/forms', icon: FileText, label: 'Forms' },
];

const pageVariants = {
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -6 },
};

// Track the last visited path per tab so tapping a tab re-navigates to where you left off
const TAB_PATHS = ['/', '/finance', '/budget', '/bills', '/coach'];

export default function Layout() {
  // Light is the product's default look; dark is opt-in via the toggle.
  // (Previously it followed the OS, so anyone on a dark system never saw
  // the intended design.)
  const [dark, setDark] = useState(() => localStorage.getItem('theme') === 'dark');
  const location = useLocation();
  const navigate = useNavigate();
  // Remember last path visited under each tab root
  const tabHistory = useRef(Object.fromEntries(TAB_PATHS.map(p => [p, p])));

  useEffect(() => {
    const root = TAB_PATHS.find(p => p === '/' ? location.pathname === '/' : location.pathname.startsWith(p));
    if (root) tabHistory.current[root] = location.pathname;
    recordRoute(location.pathname);
  }, [location.pathname]);

  const handleTabPress = (path) => {
    const lastVisited = tabHistory.current[path] || path;
    const isOnTab = path === '/' ? location.pathname === '/' : location.pathname.startsWith(path);
    if (isOnTab) {
      // Already on this tab — navigate to last visited sub-path instead of resetting to root
      navigate(lastVisited, { replace: true });
    } else {
      navigate(lastVisited);
    }
  };

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    localStorage.setItem('theme', dark ? 'dark' : 'light');
    document.body.style.background = dark
      ? 'hsl(220, 25%, 8%)'
      : 'linear-gradient(160deg, #EAF6FF 0%, #F7FBFF 50%, #EEF2FF 100%)';
  }, [dark]);

  return (
    <div className="min-h-screen flex overflow-x-hidden w-full">

      {/* ── Desktop sidebar ─────────────────────────────────────────── */}
      <aside className="hidden lg:flex flex-col w-56 border-r border-border/50 fixed inset-y-0 left-0 z-40 bg-card">
        {/* Logo */}
        <div className="flex items-center gap-2.5 px-5 h-16 border-b border-border/50 shrink-0">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: 'linear-gradient(135deg, #60A5FA 0%, #7C3AED 100%)' }}>
            <Sparkles className="w-3.5 h-3.5 text-white" />
          </div>
          <span className="font-black text-[15px] tracking-tight text-foreground">MoneyGlow</span>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
          {sidebarItems.map(({ path, icon: Icon, label }) => (
            <NavLink
              key={label}
              to={path}
              end={path === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all min-h-[40px] ${
                  isActive
                    ? 'bg-primary text-white font-semibold shadow-sm'
                    : 'text-muted-foreground hover:text-foreground hover:bg-secondary/80 font-medium'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <Icon className="w-4 h-4 shrink-0" strokeWidth={isActive ? 2.5 : 1.8} />
                  {label}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Footer */}
        <div className="px-2 py-3 border-t border-border/50 space-y-0.5">
          <button
            onClick={() => setDark(!dark)}
            className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-secondary/80 transition-all w-full min-h-[40px]"
          >
            {dark ? <Sun className="w-4 h-4 shrink-0" /> : <Moon className="w-4 h-4 shrink-0" />}
            {dark ? 'Light Mode' : 'Dark Mode'}
          </button>
          <NavLink
            to="/settings"
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all min-h-[40px] w-full ${
                isActive ? 'bg-primary text-white font-semibold' : 'text-muted-foreground hover:text-foreground hover:bg-secondary/80'
              }`
            }
          >
            <Settings className="w-4 h-4 shrink-0" /> Settings
          </NavLink>
        </div>
      </aside>

      {/* ── Mobile top bar ───────────────────────────────────────────── */}
      <div
        className="fixed top-0 left-0 right-0 z-50 lg:hidden"
        style={{
          paddingTop: 'env(safe-area-inset-top)',
          background: dark ? 'rgba(20, 24, 38, 0.96)' : 'rgba(255,255,255,0.95)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderBottom: '1px solid rgba(0,0,0,0.07)'
        }}
      >
        <div className="flex items-center justify-between px-4 h-14">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #60A5FA 0%, #7C3AED 100%)' }}>
              <Sparkles className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="font-black text-[15px] tracking-tight text-foreground">MoneyGlow</span>
          </div>
          <div className="flex items-center gap-0.5">
            <Button variant="ghost" size="icon" onClick={() => navigate('/more')} className="h-9 w-9 rounded-full" aria-label="More">
              <Grid2x2 className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => setDark(!dark)} className="h-9 w-9 rounded-full" aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}>
              {dark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </Button>
            <Button variant="ghost" size="icon" onClick={() => navigate('/notifications')} className="h-9 w-9 rounded-full" aria-label="Notifications">
              <Bell className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => navigate('/settings')} className="h-9 w-9 rounded-full" aria-label="Settings">
              <Settings className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* ── Bottom tab bar ───────────────────────────────────────────── */}
      <div
        className="lg:hidden fixed bottom-0 left-0 right-0 z-40"
        style={{
          paddingBottom: 'env(safe-area-inset-bottom)',
          background: dark ? 'rgba(20, 24, 38, 0.97)' : 'rgba(255,255,255,0.97)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderTop: '1px solid rgba(0,0,0,0.07)',
        }}
      >
        <div className="flex items-center justify-around px-2 pt-1.5 pb-1">
          {bottomNavItems.map(({ path, icon: TabIcon, label }) => {
            const isActive = path === '/' ? location.pathname === '/' : location.pathname.startsWith(path);
            return (
              <button
                key={label}
                onClick={() => handleTabPress(path)}
                className="flex flex-col items-center justify-center gap-0.5 flex-1 py-1 min-h-[50px]"
                style={{ WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation' }}
              >
                <div className={`flex items-center justify-center w-8 h-8 rounded-xl transition-all ${isActive ? 'bg-primary/10' : ''}`}>
                  <TabIcon
                    className={`w-[22px] h-[22px] transition-colors ${isActive ? 'text-primary' : 'text-muted-foreground'}`}
                    strokeWidth={isActive ? 2.5 : 1.8}
                  />
                </div>
                <span className={`text-[10px] transition-colors leading-none ${isActive ? 'text-primary font-semibold' : 'text-muted-foreground font-medium'}`}>{label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Quick Add FAB ─────────────────────────────────────────────── */}
      <QuickAddFAB />

      {/* ── Main content ─────────────────────────────────────────────── */}
      <main
        className="flex-1 lg:ml-56 overflow-x-hidden overflow-y-auto w-full lg:w-auto"
        style={{ paddingTop: 'calc(env(safe-area-inset-top) + 56px)', minHeight: '100dvh' }}
      >
        {/* Reset top padding on desktop since there's no top bar */}
        <style>{`@media (min-width: 1024px) { main { padding-top: 0 !important; } }`}</style>
        <AnimatePresence mode="wait">
          <motion.div
            key={location.pathname}
            variants={pageVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className="pb-32 lg:pb-8"
          >
            {/* Single shared content container: every page inherits the same
                width and edge padding, so navigating never resizes content.
                The cap grows with the viewport so big screens fill out
                instead of stranding the content in a narrow column. */}
            <div className="w-full max-w-3xl lg:max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
              <ErrorBoundary key={location.pathname}>
                <Outlet />
              </ErrorBoundary>
            </div>
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}