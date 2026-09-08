import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import PageHeader from '@/components/PageHeader';
const GROUPS = [
  { title: 'Your money', items: [['/bank-sync','Connected accounts','Manage connections and refresh your accounts'],['/csv-import','Import a statement','Bring your existing history into Yorbit'],['/spending-summary','Reports','Explore spending over time'],['/payments-sent','Payments & transfers','Review money moved between people and accounts']] },
  { title: 'Supporting tools', items: [['/notes','Notes','Keep track of money conversations and reminders'],['/forms','Custom records','Your existing forms and records'],['/notifications','Notifications','Updates that need your attention']] },
  { title: 'Your account', items: [['/settings','Settings','Appearance, privacy, subscription, and account'],['/support','Help & support','Get help with Yorbit']] },
];
export default function More() {
  return <div className="py-4"><PageHeader title="Menu" subtitle="Accounts, tools, and settings" showBack />
    {GROUPS.map(group => <section key={group.title} className="mb-6"><h2 className="text-sm font-semibold mb-2">{group.title}</h2><div className="sky-card rounded-2xl divide-y divide-border">{group.items.map(([path,label,description]) => <Link key={path} to={path} className="flex items-center gap-3 p-4 hover:bg-secondary/50"><div className="min-w-0 flex-1"><p className="font-semibold text-sm">{label}</p><p className="text-sm text-muted-foreground mt-1">{description}</p></div><ChevronRight className="w-4 h-4 shrink-0" /></Link>)}</div></section>)}
  </div>;
}
