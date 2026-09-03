import { Outlet, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useState, useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  LayoutDashboard, DollarSign, Target, Brain, PiggyBank,
  Sparkles, Sun, Moon, Settings, Receipt, Upload, Landmark, BarChart2, FileText, Bell,
  StickyNote, CheckSquare, Flame, BookOpen, HeartPulse, Grid2x2, Repeat, BarChart3, Send, TrendingUp
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FEATURES } from '@/lib/features';
import QuickAddFAB from '@/components/QuickAddFAB';
import ErrorBoundary from '@/components/ErrorBoundary';
import { recordRoute } from '@/hooks/useGoBack';
import { getBackgroundTheme, applyBackgroundTheme } from '@/lib/backgroundThemes';
import { getLargeText, applyTextSize } from '@/lib/textSize';
import { getSimpleMode } from '@/lib/simpleMode';

const bottomNavItems = [
  { path: '/', icon: LayoutDashboard, label: 'Home' },
  { path: '/finance', icon: DollarSign, label: 'Money' },
  // Right next to Money, per explicit request — this is the tab bar he's
  // actually looking at on his phone, so this is what "next to Money" means.
  { path: '/investments', icon: TrendingUp, label: 'Invest' },
  { path: '/budget', icon: BarChart2, label: 'Budget' },
  { path: '/bills', icon: Receipt, label: 'Bills' },
  { path: '/coach', icon: Brain, label: 'Coach' },
];

export const sidebarItems = [
  { path: '/', icon: LayoutDashboard, label: 'Home' },
  // Was near the bottom of this list AND gated `advanced` — buried twice
  // over for something used constantly, not a power-user extra. Right
  // after Home now, and visible in Simple Mode too, same reasoning as
  // Upload Statement just below it.
  ...(FEATURES.bankSync ? [{ path: '/bank-sync', icon: Landmark, label: 'Bank Sync' }] : []),
  { path: '/finance', icon: DollarSign, label: 'Transactions' },
  // Right next to Money/Transactions, matching the bottom tab bar — "next
  // to money, just investments" was explicit.
  { path: '/investments', icon: TrendingUp, label: 'Investments' },
  { path: '/budget', icon: PiggyBank, label: 'Budget' },
  { path: '/bills', icon: Receipt, label: 'Bills' },
  { path: '/save-more', icon: Sparkles, label: 'Save More', advanced: true },
  { path: '/payments-sent', icon: Send, label: 'Payments Sent', advanced: true },
  { path: '/goals', icon: Target, label: 'Goals' },
  { path: '/recurring', icon: Repeat, label: 'Recurring', advanced: true },
  { path: '/totals', icon: BarChart3, label: 'Totals', advanced: true },
  { path: '/notifications', icon: Bell, label: 'Notifications' },
  { path: '/coach', icon: Brain, label: 'AI Coach' },
  // Not gated `advanced` — someone in Simple Mode is exactly who most needs
  // an obvious way to get their transactions in without touching Supabase
  // or GitHub, so hiding this behind the power-user filter defeated its
  // own purpose. Also reachable straight from the gold "+" FAB now.
  { path: '/csv-import', icon: Upload, label: 'Upload Statement' },
  { path: '/forms', icon: FileText, label: 'Forms', advanced: true },
  // Notes/Tasks/Habits/Journal/Health Log are left over from this app's
  // origin as a general life-organizer, before it became a focused money
  // app. Routes/data/code untouched (nothing lost, easy to bring back) -
  // just pulled from navigation so they stop competing for space in a
  // money app's menu.
];

// Simple Mode hides the more niche/power-user pages (marked `advanced`
// above) from both the desktop sidebar and the mobile "More" grid — a
// first-time or younger user sees Home/Money/Budget/Bills/Goals/
// Notifications/Coach and nothing else competing for their attention.
export function getVisibleSidebarItems() {
  return getSimpleMode() ? sidebarItems.filter(i => !i.advanced) : sidebarItems;
}

const pageVariants = {
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -6 },
};

// Track the last visited path per tab so tapping a tab re-navigates to where you left off
const TAB_PATHS = ['/', '/finance', '/investments', '/budget', '/bills', '/coach'];

export default function Layout() {
  // Dark is the product's default look; light is opt-in via the toggle.
  // Anyone who has already picked a side (this device has a 'theme' key in
  // localStorage) keeps their own choice — this only changes what a brand
  // new visitor sees before they've ever touched the toggle.
  const [dark, setDark] = useState(() => {
    const stored = localStorage.getItem('theme');
    return stored ? stored === 'dark' : true;
  });
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
    // Background comes from the `body` rule in index.css keyed off the .dark
    // class above — this used to also set an inline style with the old
    // pale-blue gradient, which (inline always beats stylesheet) silently
    // overrode that CSS on every single page, undoing the flat-background fix.
    // Re-applying the chosen background theme here (not just once on mount)
    // is what keeps it correctly scoped to light mode as dark toggles.
    applyBackgroundTheme(getBackgroundTheme(), dark);
    applyTextSize(getLargeText());
  }, [dark]);

  return (
    <div className="min-h-screen flex overflow-x-hidden w-full">

      {/* ── Desktop sidebar ─────────────────────────────────────────── */}
      <aside className="hidden lg:flex flex-col w-56 border-r border-border/50 fixed inset-y-0 left-0 z-40 bg-card">
        {/* Logo */}
        <div className="flex items-center gap-2.5 px-5 h-16 border-b border-border/50 shrink-0">
          <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0" style={{ background: '#0a0a0a', boxShadow: '0 0 0 1.5px #D4AF37' }}>
            <Sparkles className="w-3.5 h-3.5" style={{ color: '#D4AF37' }} strokeWidth={2.5} />
          </div>
          <span className="font-black text-[15px] tracking-tight text-foreground">Yorbit</span>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
          {getVisibleSidebarItems().map(({ path, icon: Icon, label }) => (
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
            <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0" style={{ background: '#0a0a0a', boxShadow: '0 0 0 1.5px #D4AF37' }}>
              <Sparkles className="w-3.5 h-3.5" style={{ color: '#D4AF37' }} strokeWidth={2.5} />
            </div>
            <span className="font-black text-[15px] tracking-tight text-foreground">Yorbit</span>
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