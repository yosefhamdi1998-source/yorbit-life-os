# Yorbit revision — September 8, 2026

## Product direction

Personal budgeting for variable income. The central experience is a clear financial overview: review recorded income and spending, see the unpaid bills due in the next seven days, and choose one next action. Preserve bank connections and transaction organization. Do not add bookkeeping, payroll, or another set of top-level tools.

## Implemented in this working copy

- Five primary destinations: Home, Money, Invest, Plan, Coach. Plan groups Budget, Bills, Recurring, and Goals. More is a grouped menu.
- Home loses the duplicate shortcut directory, score, and net-worth section. These financial records remain in their existing destinations. The trend chart is visible beside the summary on desktop and below it on phones. The floating action menu no longer obscures mobile content.
- Home income and spending links carry exact dates. Income opens filtered transactions; spending opens the same date range in the report. Weekly and biweekly date definitions agree across pages.
- Money uses one period for summary figures, transactions, and category spending. Advanced filters are collapsed. Undefined savings rates display an explanation instead of zero.
- Budget distinguishes spending within budgeted categories from spending outside them. Unused category limits are explicitly not a bank balance or safe-to-spend estimate.
- Home prioritizes overdue bills and links directly to them. A bill due today is not overdue. The seven-day bill total includes recorded unpaid bills only.
- Home, Money, and Budget show a retry state after a load failure instead of zero-valued dashboards.
- RevenueCat initialization remains usable across repeated/concurrent calls, and annual subscriptions use the SDK's string identifiers.
- Checkout requires an authenticated user, applies the existing rate limit, allowlists the displayed plan IDs and return URLs, and fixes its error handler. Webhook mapping now matches the frontend; database errors trigger failure/retry rather than a false success.
- Removed unsupported priority-support and autopilot marketing claims.

## Validation

- Full final regression suite passed, including payment and RevenueCat mocks.
- All 25 live database enum/constraint checks passed (read-only).
- New date-range and weekly-bill regression checks passed.
- New RevenueCat tests passed using a mocked SDK.
- New checkout tests passed using a mocked provider; no charge was made.
- Final lint and production build passed. The source credential-pattern scan covered 412 tracked files and found no matches (the deliberate redaction-test fixture is excluded).
- Desktop/mobile sample-data inspection performed for Home, Money, and Budget. Synthetic preview is `npm run dev:fixtures`; ordinary `npm run dev` and `npm run build` use the real application configuration.

## Deployment status and remaining work

Revision 7ebf00867deda5914f2e8b5da2cd5f55d6968ec4 was published and verified Ready on Vercel (deployment J29btsNW1fzFNb3o2CzeRV1xhtXK). A follow-up revision adds the Overview header, visible cash-flow chart, robust CSV parsing, and web Settings corrections. Vercel project `yorbit/yorbit-life-os` serves the app and follows GitHub `yosefhamdi1998-source/yorbit-life-os`, production branch `master`. Verified live baseline: `7fe70fe9cf5b6c6f82d0f8cf2c3111abf4539078`.

Supabase project: `pvjiialxboslqyiiybpe`. Supabase Edge Functions require a separate deployment from Vercel. No production database rows or schema were changed in this revision.

1. Git Credential Manager authorization is complete. Publish with the explicit GitHub remote and credential.helper=manager, then verify the Vercel production deployment.
2. Verify Yorbit's Stripe account, live prices, webhook secret/delivery, successful checkout, entitlement activation, and cancellation with a test account before advertising paid subscriptions. Mocked tests do not establish billing readiness. Review tax obligations and Stripe Tax registrations before enabling tax collection. Repeated-trial handling and event ordering still need verification. Do not treat the local checkout changes as a complete billing launch.
3. iOS store distribution remains unfinished: APP_STORE_ID and REVENUECAT_API_KEY are blank. This does not prevent a web release. Store credentials, product configuration, and device purchase/restore tests are required only for an App Store release.
4. Perform final signed-in smoke checks on the deployed site. Do not run destructive tests against personal financial records.

This is an implementation pass, not a claim that every security, banking, billing, or store-release condition has been independently audited. The original source folder and older iCloud backups were preserved. This file supersedes older status reports for this revision's status.

## Backup note

The legacy backup script exports a Claude transcript and regenerates older PDF narratives. It was not used to overwrite the existing iCloud/Desktop backups for this Codex revision. A separate source-only archive is generated from this commit; it contains no database backup or environment secrets.

## Stripe setup verified September 8

Existing account acct_1HpTrMA4mvP1HWCK is now named Yorbit, with user-confirmed unchanged owner and payout bank. Public name and descriptor YORBIT, app website/support/privacy/terms links saved. Account status shows no active tasks after descriptor correction. Product prod_VDzGpfGv4YTK15 created: monthly price_1UDXISA4mvP1HWCKCxoL3PcL ($4.99 USD), annual price_1UDXJiA4mvP1HWCKDQ18B5bX ($29.99 USD). These NEW IDs are not yet wired into deployed checkout. Supabase has NO STRIPE_SECRET_KEY or STRIPE_WEBHOOK_SECRET. Restricted-key form is prepared but NOT created; explicit security-access confirmation is pending. No live charge or subscription created.

Follow-up fixes: CSV preserves quoted commas, escaped quotes, multiline fields, BOM, and Venmo unnamed leading columns; rejects malformed quotes and duplicate headings. Import dedup includes income/expense type; existing-record load failure stops safely. Web hides unavailable App Store rating and Apple restore; sharing has clipboard fallback; privacy wording reflects provider use and AI consent. Removed cash-flow Improving/Slipping badge because partial/unequal windows made it unreliable. Targeted CSV tests and lint/build pass.

## Latest verified release: ee95d83 (September 8, 2026)

Production deployment 8Qme7s6jKCSUU4wQyspt4LfkQpVa is Ready. The real /budget page shows the new starter-budget draft; existing limits remain unchanged. No production budget was saved during verification.

- be3999f: interactive chart period details with income/spending totals, categories, transactions, exact-range links, and accessible period selector. Desktop and phone fixture checks passed.
- bf3d224: Home reorganized into Money overview, Next steps, Your plan, Spending insights, and Activity/goals. Compact budget preview and one overview date dropdown. Verified live.
- ee95d83: reviewable starter budgets from prior recorded months, editable limits, existing-category preservation, free-plan cap, income-reference warning, duplicate-click guard and fresh budget check. Synthetic save verified. Starter-budget tests, lint, and production build passed.

Starter-budget limits: this is a draft requiring review, not an automatically saved budget after bank connection. Missing imports can distort the income reference. It excludes the earliest recorded month and averages up to three subsequent previous calendar months, including empty gaps. Budget remains anchored to the newest transaction month. Banking lifecycle, billing lifecycle, and App Store release still require work.

Billing remains disconnected. Automatic approval review rejected selecting the restricted Stripe permissions despite earlier conversational approval; a precise permission question is pending. No key was created, no secret stored, and no charge made in this step. Approved scope requested: Customers, Customer Portal and Checkout Sessions Write; Products, Prices and Subscriptions Read, stored only in Yorbit Supabase. Do not claim that frontend publication deploys Supabase functions.

## Appearance and Simple mode follow-up

Implemented stronger selected-hue surfaces in dark and light mode, theme-aware primary text, and themed mobile navigation surfaces. Simple mode now uses Home/Money/Plan, Budget/Bills subnavigation, a shorter Home with three recent transactions, and a collapsed More tools menu retaining access to investments, Coach, goals and other tools. Full mode keeps the detailed chart experience. Added explicit switch labels.

Starter-budget planning income is editable without altering imported transactions. It is a temporary draft assumption, clearly disclosed, not saved income or a bank balance. The over-plan notice does not prevent saving.

Verified synthetic planning-income warning update, Simple mode switch and persistence after navigation, expandable tools, restoration of full mode, Rose dark desktop at 1440px, phone at 390px, and Gold light phone. Lint, starter-budget checks and production build passed. This does not certify every app button, banking lifecycle or billing flow; those remain under review.

## Settings and transaction checks

Verified all nine themes through visible settings controls in both light and dark mode. Verified deletion dialogs open and Cancel works; account deletion requires typed confirmation. No deletion executed. Sample merchant search reduced the displayed rows correctly, and a $25 sample expense increased displayed spending by $25 (fixture only). Browser date clearing retained its date, so missing-date validation was separately verified against the actual validator function, alongside valid/negative/over-limit inputs.

Fixed checkout return messaging to use verified subscription state, await AI-consent refresh, and avoid claiming nothing was deleted after an uncertain network result. Added accessible transaction amount/date/category and custom range labels, missing-date validation, and themed transaction button foreground.

Appearance/Simple release e576993 verified Ready in Vercel deployment D14qk5FkV45T3oAtoUq6E5GVUGca. Broader full-flow banking, billing, export completeness and security checks remain outstanding.

## Live database hardening and bill checks

Applied and recorded migrations 20260908234125_pin_function_search_paths and 20260908234547_restrict_subscription_writes. Six mutable-search-path warnings cleared; pure classifier and timestamp trigger tests passed using a rolled-back temporary table. Found client-writable subscription entitlements: revoked client writes and removed insert/update/delete policies. Owner SELECT and service_role billing writes remain. Tested an UPDATE with WHERE false as authenticated: correctly denied, reads still work. No user financial rows changed.

Read-only audit found RLS enabled on all 33 public tables. All 16 SECURITY DEFINER functions deny anonymous execution; five allow signed-in calls and their definitions contain owner filters. This is not a full adversarial RLS test. Remaining advisors: pg_net extension location, five deliberately exposed definer functions needing deeper review, leaked-password protection disabled. Remediation references: https://supabase.com/docs/guides/database/database-linter?lint=0014_extension_in_public and https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection .

Sample bill paid/unpaid round-trip restored due totals and overdue counts correctly. Added bill form/range accessible labels. Vercel 9abfc66 contains settings and transaction corrections; verify final release before claiming current HEAD live.
