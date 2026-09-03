import { useState } from 'react';
import PageHeader from '@/components/PageHeader';
import { Copy, Check, Store } from 'lucide-react';

function CopyBlock({ label, content }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div className="sky-card rounded-2xl p-5 mb-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-bold text-foreground">{label}</p>
        <button onClick={copy} className="flex items-center gap-1.5 text-xs text-primary font-medium px-3 py-1.5 rounded-lg bg-primary/8 active:opacity-70 transition-opacity">
          {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="text-xs text-muted-foreground whitespace-pre-wrap leading-relaxed font-sans">{content}</pre>
    </div>
  );
}

const APP_NAME = `Yorbit – Personal Finance`;

const SUBTITLE = `Budget, Save & Track Money`;

const TAGLINE = `Track your money. Know your next move.`;

const DESCRIPTION = `Yorbit helps you take control of your finances — simply and clearly.

See exactly where your money goes, build smarter habits, and always know what to do next.

TRACK INCOME & EXPENSES
Add transactions in seconds. Categorize by housing, food, transport, health, and more. See your monthly income, spending, and net savings at a glance.

BUILD A BUDGET
Set monthly limits for each spending category. Yorbit shows you at a glance whether you're on track, close to the edge, or over budget.

MANAGE YOUR BILLS
Never miss a payment. Track recurring bills, see what's due this week, and mark bills paid as you go.

SET SAVINGS GOALS
Give your money a purpose. Set a target, track your progress, and celebrate milestones along the way.

IMPORT YOUR TRANSACTIONS
Bring in your bank history with a CSV file. Map your columns, preview your import, and get up to date fast. Bank sync is coming soon.

AI MONEY BRIEFING
Every day, get a plain-English summary of your financial picture — what's going well, where to watch out, and your most important next step.

AI MONEY COACH
Ask for a deeper read. The AI Coach analyzes your spending patterns and suggests simple, actionable ways to improve your financial health.

YOUR DATA STAYS YOURS
Your financial data is never sold or shared. Export or delete your data at any time from Settings.

Yorbit is designed for real life — not spreadsheets. Simple to start. Powerful once you're in it.`;

const KEYWORDS = 'budget, money, finance, expense tracker, spending, bills, savings, income, personal finance, AI coach';

const SCREENSHOTS = `SCREENSHOT STORYBOARD — iPhone App Store (6.7" display)

1. Money Dashboard
   Caption: "See your money clearly"
   Show: Hero card with net saved, income vs spending pills, Budget Health strip, recent transactions

2. Today's Action
   Caption: "Know your next move"
   Show: NextBestAction card with a clear call to action (e.g. "You're 80% through your food budget")

3. Track Spending
   Caption: "Every dollar accounted for"
   Show: Finance tab — transaction list with category icons, search bar, filter chips

4. Budget Health
   Caption: "Stay on top of your budget"
   Show: Budget page — category rows with progress bars, spending vs limit, color indicators

5. Savings Goals
   Caption: "Build toward what matters"
   Show: Goals page — 1-2 goals with progress bars, milestones, target dates

6. AI Money Coach
   Caption: "Simple guidance when you need it"
   Show: Coach page — AI-generated spending analysis with actionable bullet points

7. Bills Tracker
   Caption: "Never miss a payment"
   Show: Bills page — upcoming bills, due dates, paid/unpaid status

NOTES:
- Use real data (no fake records or lorem ipsum)
- Show light mode for primary screenshots
- Add device frame (optional)
- Minimum 3 screenshots required; 7 recommended`;

const PRIVACY_NOTES = `App Store Privacy Nutrition Label

Data Used to Track You: None
Data Linked to You:
  - Financial info (transactions, budgets, goals, bills) — used for app functionality
  - Contact info (email) — account management only
Data Not Linked to You: None collected
Data Not Collected: Precise location, health, browsing history, contacts, usage data sold to third parties

Privacy Policy URL: https://yorbit-life-os.vercel.app/privacy-policy
Support URL: https://yorbit-life-os.vercel.app/support`;

const CATEGORY = `Finance`;

const AGE_RATING = `4+ — No objectionable content`;

const REVIEW_NOTES = `App Store Review Notes

Yorbit is a personal finance tracking app. Users manually enter income, expenses, budgets, bills, and savings goals. The app also supports CSV bank statement import.

Subscription: Yorbit Pro is available as an auto-renewable subscription via Apple In-App Purchase.
- Monthly: $4.99/month (Product ID: app.yorbit.pro.monthly)
- Annual: $29.99/year (Product ID: app.yorbit.pro.yearly)
- Entitlement: pro

Pro unlocks: unlimited budgets, unlimited savings goals, AI Money Coach, daily AI financial briefings, and priority support.

Account deletion: Available in Settings → Danger Zone → Delete Account & Data. Deletes all user data server-side and signs out.

Restore Purchases: Available on the Upgrade page and in Settings.

Support: yosefhamdi1998@gmail.com
Privacy Policy: https://yorbit-life-os.vercel.app/privacy-policy
Terms of Use: https://yorbit-life-os.vercel.app/terms-of-use`;

const SUBSCRIPTION_INFO = `Subscription Details for App Store Connect

Subscription Group: Yorbit Pro

Product 1:
  - Reference Name: Yorbit Pro Monthly
  - Product ID: app.yorbit.pro.monthly
  - Duration: 1 Month
  - Price: $4.99/month

Product 2:
  - Reference Name: Yorbit Pro Yearly
  - Product ID: app.yorbit.pro.yearly
  - Duration: 1 Year
  - Price: $29.99/year

Entitlement (RevenueCat): pro

Subscription Description (shown to user):
  Yorbit Pro unlocks unlimited budgets, unlimited savings goals, the AI Money Coach, daily AI financial briefings, and priority support.

  • Monthly: $4.99/month
  • Annual: $29.99/year
  • Cancel anytime · No hidden fees

Restore Purchases: Available in Settings and on the Upgrade page.`;

export default function AppStoreCopy() {
  return (
    <div className="py-4 pb-12">
      <PageHeader
        title="App Store Copy"
        subtitle="Ready-to-paste listing content"
        icon={Store}
        gradient="gradient-primary"
      />

      <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-5">
        <p className="text-xs font-semibold text-amber-800">Internal tool — not visible to app users.</p>
        <p className="text-xs text-amber-700 mt-1">Copy each block directly into App Store Connect. Replace [your-app-domain] with your real domain before submitting.</p>
      </div>

      <CopyBlock label="App Name (30 chars max)" content={APP_NAME} />
      <CopyBlock label="Subtitle (30 chars max)" content={SUBTITLE} />
      <CopyBlock label="Promotional Text / Tagline" content={TAGLINE} />
      <CopyBlock label="Category" content={CATEGORY} />
      <CopyBlock label="Age Rating" content={AGE_RATING} />
      <CopyBlock label="Description (4000 chars max)" content={DESCRIPTION} />
      <CopyBlock label="Keywords (100 chars max, comma-separated)" content={KEYWORDS} />
      <CopyBlock label="Screenshot Storyboard" content={SCREENSHOTS} />
      <CopyBlock label="Privacy Nutrition Label Notes" content={PRIVACY_NOTES} />
      <CopyBlock label="Review Notes for Apple" content={REVIEW_NOTES} />
      <CopyBlock label="Subscription Products (App Store Connect)" content={SUBSCRIPTION_INFO} />

      <div className="sky-card rounded-2xl p-5 mt-2">
        <p className="text-sm font-bold text-foreground mb-3">App Icon</p>
        <img
          src="https://media.base44.com/images/public/6a1a08af1b08f6ace95e7c1d/33ac3faab_generated_image.png"
          alt="Yorbit App Icon"
          className="w-32 h-32 rounded-3xl shadow-lg mx-auto block"
        />
        <p className="text-xs text-muted-foreground text-center mt-3">Generated concept — export at 1024×1024 PNG, no transparency, no rounded corners (Apple adds them).</p>
      </div>
    </div>
  );
}