import { useState } from 'react';
import PageHeader from '@/components/PageHeader';
import { CheckSquare, Square, ChevronDown, ChevronRight } from 'lucide-react';

const CHECKLIST = [
  {
    category: 'Build Stability',
    items: [
      'App launches without blank screen',
      'Login page loads correctly',
      'Logout works and redirects to login',
      'No console errors on launch',
      'No broken routes (404 pages)',
      'No MoneyOS or LifeOS references visible',
      'Loading spinner shows on data fetch',
      'Dark mode toggles correctly',
    ]
  },
  {
    category: 'Core Flows — Transactions',
    items: [
      'Add income transaction',
      'Add expense transaction',
      'View transaction list',
      'Search transactions',
      'Filter by income / expense / this month',
      'Delete transaction (confirm dialog)',
    ]
  },
  {
    category: 'Core Flows — Budget',
    items: [
      'Create a budget category limit',
      'Budget health shows correct %',
      'Over-budget shows red indicator',
      'Near-budget shows amber indicator',
    ]
  },
  {
    category: 'Core Flows — Goals',
    items: [
      'Create a savings goal',
      'Goal progress bar shows correctly',
      'Add milestone to goal',
      'Complete a milestone',
      'Mark goal as completed',
    ]
  },
  {
    category: 'Core Flows — Bills',
    items: [
      'Add a bill',
      'Mark bill as paid',
      'Overdue bill shows red indicator',
      'Delete a bill',
    ]
  },
  {
    category: 'Core Flows — CSV Import',
    items: [
      'Upload CSV file',
      'Map columns correctly',
      'Preview imported rows',
      'Complete import',
      'Imported transactions appear in Money tab',
    ]
  },
  {
    category: 'Core Flows — AI Features',
    items: [
      'AI Money Briefing generates (with 3+ transactions)',
      'AI Coach generates (with 3+ transactions)',
      'Refresh/regenerate works',
      'Empty state shown if insufficient data',
    ]
  },
  {
    category: 'Core Flows — Data Management',
    items: [
      'Export data downloads JSON file',
      'Delete data requires confirmation',
      'Delete account requires typing DELETE',
      'Delete account fallback message shows if API unavailable',
    ]
  },
  {
    category: 'Legal & Settings',
    items: [
      'Privacy Policy page opens',
      'Terms of Use page opens',
      'Support email visible in Settings',
      'Connected Accounts shows setup-required notice',
      'Bank Sync shows "Connect Bank — Coming Soon" (disabled button)',
    ]
  },
  {
    category: 'Mobile / Device',
    items: [
      'Safe area insets respected (notch / home bar)',
      'Bottom nav visible and tappable',
      'All buttons min 44px tap target',
      'Keyboard does not cover input fields',
      'Forms scroll correctly with keyboard open',
      'Small screen (iPhone SE) layout not broken',
      'Large screen (iPhone Pro Max) layout not broken',
    ]
  },
  {
    category: 'App Store Assets',
    items: [
      'App icon 1024×1024 PNG created',
      'App name confirmed: MoneyGlow',
      'Subtitle confirmed: Budget & AI Money Coach',
      'App description drafted',
      'Keywords list drafted',
      'Screenshot plan drafted (7 screens)',
      'Privacy Policy URL ready',
      'Terms of Use URL ready',
      'Support email confirmed',
      'Age rating submitted (4+)',
    ]
  },
];

function ChecklistSection({ category, items }) {
  const [open, setOpen] = useState(true);
  const [checked, setChecked] = useState({});

  const done = Object.values(checked).filter(Boolean).length;
  const total = items.length;

  const toggle = (item) => setChecked(prev => ({ ...prev, [item]: !prev[item] }));

  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden mb-3">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-4 text-left"
      >
        <div className="flex items-center gap-3">
          {open ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
          <span className="font-bold text-sm text-foreground">{category}</span>
        </div>
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${done === total ? 'bg-emerald-100 text-emerald-700' : 'bg-secondary text-muted-foreground'}`}>
          {done}/{total}
        </span>
      </button>
      {open && (
        <div className="px-5 pb-4 space-y-1 border-t border-border/60 pt-3">
          {items.map(item => (
            <button
              key={item}
              onClick={() => toggle(item)}
              className="w-full flex items-center gap-3 py-2 text-left active:opacity-70 transition-opacity"
            >
              {checked[item]
                ? <CheckSquare className="w-4 h-4 text-emerald-500 shrink-0" />
                : <Square className="w-4 h-4 text-muted-foreground shrink-0" />}
              <span className={`text-sm ${checked[item] ? 'line-through text-muted-foreground' : 'text-foreground'}`}>{item}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function TestFlightChecklist() {
  const totalItems = CHECKLIST.reduce((s, c) => s + c.items.length, 0);

  return (
    <div className="py-4 pb-12">
      <PageHeader
        title="TestFlight Checklist"
        subtitle={`${totalItems} items to verify before submission`}
        icon={CheckSquare}
        gradient="gradient-primary"
      />

      <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-5">
        <p className="text-xs font-semibold text-amber-800">Internal tool — not visible to app users.</p>
        <p className="text-xs text-amber-700 mt-1">Work through this checklist on a real device before submitting to TestFlight or the App Store.</p>
      </div>

      {CHECKLIST.map(section => (
        <ChecklistSection key={section.category} category={section.category} items={section.items} />
      ))}
    </div>
  );
}