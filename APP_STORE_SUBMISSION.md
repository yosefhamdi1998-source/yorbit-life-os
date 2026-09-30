# Yorbit — App Store submission pack

**Draft — not submission-ready (reviewed against the app September 27, 2026).** Verify the signed iPhone build, reviewer account, purchases, account deletion, and privacy answers before submitting. Placeholders must be completed; synthetic browser fixtures do not prove a reviewer account exists in production.

Current Apple references: [App Review](https://developer.apple.com/app-store/review/), [Review Guidelines](https://developer.apple.com/app-store/review/guidelines/), and [Privacy and Data Use](https://developer.apple.com/app-store/user-privacy-and-data-use/). Review requires usable account access where sign-in is needed; privacy declarations must cover the app and third parties.

---

## App name and subtitle

**Name** (30 char max) — 6 characters:
```
Yorbit
```

**Subtitle** (30 char max):
```
Budget for changing income
```

The subtitle reflects the chosen niche: personal budgeting for people whose income changes.

---

## Promotional text (170 max, editable without review)

```
Connect your bank and see where your money actually goes. Yorbit shows real
numbers from real transactions — and tells you plainly when it doesn't have
enough data to be sure.
```

---

## Description

```
Yorbit helps you plan your personal budget when income changes from month to month. See your recorded income, spending, bills, and goals in one place.

CONNECT YOUR ACCOUNTS
Link a supported bank through Plaid and sync your transactions.
Prefer not to connect? Upload a CSV statement instead, or add
transactions by hand. Yorbit never sees or stores your bank login.

SEE WHERE IT ACTUALLY GOES
Income, spending, savings rate and net cash, over any period you pick — a
week, a month, a year. Categories are assigned automatically and you can
correct any of them.

BUDGETS THAT TELL THE TRUTH
Set limits per category and watch them through the month. Yorbit separates
spending that's inside a budget from spending in categories you haven't
budgeted at all, so "on track" always means what it says.

BILLS AND SUBSCRIPTIONS
Track what's due, what's overdue, and what recurs every month. See your real
monthly commitment and what it adds up to over a year.

INVESTMENTS
Link a supported brokerage or crypto account through Plaid to see your
holdings and their values, with totals kept separate by currency.

AN AI COACH, ON YOUR TERMS
Ask questions about your spending and get answers grounded in your actual
records. AI is entirely optional: Yorbit asks permission before sending
anything, shows you exactly what would be sent, and everything else in the app
works whether you say yes or no.

NUMBERS YOU CAN TRUST
Yorbit will tell you when it doesn't have enough history to answer properly,
rather than showing a confident total built from a handful of transactions.

PRIVACY
Your financial data is yours. It is never sold, and never shared for
advertising. Bank login passwords are handled by Plaid. Yorbit stores connection tokens to sync linked accounts.

Yorbit Pro unlocks budgets for every category, unlimited savings goals, and
the AI Coach. The AI Coach works only with your permission, has monthly usage
limits, and depends on the AI service being available; Pro does not guarantee
unlimited or daily AI use. Subscriptions
are monthly or yearly and renew automatically unless cancelled at least 24
hours before the period ends. Manage or cancel anytime in your Apple ID
settings.

Terms: https://yorbit-life-os.vercel.app/terms-of-use
Privacy: https://yorbit-life-os.vercel.app/privacy-policy
```

---

## Keywords (100 char max, comma separated, no spaces after commas)

```
budget,expense,spending,tracker,finance,money,savings,bills,plaid,networth,crypto,investing,planner
```

99 characters. Do not repeat words already in the name or subtitle — Apple
indexes those separately and duplicates waste the field.

---

## Category

- **Primary:** Finance
- **Secondary:** Productivity

---

## Age rating

Complete the current questionnaire against the signed app, including AI-generated content and external links. Do not preselect every answer or assume an age rating from this draft.

---

## App Review notes

These notes become true only after creating and verifying the dedicated reviewer account. Use the guarded `supabase/seed/app_review_demo.sql` once on that empty, explicitly marked account; it grants no Pro entitlement. To give the reviewer Pro without a purchase, grant the reviewer account's user id a RevenueCat promotional `pro` entitlement lasting the review period (RevenueCat API, V1 secret key), confirm the app shows Pro after revenuecat-sync, and revoke it afterwards; otherwise the notes must tell the reviewer to buy in the sandbox. Verify the login and every advertised flow before copying the notes into App Store Connect. The seed has not been run against production. AI service deployment/configuration and consent must be verified before describing Coach as available.

```
DEMO ACCOUNT
Email:    <<REVIEW_EMAIL>>
Password: <<REVIEW_PASSWORD>>

This account is pre-populated with entirely fictional financial data. No real
person's information is present. You do not need to connect a bank to review
the app — sign in and every screen is populated.

WHAT TO LOOK AT
Bottom tabs: Home, Money, Invest, Plan, Coach.
- Home: income, spending, savings rate and net cash for the selected period;
  the chart has 1M / 3M / 6M / 1Y ranges.
- Money: full transaction list with search, filters and categories.
- Plan > Budget: per-category limits against actual spending this month.
- Plan > Bills: upcoming, overdue and paid, including recurring items.
- Invest: holdings from linked investment accounts (the demo account has
  fictional holdings; no brokerage connection is needed).
- Coach: our AI assistant. FIRST USE SHOWS A CONSENT SCREEN — this is
  deliberate. It explains that transaction descriptions, budgets and bills
  would be sent to Anthropic for analysis, and lets the reviewer accept or
  decline. Declining leaves every non-AI feature fully working. You can change
  the choice later in Settings > Trust & Privacy.

SUBSCRIPTIONS
Yorbit Pro is offered monthly and yearly via In-App Purchase. The free tier is
fully usable; Pro unlocks budgets for every category, unlimited savings goals
and the AI Coach (consent required, monthly usage limits). The demo account
needs Pro access to show the Coach. The paywall is reachable from Settings >
Upgrade; Restore Purchases is in Settings.

BANK CONNECTIONS
Bank linking uses Plaid. Yorbit does not store bank login passwords; it stores connection tokens for syncing.
The reviewer does not need to link an account — the demo data is already
present. To try linking anyway, the reviewer account uses Plaid's test
environment: choose any listed bank and sign in with username user_good,
password pass_good (Plaid's public test login; no real bank is involved).
[Only include this paragraph once <<REVIEW_EMAIL>> is on PLAID_SANDBOX_EMAILS,
PLAID_SANDBOX_SECRET is set, the Plaid functions from 27c64e4 are deployed, and
a sandbox link has been verified with that account.]

DATA DELETION
Settings > Delete Account permanently removes the account and all associated
data, cancels a web (Stripe) subscription, and revokes any linked bank
connections at Plaid. It tells App Store subscribers that Apple billing
continues until they cancel with Apple, and links to Apple's subscription
page, before deleting.

Contact for review questions: <<SUPPORT_EMAIL>>
```

---

## Screenshot plan

Required: **6.9"** iPhone (accepted 1320 × 2868, 1290 × 2796 or 1260 × 2736;
6.5" is only required when 6.9" is not provided). PNG or JPEG, no alpha
channel, 1-10 per size. The Xcode target is currently universal
(TARGETED_DEVICE_FAMILY = 1,2), which also requires **13" iPad** screenshots
(2064 × 2752 or 2048 × 2732) unless the build is made iPhone-only.

Synthetic captures from the fixture build (no real data) are in
`store-assets/screenshots/` - see its README for how they were made.

Capture from the demo account so no real data appears.

| # | Screen | Caption |
|---|---|---|
| 1 | Home, 1M selected | "See where your money actually goes" |
| 2 | Money, transaction list | "Every transaction, sorted and searchable" |
| 3 | Budget | "Budgets that tell you the truth" |
| 4 | Invest, holdings | "Your investments, in one place" |
| 5 | Coach (Pro) | "Ask questions about your own spending" |
| 6 | Bills | "Never miss what's due" |

Six draft images are prepared per device size; use only accurate, representative images within Apple's allowed count. The captured Coach screenshot
shows the chat, not the consent step: the fixture profile has already granted
AI consent. The consent gate itself is real (AiConsentGate on the client,
has_ai_consent checked fail-closed by ai-coach before any data is sent).

---

## Privacy nutrition labels

Draft inventory only. Reconcile the signed archive privacy report, SDK behavior, server processing, and Privacy Policy before answering App Store Connect. This source manifest alone is not a completed privacy review.

**Data used to track you:** None.

**Data linked to you:**

| Type | Purpose |
|---|---|
| Email address | App Functionality |
| Financial Info (transactions, balances) | App Functionality |
| Purchase History | App Functionality |
| User ID | App Functionality |
| Crash Data | App Functionality |

Crash Data, measured September 30: a local build with no Sentry DSN produced the same content-hashed entry file the live website serves (index-CAWadl42.js), so Sentry is not active on the website today. The Codemagic iOS build gets its Supabase settings from .env.production, which has no DSN, so the signed app will not send crash reports either unless VITE_SENTRY_DSN is added to its build environment. Decide whether to enable Sentry in the iOS build, then make this row and the PrivacyInfo.xcprivacy crash-data entry match that decision.

Do not submit blanket "not collected" answers from this draft. Legacy routes, optional notes/forms/health entries, AI inputs, diagnostics and third-party SDK collection still need reconciliation. Confirm tracking behavior in the signed build and provider configuration before answering the tracking question.

---

## Subscription disclosures

Apple requires all of the following visible **on the paywall itself**, not
only in the description:

- [ ] Subscription name — Yorbit Pro
- [ ] Length — monthly / yearly
- [ ] Price per period, in local currency
- [ ] What the subscription unlocks
- [ ] Auto-renews unless cancelled 24h before period end
- [ ] Link to Terms of Use
- [ ] Link to Privacy Policy
- [ ] Restore Purchases button

Verify each against `src/pages/Upgrade.jsx` before submitting. A missing
Restore button or absent auto-renewal wording is a standard rejection.

---

## Export compliance

`ITSAppUsesNonExemptEncryption` is already set to `false` in `Info.plist`, but the owner must confirm the export-compliance answers against the final signed build and its dependencies. A source flag alone does not establish the correct declaration.

---

## Values only you can supply

| Placeholder | Where it comes from |
|---|---|
| `<<TERMS_URL>>` | `https://yorbit-life-os.vercel.app/terms-of-use` |
| `<<PRIVACY_URL>>` | `https://yorbit-life-os.vercel.app/privacy-policy` |
| `<<SUPPORT_EMAIL>>` | Current support: `yosefhamdi1998@gmail.com`; confirm it is monitored |
| `<<REVIEW_EMAIL>>` | reviewer account you create, e.g. `appreview@yorbit.app` |
| `<<REVIEW_PASSWORD>>` | you set it; give it to Apple, not to anyone else |

A branded support address is optional polish. A working, monitored support contact is necessary; buying a domain is not a prerequisite imposed by this checklist.

## Privacy wording prepared for owner review (not published)

The current policy needs these concrete corrections before submission:

- CSV transactions are stored in the account's hosted database, not only locally on the device. The source CSV is not retained by the import flow.
- Yorbit stores provider connection tokens on its backend to sync accounts; these differ from bank login passwords. The account-metadata paragraph must not imply no financial credentials of any kind are retained.
- Name Stripe (web billing), Apple and RevenueCat (App Store subscriptions), Vercel (web hosting), and Sentry when diagnostics is configured, in addition to Supabase, Plaid and Anthropic. Do not claim a provider is active merely because its SDK is installed.
- The limited Delete My Data action clears the financial tables listed in Settings; full account deletion is a separate action. Do not promise that the limited reset erases notes, maintenance records or AI conversation history.
- Native exports use the device cache and share sheet; the user chooses the destination. Explain that exported copies remain with the chosen recipient/location after account deletion.

Evidence: src/pages/PrivacyPolicy.jsx; src/api/base44Client.js; src/lib/saveFile.js; src/lib/errorReporting.js; ios/App/App/PrivacyInfo.xcprivacy; the reviewed billing and bank handlers. Sentry initialization is conditional on VITE_SENTRY_DSN and sets tracesSampleRate=0.1; final diagnostics/performance disclosure must match actual release configuration. The source manifest lists email, financial information, purchase history, user ID and crash data. Optional notes/forms/AI chat and SDK-specific collection require final archive and provider review. This is a factual draft, not completed App Store privacy answers or legal approval.

Native source correction September 27: the Filesystem plugin requires the FileTimestamp reason entry; NSPrivacyAccessedAPICategoryFileTimestamp / C617.1 is now included for app-cache exports. The plist parses successfully. [Official plugin requirement](https://capacitorjs.com/docs/apis/filesystem#apple-privacy-manifest-requirements). Verify inclusion in the signed archive, not only this source file.


## September 28 configuration evidence
Supabase Auth now allows exact app.yorbit://auth/callback, preserving both existing web redirect patterns. The native PKCE callback tests pass; no signed-device sign-in/recovery result is claimed. Billing portal v2 is deployed with sandbox-only access, but Stripe and RevenueCat provider setup is incomplete. Do not mark review credentials, purchases, restore or provider lifecycle as verified based on these configuration checks.
