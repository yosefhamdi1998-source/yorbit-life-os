import PageHeader from '@/components/PageHeader';
import { Shield } from 'lucide-react';

const Section = ({ title, children }) => (
  <div className="mb-6">
    <h2 className="text-base font-bold text-foreground mb-2">{title}</h2>
    <div className="text-sm text-muted-foreground leading-relaxed space-y-2">{children}</div>
  </div>
);

export default function PrivacyPolicy() {
  return (
    <div className="p-6 max-w-xl mx-auto pb-12">
      <PageHeader
        title="Privacy Policy"
        subtitle="Last updated: June 2026"
        icon={Shield}
        gradient="gradient-primary"
      />

      <div className="bg-card border border-border rounded-2xl p-6 space-y-1">

        <Section title="Overview">
          <p>Yoglow is a personal finance tracking app. We take your privacy seriously. This policy explains what data we collect, how we use it, and your rights.</p>
        </Section>

        <Section title="What We Collect">
          <p><strong className="text-foreground">Financial data you enter:</strong> Transactions, budgets, savings goals, and bills that you manually add or import.</p>
          <p><strong className="text-foreground">CSV import data:</strong> When you import a CSV file, we parse and store the transaction records locally in your account. We do not retain the original file.</p>
          <p><strong className="text-foreground">Account metadata:</strong> Your email address and display name, provided at registration. No financial credentials are collected.</p>
          <p><strong className="text-foreground">Bank connection metadata (future feature):</strong> If bank sync is enabled, connection metadata such as institution name and account type may be stored. Your bank login credentials are never stored by Yoglow — they are handled directly by a third-party provider (e.g. Plaid or Teller).</p>
        </Section>

        <Section title="How We Use Your Data">
          <p>Your data is used only to power your own Yoglow experience:</p>
          <ul className="list-disc list-inside space-y-1 pl-2">
            <li>To display your transactions, budgets, and goals</li>
            <li>To generate your AI Money Briefing and coaching suggestions</li>
            <li>To show budget health and spending trends</li>
            <li>To let you export or delete your data at any time</li>
          </ul>
          <p>We do not sell, share, or use your financial data for advertising.</p>
        </Section>

        <Section title="AI Insights">
          <p>Yoglow uses an AI model to generate personalized financial summaries and coaching tips. Your anonymized spending categories and amounts are sent to the AI model to produce these insights. No personally identifiable information is included in AI requests.</p>
          <p>AI-generated content is informational only. It is not financial, legal, tax, or investment advice.</p>
        </Section>

        <Section title="Data Storage & Security">
          <p>Your data is stored securely using industry-standard practices. We use encrypted connections (HTTPS) for all data in transit.</p>
          <p>We do not store your bank account passwords or login credentials at any time.</p>
        </Section>

        <Section title="Your Rights">
          <ul className="list-disc list-inside space-y-1 pl-2">
            <li><strong className="text-foreground">Export:</strong> You can download all your financial data from Settings → Export My Data at any time.</li>
            <li><strong className="text-foreground">Delete data:</strong> You can delete all your financial records from Settings → Danger Zone.</li>
            <li><strong className="text-foreground">Delete account:</strong> You can delete your account and all associated data from Settings → Danger Zone.</li>
          </ul>
        </Section>

        <Section title="Third-Party Services">
          <p>Yoglow may use third-party services for authentication and infrastructure. These services have their own privacy policies. We do not share your financial data with them beyond what is required to operate the app.</p>
        </Section>

        <Section title="Children">
          <p>Yoglow is not intended for users under 13 years of age. We do not knowingly collect data from children.</p>
        </Section>

        <Section title="Changes to This Policy">
          <p>We may update this policy from time to time. We will notify you of significant changes via the app or email.</p>
        </Section>

        <Section title="Contact">
          <p>Questions about this policy? Email us at <a href="mailto:support@yoglow.app" className="text-primary hover:underline">support@yoglow.app</a> or visit <a href="https://yoglow.app/support" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">yoglow.app/support</a>.</p>
        </Section>

      </div>
    </div>
  );
}