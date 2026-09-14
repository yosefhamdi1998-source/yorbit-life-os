# Yorbit — App Store submission pack

**Draft — not submission-ready (September 14, 2026).** Verify the signed iPhone build, reviewer account, purchases, account deletion, and privacy answers before submitting. Placeholders must be completed; synthetic browser fixtures do not prove a reviewer account exists in production.

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
Link your bank securely through Plaid and your transactions import on their
own. Prefer not to connect? Upload a CSV statement instead, or add
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

INVESTMENTS AND CRYPTO
Import your exchange history and see realized profit and loss calculated with
FIFO cost basis. Gains and losses are
broken out by year. Sales with no recorded purchase are reported separately
and never counted as profit.

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

Yorbit Pro includes AI coaching and briefings, budgets for all categories, and unlimited savings goals. AI availability and usage limits must be confirmed before this draft is published. Subscriptions
are monthly or yearly and renew automatically unless cancelled at least 24
hours before the period ends. Manage or cancel anytime in your Apple ID
settings.

Terms: <<TERMS_URL>>
Privacy: <<PRIVACY_URL>>
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

```
DEMO ACCOUNT
Email:    <<REVIEW_EMAIL>>
Password: <<REVIEW_PASSWORD>>

This account is pre-populated with entirely fictional financial data. No real
person's information is present. You do not need to connect a bank to review
the app — sign in and every screen is populated.

WHAT TO LOOK AT
- Home: income, spending, savings rate and net cash for the selected period.
  Use the period selector (1W / 1M / 3M / 6M / Year) to change the range.
- Money: full transaction list with search, filters and categories.
- Budget: per-category limits against actual spending for this month.
- Bills: upcoming, overdue and paid, including recurring items.
- Invest: realized profit and loss by year, FIFO cost basis.
- Coach: our AI assistant. FIRST USE SHOWS A CONSENT SCREEN — this is
  deliberate. It explains that transaction descriptions, budgets and bills
  would be sent to Anthropic for analysis, and lets the reviewer accept or
  decline. Declining leaves every non-AI feature fully working. You can change
  the choice later in Settings > Trust & Privacy.

SUBSCRIPTIONS
Yorbit Pro is offered monthly and yearly via In-App Purchase. The free tier is
fully usable; Pro adds AI coaching and briefings, budgets for all categories, and unlimited savings goals. The
paywall is reachable from Settings > Upgrade.

BANK CONNECTIONS
Bank linking uses Plaid. Yorbit does not store bank login passwords; it stores connection tokens for syncing.
The reviewer does not need to link an account — the demo data is already
present.

DATA DELETION
Settings > Delete Account permanently removes the account and all associated
data, and revokes any linked bank connections at Plaid.

Contact for review questions: <<SUPPORT_EMAIL>>
```

---

## Screenshot plan

Required: **6.9"** (1320 × 2868) and **6.5"** (1242 × 2688). Apple accepts
scaling down from the largest size, so shoot 6.9" and let it scale.

Capture from the demo account so no real data appears.

| # | Screen | Caption |
|---|---|---|
| 1 | Home, 1M selected | "See where your money actually goes" |
| 2 | Money, transaction list | "Every transaction, sorted and searchable" |
| 3 | Budget | "Budgets that tell you the truth" |
| 4 | Invest, gains/losses chart | "Real profit and loss, FIFO cost basis" |
| 5 | Coach consent screen | "AI on your terms — you decide what's shared" |
| 6 | Bills | "Never miss what's due" |

Shoot 5 at minimum; 6 uses the full allowance. Screenshot 5 is deliberately
the consent screen — it turns a compliance requirement into a selling point
and pre-answers the reviewer's privacy question.

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
