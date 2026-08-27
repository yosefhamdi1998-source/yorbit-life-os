import PageHeader from '@/components/PageHeader';
import { Mail, MessageCircle, FileText, Shield, ExternalLink } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function Support() {
  return (
    <div className="w-full max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-6 pb-12">
      <PageHeader
        title="Support"
        subtitle="We're here to help"
        icon={MessageCircle}
        gradient="gradient-primary"
      />

      <div className="space-y-4">

        {/* Contact */}
        <div className="bg-card border border-border rounded-2xl p-6">
          <h2 className="font-bold text-sm mb-1">Contact Us</h2>
          <p className="text-sm text-muted-foreground mb-4 leading-relaxed">
            Have a question, bug report, or feedback? We respond within 24–48 hours.
          </p>
          <a
            href="mailto:support@moneyglow.app"
            className="flex items-center gap-3 bg-primary/10 hover:bg-primary/15 transition-colors rounded-xl px-4 py-3"
          >
            <Mail className="w-5 h-5 text-primary shrink-0" />
            <div>
              <p className="text-sm font-semibold text-foreground">support@moneyglow.app</p>
              <p className="text-xs text-muted-foreground">Email support · 24–48h response</p>
            </div>
            <ExternalLink className="w-4 h-4 text-muted-foreground ml-auto shrink-0" />
          </a>
        </div>

        {/* FAQ */}
        <div className="bg-card border border-border rounded-2xl p-6">
          <h2 className="font-bold text-sm mb-4">Frequently Asked Questions</h2>
          <div className="space-y-4">
            {[
              {
                q: 'How do I cancel my subscription?',
                a: 'On iPhone/iPad: go to Settings → Apple ID → Subscriptions → MoneyGlow and tap Cancel. On the web: go to Settings → Manage Subscription.'
              },
              {
                q: 'How do I restore my Pro subscription?',
                a: 'Go to Settings inside the app and tap "Restore Purchases". This will restore any active subscription linked to your Apple ID or account.'
              },
              {
                q: 'How do I delete my account?',
                a: 'Go to Settings → scroll to the bottom → Danger Zone → Delete Account & Data. This permanently removes all your data and account.'
              },
              {
                q: 'Is my financial data safe?',
                a: 'Yes. Your data is encrypted in transit and at rest. We never sell your data or share it with advertisers. See our Privacy Policy for full details.'
              },
              {
                q: 'What does MoneyGlow Pro include?',
                a: 'Pro includes unlimited budgets, unlimited savings goals, the AI Money Coach, daily AI financial briefings, and priority support.'
              },
              {
                q: 'Can I export my data?',
                a: 'Yes. Go to Settings → Export My Data to download all your transactions, budgets, goals, bills, and net worth entries as a JSON file.'
              },
            ].map(({ q, a }) => (
              <div key={q} className="border-b border-border/50 last:border-0 pb-4 last:pb-0">
                <p className="text-sm font-semibold text-foreground mb-1">{q}</p>
                <p className="text-sm text-muted-foreground leading-relaxed">{a}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Legal links */}
        <div className="bg-card border border-border rounded-2xl p-5 flex gap-4">
          <Link to="/privacy-policy" className="flex items-center gap-2 text-sm text-primary font-medium hover:underline">
            <Shield className="w-4 h-4" /> Privacy Policy
          </Link>
          <Link to="/terms-of-use" className="flex items-center gap-2 text-sm text-primary font-medium hover:underline">
            <FileText className="w-4 h-4" /> Terms of Use
          </Link>
        </div>

        <p className="text-center text-xs text-muted-foreground">MoneyGlow · support@moneyglow.app</p>
      </div>
    </div>
  );
}