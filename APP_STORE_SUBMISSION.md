# Yorbit — App Store submission pack

Everything here is ready to paste into App Store Connect. Placeholders that
need a value only you can supply are marked **`<<REPLACE>>`** and listed again
at the bottom, so nothing gets submitted with a gap in it.

---

## App name and subtitle

**Name** (30 char max) — 6 characters:
```
Yorbit
```

**Subtitle** (30 char max) — 29 characters:
```
Money tracker & AI insights
```

Avoid "budgeting app" in the subtitle; the category already says that and the
space is better spent on the differentiator.

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
Yorbit turns your real transactions into a clear picture of your money.

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
FIFO cost basis — the same method tax reporting uses. Gains and losses are
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
advertising. Bank credentials are handled by Plaid and never reach Yorbit.

Yorbit Pro unlocks unlimited AI coaching and advanced reports. Subscriptions
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

Answer **No** to every content question. Expected result: **4+**.

One question to answer carefully: *Unrestricted Web Access* — answer **No**.
Yorbit opens Plaid Link in a controlled flow, not an open browser.

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
fully usable; Pro raises AI usage limits and unlocks advanced reports. The
paywall is reachable from Settings > Upgrade.

BANK CONNECTIONS
Bank linking uses Plaid. Yorbit never receives or stores bank credentials.
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

Must match `ios/App/App/PrivacyInfo.xcprivacy` and the Privacy Policy exactly.
Any disagreement between the three is a rejection.

**Data used to track you:** None.

**Data linked to you:**

| Type | Purpose |
|---|---|
| Email address | App Functionality |
| Financial Info (transactions, balances) | App Functionality |
| Purchase History | App Functionality |
| User ID | App Functionality |
| Crash Data | App Functionality |

**Data not collected:** Location, Contacts, Health, Browsing History,
Search History, Sensitive Info, Photos, Audio.

Answer **No** to "Do you or your third-party partners use data for tracking?"

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

`ITSAppUsesNonExemptEncryption` is already set to `false` in `Info.plist`, so
App Store Connect will not prompt per build. Yorbit uses only HTTPS/TLS and
Apple's platform cryptography, which is exempt.

---

## Values only you can supply

| Placeholder | Where it comes from |
|---|---|
| `<<TERMS_URL>>` | your domain, e.g. `https://yorbit.app/terms` |
| `<<PRIVACY_URL>>` | your domain, e.g. `https://yorbit.app/privacy` |
| `<<SUPPORT_EMAIL>>` | `support@` on your domain — **not** a personal Gmail |
| `<<REVIEW_EMAIL>>` | reviewer account you create, e.g. `appreview@yorbit.app` |
| `<<REVIEW_PASSWORD>>` | you set it; give it to Apple, not to anyone else |

The support address is not cosmetic. A personal Gmail address on a finance
app's support listing is a credibility problem with reviewers and customers
alike.
