# Yorbit — App Store Readiness

**Verdict: NOT READY.** Not close, and the reasons are mostly not code.

Last verified 2026-09-05 against commit `HEAD` on `master`, the live Supabase
project, and the deployed builds at `yorbit-life-os.vercel.app` and GitHub
Pages.

Everything below was checked, not remembered. Where something could not be
checked from this machine, it says so and why.

---

## How to read this

Four sections. **App Store Ready requires BLOCKED BY CODE to be empty and
every item in BLOCKED BY OWNER to be done.** Right now neither is true.

The single most important thing on this page: **there is no Mac in this
environment.** No iOS build has ever been produced or run. Every native claim
below is source-level only. Nobody has seen Yorbit launch on an iPhone.

---

## READY

Verified working in production.

| Item | Evidence |
|---|---|
| Crypto FIFO P&L, server-side | `crypto_asset_summary` 440ms median / 86 rows, `crypto_pnl_by_year` 442ms / 7 rows (3 runs each, live). Was 8.3s → timeout. |
| P&L cross-checks to the cent | Two independent RPC paths: realized −$25,829.25 vs −$25,829.21 (4¢ rounding), proceeds $1,306,386.06 vs .03. Both match a JS reference computed from the raw Coinbase CSVs, never touching the DB. |
| No approximate money shown as authoritative | Investments shows verified server numbers or an explicit "couldn't load your totals" with retry. The 400-row fallback that printed "$9,000 bought" for a $1.33M account is gone. |
| RPC surface closed to anonymous callers | `node scripts/test-rpc-authz.js` → 12/12 refused, exit 0. Previously 8 answered the published anon key, one of them a write. |
| Trade times recovered | 100% of crypto rows have `occurred_at`, derived from Coinbase ObjectIds. Verified 7,750/7,751 match the real timestamp to the second. |
| Linter catches crash-class bugs | `scripts/test-lint-config.js` lints real fixtures; 3 failures against the old config, passes now. Wired into `npm test`. |
| AI Coach renders | Was a hard `ReferenceError` crash for every user. |
| Paywall cannot hang | 10s timeout + `offeringsFailed` visible state in `Upgrade.jsx`. |
| Plaid points at production | `PlaidEnvironments.production` in all four Plaid functions. |
| Product IDs / entitlement correct in code | `app.yorbit.pro.monthly`, `app.yorbit.pro.yearly`, entitlement `pro`. |

---

## BLOCKED BY CODE

**This section must be empty before submission. It is not.**

### C1 — No iOS build has ever been produced · SEVERITY: BLOCKER
**Evidence:** This environment is Windows. `npx cap sync ios`, `xcodebuild`
and Xcode cannot run here. `ios/App/App/public/` contains a stale bundle from
some earlier sync.
**Consequence:** Every native claim in this document is source-level. Icons,
launch screen, safe areas, keyboard behaviour, the file picker used by CSV
import, deep links, offline behaviour and back-navigation are **unverified on
a real device**.
**Next action:** Run the Codemagic pipeline (owner has the account) or build
on a Mac. Then walk the app on a physical iPhone.
**Owner:** Owner triggers; I can fix whatever it surfaces.
**Verified by:** A TestFlight build installed on a real iPhone that launches
and completes the QA walk.

### C2 — Two migrations written but not applied · SEVERITY: BLOCKER
**Evidence:** `has_ai_consent` and the `profiles.ai_consent_*` /
`profiles.onboarding_completed_at` columns do not exist in production
(probed live: `42703 column ... does not exist`). The AI consent lookup
therefore fails and resolves to "unasked", which is safe by design — Coach
shows the consent screen and no data can reach Anthropic — but Allow cannot
persist until the columns exist.
**Unapplied — verified empirically 2026-09-05 by probing the live schema,
not inferred from source:** `20260906180000` (profiles.onboarding_completed_at)
and `20260907100000` (profiles.ai_consent_*, has_ai_consent). An earlier draft
of this document listed 20260906135000 and 20260906160000 as well; both are in
fact live — `transactions.occurred_at` and `crypto_time_coverage()` both
resolve. Combined script: `C:\YORBIT\sql-apply-these-two.sql`.
**Next action:** Run each in the Supabase SQL editor, oldest first.
**Owner:** Owner (no DB credentials in this environment).
**Verified by:** `has_ai_consent` returns; Coach shows the consent screen and
`ai_consent_at` persists after tapping Allow.

### C3 — Android package still `app.moneyglow` · SEVERITY: LOW for iOS launch
**Evidence:** `android/app/build.gradle`, `strings.xml`,
`java/app/moneyglow/MainActivity.java`.
**Next action:** Rename the Java package directory and identifiers. Not
required for an App Store submission.
**Owner:** Me, when Android matters.

### C4 — App Review demo account does not exist · SEVERITY: BLOCKER
**Evidence:** No seed script, no demo user, no fictional dataset in the repo.
**Consequence:** A reviewer cannot connect a real bank. With no demo account
they see an empty app and reject it. This is one of the most common rejection
reasons for finance apps.
**Next action:** Build a seeded reviewer account with fictional data covering
Dashboard, transactions, budgets, bills, Cash on Hand, Investments and Coach.
**Owner:** Me. Not done in this pass.

### C5 — Public signup abuse protection not built · SEVERITY: BLOCKER for public launch
**Evidence:** Invite-only allowlist via `enforce_email_allowlist()`. Rate
limiting exists for AI (`RULES.ai`) but there is no signup CAPTCHA, and email
verification is not enforced before expensive Plaid/Anthropic calls.
**Consequence:** Removing the allowlist without this lets scripts create
accounts that consume Plaid and Anthropic quota billed to the owner.
**Next action:** Turn on Supabase Auth CAPTCHA (owner, see O7), enforce
`email_confirmed_at` before Plaid link and AI calls, add signup rate limits.
**Owner:** Shared — owner enables CAPTCHA, I enforce verification.

### C6 — Plaid tokens stored in plaintext · SEVERITY: HIGH
**Evidence:** `connected_accounts.access_token_ref` is a plain `text` column.
Written in `plaid-exchange-token/index.ts`. Long-standing finding (B1).
**Mitigation today:** RLS scopes rows to the owner and tokens are never sent
to the browser. Anyone with the service-role key or a DB dump reads them.
**Next action:** Application-layer encryption using a key in Supabase secrets;
migrate existing tokens in place so nobody has to reconnect.
**Owner:** Me. Not done in this pass.

### C7 — Large-account Plaid sync timeout (B3) · SEVERITY: HIGH
**Evidence:** Carried from HANDOFF; not re-verified this pass.
**Next action:** Read `plaid-sync-transactions`, make the sync cursor-based,
idempotent and resumable rather than raising a timeout. Prove against a large
fixture with no duplicates and no partial state.
**Owner:** Me. Not done in this pass.

### C8 — Account deletion may not call Plaid `/item/remove` · SEVERITY: HIGH
**Evidence:** Not verified this pass. If it does not, deleting an account
leaves the Item live at Plaid, still billable and still linked to the user's
bank.
**Next action:** Audit `delete-account`; add `/item/remove` per Item before
destroying local records. Test against a sandbox Item, never the live one.
**Owner:** Me.

### C9 — Sentry alerting not configured · SEVERITY: MEDIUM
**Evidence:** Ingestion proven previously; no alert rule exists. Errors land
in a dashboard nobody watches.
**Next action:** See O9 for the exact click path.
**Owner:** Owner (no Sentry account access here).

---

## BLOCKED BY OWNER / EXTERNAL ACCOUNT

Ordered. Several later items depend on earlier ones.

### O1 — Legal entity · SEVERITY: BLOCKER · DO THIS FIRST
Apple requires finance apps to be published by the legal entity providing the
service, and generally will not accept an individual developer account for
banking-adjacent apps. This gates everything else and takes the longest.

1. Form an LLC or equivalent.
2. Obtain a **D-U-N-S number** (free from Dun & Bradstreet, up to ~2 weeks).
3. Convert the Apple Developer membership to an **Organization** account.
4. Get a work email on your own domain.
5. Stand up a public website at that domain describing Yorbit.

**Verify against Apple's current documentation before acting** — I am not able
to browse it from here, and this is the one item where acting on stale
guidance is expensive.

### O2 — Domain and support email · SEVERITY: BLOCKER
Today: `yosefhamdi1998@gmail.com` and `yorbit-life-os.vercel.app`. A personal
Gmail on a finance app's support listing reads as a hobby project to a
reviewer and to customers.
Needed: a real domain, `support@` on it, Privacy Policy and Terms at stable
URLs on it.

### O3 — Apply the migrations (see C2) · SEVERITY: BLOCKER

### O4 — RevenueCat and App Store Connect · SEVERITY: BLOCKER
`REVENUECAT_API_KEY` and `APP_STORE_ID` are both empty strings in
`src/lib/appStoreConfig.js`. **Subscriptions cannot function on iOS.**
1. Create the App Store Connect listing with bundle ID **app.yorbit**.
2. Create auto-renewable subscriptions `app.yorbit.pro.monthly` and
   `app.yorbit.pro.yearly`.
3. Create the RevenueCat project, entitlement `pro`, and an offering with
   `$rc_monthly` / `$rc_annual`.
4. Paste the Apple **public** key into `REVENUECAT_API_KEY` and the numeric
   App Store ID into `APP_STORE_ID`.
5. Complete **Agreements, Tax and Banking** — paid apps are blocked until
   this is signed.
6. Consider the **Small Business Program** (15% instead of 30%).

### O5 — Plaid production launch · SEVERITY: BLOCKER
Your own BoA connection working proves the integration, **not** that public
production access is approved. Confirm in the Plaid dashboard: production
access, company profile, security questionnaire, OAuth registrations and
redirect URIs, webhooks, public support details, institution coverage.

### O6 — Run the iOS build (see C1) · SEVERITY: BLOCKER

### O7 — Supabase Auth hardening · SEVERITY: BLOCKER for public signup
Dashboard → Authentication → Settings: enable email confirmations, set the
site URL and redirect allow-list to include the app's deep-link scheme, enable
CAPTCHA (hCaptcha/Turnstile), set sensible rate limits.

### O8 — App Store metadata · SEVERITY: BLOCKER
Description, subtitle, keywords, category, age rating questionnaire,
screenshots at current required iPhone sizes, subscription disclosures,
privacy nutrition labels matching `PrivacyInfo.xcprivacy` and the Privacy
Policy, App Review notes, demo account credentials, export compliance.

### O9 — Sentry alert rule · SEVERITY: MEDIUM
sentry.io → your project → **Alerts** → **Create Alert** → **Issues** →
condition *A new issue is created* → optionally filter to
`environment:production` → action *Send a notification to* your email →
name it "New production error" → Save.

---

## POST-LAUNCH

### P1 — Internationalisation. Ship v1 as US/USD and say so.
Audited: `src/lib/format.js` hardcodes `en-US`; `$` is hardcoded across the
UI; `currency text default 'USD'` exists on `investment_holdings` and
`connected_accounts` but **nothing reads it**. There is no FX handling and no
cross-currency aggregation. A non-USD account would have its balance summed
into a USD total as though the numbers were comparable — silently wrong.

Changing `$` to another symbol would make that worse, not better: it would
look correct while still adding unlike quantities. Real support means a
currency on every monetary row, per-currency aggregation, an FX source with
dated rates, and locale-aware formatting. That is a project, not a setting.

**Do not describe Yorbit as worldwide until it is.**

### P2 — Android launch (C3).
### P3 — Transaction-based recurring detection.
### P4 — Multi-device session management.

---

## What I could not verify from here, and why

Stated plainly so nothing on this page is mistaken for tested:

- **Anything on a real iPhone.** No Mac, no Xcode, no device.
- **The archive's privacy report.** Requires Xcode against a built archive.
  `PrivacyInfo.xcprivacy` is correct in source and wired into the target's
  Resources build phase, which is necessary but not sufficient.
- **RevenueCat / App Store Connect / Plaid dashboard state.** No credentials.
- **StoreKit or TestFlight purchase, trial, restore, expiry.** Needs O4 first.
- **Production database schema.** No DB credentials in this session; the
  unapplied-migration list is derived from source and from live RPC probes.
