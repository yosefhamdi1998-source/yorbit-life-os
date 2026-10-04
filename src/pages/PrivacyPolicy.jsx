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
    <div className="w-full max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-6 pb-12">
      <PageHeader
        title="Privacy Policy"
        subtitle="Last updated: October 2026"
        icon={Shield}
        gradient="gradient-primary"
      />

      <div className="sky-card rounded-2xl p-6 space-y-1">

        <Section title="Overview">
          <p>Yorbit is a personal finance tracking app. We take your privacy seriously. This policy explains what data we collect, how we use it, and your rights.</p>
        </Section>

        <Section title="What We Collect">
          <p><strong className="text-foreground">Your account:</strong> Your email address and a password to sign in. Passwords are handled by our authentication provider; we never see or store them in readable form.</p>
          <p><strong className="text-foreground">Financial data you enter:</strong> Transactions, budgets, savings goals, bills and net worth entries that you add yourself.</p>
          <p><strong className="text-foreground">Statement imports:</strong> CSV and PDF statements are read on your own device. Only the transactions you choose to import are saved to your account; the file itself is not uploaded or kept.</p>
          <p><strong className="text-foreground">Bank connections:</strong> If you connect a bank or brokerage, you sign in to it through Plaid; Yorbit never sees or stores your bank username or password. We store what is needed to show and sync your accounts: institution and account names, account type, the last four digits of the account number, balances, transactions and investment holdings. We also store the connection token Plaid issues so we can sync your data. It is kept on our servers in storage the app itself cannot read, and it is deleted when you disconnect the account or delete your Yorbit account.</p>
          <p><strong className="text-foreground">Notes, records and AI conversations:</strong> Notes, custom records and AI Coach conversations you create are saved in your account.</p>
          <p><strong className="text-foreground">Subscriptions:</strong> Your plan, its status and renewal date. Payments are made through Stripe (on the web) or Apple (in the iPhone app); we never receive your full card number. For web subscriptions we keep the Stripe customer and subscription identifiers; for App Store subscriptions, RevenueCat tells us whether your account's subscription is active.</p>
          <p><strong className="text-foreground">Technical information:</strong> Like any website or app, the services that host Yorbit receive standard request information such as your IP address and browser or device type in order to deliver it. If we turn on error reporting, technical details about an error and the device or browser it happened on are sent to our error-reporting provider so we can fix it.</p>
        </Section>

        <Section title="How We Use Your Data">
          <p>Your data is used only to power your own Yorbit experience:</p>
          <ul className="list-disc list-inside space-y-1 pl-2">
            <li>To display your transactions, budgets, and goals</li>
            <li>To generate your AI coaching suggestions, when you've turned AI features on</li>
            <li>To show budget health and spending trends</li>
            <li>To let you export or delete your data at any time</li>
            <li>To manage your subscription and answer your support requests</li>
          </ul>
          <p>We do not sell, share, or use your financial data for advertising.</p>
        </Section>

        <Section title="AI Insights">
          <p>Yorbit uses Anthropic's Claude AI models to power the two tabs on the Coach page, which send different amounts of data:</p>
          <p><strong className="text-foreground">Coaching Plan tab:</strong> Only aggregated numbers are sent — category totals, your savings rate, and budget status. No individual transaction records are included.</p>
          <p><strong className="text-foreground">Advisor Chat tab:</strong> To hold a real conversation about your finances, this tab sends your budgets, bills, and your most recent transactions (up to 40) — including each one's title, which is often a merchant or payee name — to Anthropic. If you'd rather keep certain details out of what's sent to our AI provider, avoid including them in transaction titles, goal names, or chat messages.</p>
          <p>Anthropic processes this data under its own privacy policy and API terms, which govern how they handle it on their end.</p>
          <p><strong className="text-foreground">Your consent is required first.</strong> Neither tab will send anything to Anthropic until you've explicitly agreed to AI processing. This isn't just a screen you can skip past — it's checked on our servers before every request, so it holds even if something bypasses the app's own interface.</p>
          <p>Advisor Chat conversations are saved in your account so you can come back to them, and are deleted when you delete your account.</p>
          <p>AI-generated content is informational only. It is not financial, legal, tax, or investment advice.</p>
        </Section>

        <Section title="Data Storage & Security">
          <p>Your data is stored securely using industry-standard practices. We use encrypted connections (HTTPS) for all data in transit.</p>
          <p>We do not store your bank account passwords or login credentials at any time. Bank connection tokens are kept only on our servers, out of reach of the app itself, and are removed when the connection is.</p>
        </Section>

        <Section title="Your Rights">
          <ul className="list-disc list-inside space-y-1 pl-2">
            <li><strong className="text-foreground">Export:</strong> You can download your data from Settings → Export My Data at any time. You choose where the file goes (in the iPhone app, through the share sheet); copies you save or send elsewhere stay there even after you delete your account.</li>
            <li><strong className="text-foreground">Delete data:</strong> Settings → Danger Zone → Delete My Data removes your transactions, budgets, goals, bills, net worth entries, investment holdings and saved insights. It does not remove notes, custom records or AI conversations, and it does not disconnect banks, so a connected bank can re-import transactions on its next sync.</li>
            <li><strong className="text-foreground">Delete account:</strong> Settings → Danger Zone → Delete Account removes your account and all associated data, cancels a subscription bought on the Yorbit website, and disconnects your linked banks at Plaid. A subscription bought through Apple is billed by Apple until you cancel it in your Apple account settings.</li>
          </ul>
        </Section>

        <Section title="Third-Party Services">
          <p>Yorbit uses these providers to run the service:</p>
          <ul className="list-disc list-inside space-y-1 pl-2">
            <li><strong className="text-foreground">Supabase</strong> — database, sign-in and backend hosting; your account data is stored there.</li>
            <li><strong className="text-foreground">Vercel</strong> — hosts the Yorbit website.</li>
            <li><strong className="text-foreground">Plaid</strong> — bank and brokerage connections, if you link an account.</li>
            <li><strong className="text-foreground">Anthropic</strong> — AI features, only after you agree (see "AI Insights").</li>
            <li><strong className="text-foreground">Stripe</strong> — payments for subscriptions bought on the website.</li>
            <li><strong className="text-foreground">Apple and RevenueCat</strong> — subscriptions bought in the iPhone app; RevenueCat confirms your subscription status using your Yorbit account ID.</li>
            <li><strong className="text-foreground">Sentry</strong> — error reports, when error reporting is turned on.</li>
          </ul>
          <p>Each has its own privacy policy. We share only what each needs to provide its part of the service, and never for advertising.</p>
        </Section>

        <Section title="Children">
          <p>Yorbit is not intended for users under 13 years of age. We do not knowingly collect data from children.</p>
        </Section>

        <Section title="Changes to This Policy">
          <p>We may update this policy from time to time. We will notify you of significant changes via the app or email.</p>
        </Section>

        <Section title="Contact">
          <p>Questions about this policy? Email us at <a href="mailto:yosefhamdi1998@gmail.com" className="text-primary hover:underline">yosefhamdi1998@gmail.com</a> or visit <a href="https://yorbit-life-os.vercel.app/support" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">yorbit-life-os.vercel.app/support</a>.</p>
        </Section>

      </div>
    </div>
  );
}