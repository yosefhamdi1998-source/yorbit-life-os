import { CheckCircle2, XCircle, Clock, Layers, ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import PageHeader from '@/components/PageHeader';

const SECTIONS = [
  {
    title: '🚨 Blocking — must resolve before TestFlight',
    items: [
      { label: 'App builds and launches on device without crash', status: 'pending' },
      { label: 'Real iPhone QA pass completed (all core flows)', status: 'pending' },
      { label: 'App icon exported as 1024×1024 PNG (no alpha, no rounded corners)', status: 'pending' },
      { label: 'Support method confirmed (email or URL)', status: 'pending' },
      { label: 'launchChecklist: false set before distributing to testers', status: 'pending' },
      { label: 'No dev-only routes visible to TestFlight users', status: 'pending' },
    ]
  },
  {
    title: '🚨 Blocking — must resolve before App Store public launch',
    items: [
      { label: 'Public Privacy Policy URL (not an in-app route — App Store Connect requires a live web URL)', status: 'pending' },
      { label: 'Public Terms of Use URL (recommended by Apple)', status: 'pending' },
      { label: 'Support URL or support email (required in App Store Connect)', status: 'pending' },
      { label: 'App Store screenshots — 6.7" and 6.1" iPhone (minimum 3, up to 10)', status: 'pending' },
      { label: 'App Store description (4000 chars max)', status: 'done' },
      { label: 'App Store keywords (100 chars max)', status: 'done' },
      { label: 'Privacy nutrition label filled in App Store Connect', status: 'pending' },
      { label: 'Delete account flow tested end-to-end on device', status: 'pending' },
      { label: 'Bank sync disclosure — must not claim live/connected state (currently correct)', status: 'done' },
    ]
  },
  {
    title: '✅ Code & Product — ready',
    items: [
      { label: 'No fake / demo data in production', status: 'done' },
      { label: 'All public routes load without errors', status: 'done' },
      { label: 'New user sees onboarding (not empty dashboard)', status: 'done' },
      { label: 'Delete account requires typing DELETE', status: 'done' },
      { label: 'Delete data confirmed before wiping', status: 'done' },
      { label: 'Account deletion falls back to support message', status: 'done' },
      { label: 'Export data downloads real JSON', status: 'done' },
      { label: 'CSV import is the real working import method', status: 'done' },
      { label: 'Bank sync shows "Setup required" — not "Connected"', status: 'done' },
      { label: 'Connect Bank button is disabled (not pretending to work)', status: 'done' },
      { label: 'AI Briefing cached per day (no repeat charges)', status: 'done' },
      { label: 'AI Coach cached per day (no repeat charges)', status: 'done' },
      { label: 'AI shows "not enough data" if < 3 transactions', status: 'done' },
      { label: 'Bills: add, mark paid, delete work', status: 'done' },
      { label: 'Budget: dedup, validates > 0, saves', status: 'done' },
      { label: 'Dashboard updates after data changes', status: 'done' },
      { label: 'Empty states on all main pages', status: 'done' },
      { label: 'Bottom nav does not overlap content', status: 'done' },
      { label: 'Mobile safe-area padding on all screens', status: 'done' },
      { label: 'Privacy Policy page live in app and linked in Settings', status: 'done' },
      { label: 'Terms of Use page live in app and linked in Settings', status: 'done' },
      { label: 'No MoneyOS / LifeOS / prototype wording in public UI', status: 'done' },
      { label: 'No hardcoded user names or "Good morning, Al" visible', status: 'done' },
      { label: 'Support contact shows "Support coming soon" (not unmonitored email)', status: 'done' },
    ]
  },
  {
    title: '🔮 Future — not required for launch',
    items: [
      { label: 'Push notifications for overdue bills', status: 'future' },
      { label: 'Live bank sync (Plaid/Teller integration)', status: 'future' },
      { label: 'Recurring transaction detection', status: 'future' },
      { label: 'iPad / tablet layout', status: 'future' },
    ]
  },
];

const STATUS = {
  done: { icon: CheckCircle2, color: 'text-emerald-500', bg: 'bg-emerald-50 border-emerald-100', label: 'Done' },
  pending: { icon: Clock, color: 'text-amber-500', bg: 'bg-amber-50 border-amber-100', label: 'Pending' },
  future: { icon: Clock, color: 'text-muted-foreground', bg: 'bg-secondary border-border', label: 'Future' },
  blocked: { icon: XCircle, color: 'text-red-500', bg: 'bg-red-50 border-red-100', label: 'Blocked' },
};

export default function LaunchChecklist() {
  const allItems = SECTIONS.flatMap(s => s.items);
  const done = allItems.filter(i => i.status === 'done').length;
  const blocking = [...SECTIONS[0].items, ...SECTIONS[1].items].filter(i => i.status === 'pending').length;
  const total = allItems.filter(i => i.status !== 'future').length;
  const pct = Math.round((done / total) * 100);

  return (
    <div className="p-4 max-w-lg mx-auto pb-8">
      <PageHeader
        title="Launch Checklist"
        subtitle="Pre-launch readiness tracker"
        icon={Layers}
        gradient="gradient-habits"
      />

      <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3 mb-4">
        <p className="text-xs font-semibold text-amber-800">Internal tool — not visible to app users.</p>
        <p className="text-xs text-amber-700 mt-1">Set <code className="font-mono bg-amber-100 px-1 rounded">launchChecklist: false</code> in <code className="font-mono bg-amber-100 px-1 rounded">lib/features.js</code> before TestFlight or App Store submission.</p>
      </div>

      {/* Internal tool links */}
      <div className="grid grid-cols-2 gap-3 mb-5">
        {[
          { label: 'TestFlight Checklist', path: '/testflight-checklist' },
          { label: 'App Store Copy', path: '/app-store-copy' },
        ].map(({ label, path }) => (
          <Link key={path} to={path} className="bg-card border border-border rounded-xl px-4 py-3 flex items-center justify-between active:opacity-70 transition-opacity">
            <span className="text-sm font-semibold text-foreground">{label}</span>
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          </Link>
        ))}
      </div>

      {/* Progress */}
      <div className="bg-card border border-border rounded-2xl p-4 mb-5">
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm font-bold">Launch Readiness</p>
          <span className="text-sm font-black text-primary">{pct}%</span>
        </div>
        <div className="h-3 bg-secondary rounded-full overflow-hidden mb-2">
          <div
            className={`h-full rounded-full transition-all ${pct === 100 ? 'bg-emerald-500' : pct >= 60 ? 'bg-amber-500' : 'bg-red-500'}`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="flex gap-4 text-xs text-muted-foreground">
          <span><span className="font-bold text-foreground">{done}</span> of {total} done</span>
          {blocking > 0 && <span className="text-red-500 font-semibold">⚠ {blocking} blocking item{blocking !== 1 ? 's' : ''}</span>}
        </div>
      </div>

      <div className="space-y-5">
        {SECTIONS.map(({ title, items }) => (
          <div key={title}>
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2 px-1">{title}</p>
            <div className="space-y-1.5">
              {items.map(({ label, status }, i) => {
                const { icon: Icon, color, bg } = STATUS[status] || STATUS.pending;
                return (
                  <div key={i} className={`flex items-center gap-3 rounded-xl px-4 py-3 border ${bg}`}>
                    <Icon className={`w-4 h-4 shrink-0 ${color}`} />
                    <p className="text-sm font-medium text-foreground flex-1">{label}</p>
                    <span className={`text-[10px] font-bold uppercase tracking-wide shrink-0 ${color}`}>{STATUS[status]?.label}</span>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}