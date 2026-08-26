import PageHeader from '@/components/PageHeader';
import { FileText } from 'lucide-react';

const Section = ({ title, children }) => (
  <div className="mb-6">
    <h2 className="text-base font-bold text-foreground mb-2">{title}</h2>
    <div className="text-sm text-muted-foreground leading-relaxed space-y-2">{children}</div>
  </div>
);

export default function TermsOfUse() {
  return (
    <div className="p-6 max-w-xl mx-auto pb-12">
      <PageHeader
        title="Terms of Use"
        subtitle="Last updated: June 2026"
        icon={FileText}
        gradient="gradient-primary"
      />

      <div className="bg-card border border-border rounded-2xl p-6 space-y-1">

        <Section title="Acceptance">
          <p>By using MoneyGlow, you agree to these Terms of Use. If you do not agree, please do not use the app.</p>
        </Section>

        <Section title="What MoneyGlow Is">
          <p>MoneyGlow is a personal finance tracking application designed to help individuals track income, expenses, budgets, bills, and savings goals.</p>
          <p>MoneyGlow is a <strong className="text-foreground">tracking and organizational tool only</strong>. It is not a bank, financial institution, or regulated financial service.</p>
        </Section>

        <Section title="Not Financial Advice">
          <p><strong className="text-foreground">MoneyGlow does not provide financial, legal, tax, or investment advice.</strong></p>
          <p>All AI-generated insights, coaching suggestions, money briefings, and spending summaries are for <strong className="text-foreground">informational and organizational purposes only</strong>. They do not constitute professional advice of any kind.</p>
          <p>Always consult a qualified financial professional before making financial decisions.</p>
        </Section>

        <Section title="No Guarantee of Outcomes">
          <p>MoneyGlow makes no guarantee that using the app will result in savings, improved financial health, or any specific financial outcome. Results depend entirely on your own actions and circumstances.</p>
        </Section>

        <Section title="Your Responsibility">
          <p>You are solely responsible for the accuracy of the data you enter into MoneyGlow. The app displays information based on what you provide. Inaccurate inputs will produce inaccurate insights.</p>
        </Section>

        <Section title="Account & Data">
          <p>You are responsible for maintaining the security of your account credentials. Do not share your account with others.</p>
          <p>You may delete your data or account at any time from the Settings page. Once deleted, data cannot be recovered.</p>
        </Section>

        <Section title="Acceptable Use">
          <p>You agree not to misuse MoneyGlow, including but not limited to: attempting to access other users' data, reverse engineering the app, or using it for any unlawful purpose.</p>
        </Section>

        <Section title="AI Features">
          <p>AI-powered features in MoneyGlow are experimental and for guidance purposes only. They may not always be accurate or complete. Do not rely on them as a substitute for professional financial guidance.</p>
        </Section>

        <Section title="Changes to the App or Terms">
          <p>We may update these Terms or change app features at any time. Continued use of MoneyGlow after changes are posted constitutes acceptance of the updated Terms.</p>
        </Section>

        <Section title="Limitation of Liability">
          <p>MoneyGlow is provided "as is" without warranty of any kind. To the fullest extent permitted by law, we are not liable for any indirect, incidental, or consequential damages arising from your use of the app.</p>
        </Section>

        <Section title="Contact">
          <p>Questions about these Terms? Email us at <a href="mailto:support@moneyglow.app" className="text-primary hover:underline">support@moneyglow.app</a> or visit <a href="https://moneyglow.app/support" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">moneyglow.app/support</a>.</p>
        </Section>

      </div>
    </div>
  );
}