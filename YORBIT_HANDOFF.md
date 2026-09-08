# Yorbit revision — September 8, 2026

## Product direction

Personal budgeting for variable income. The central experience is a weekly check-in: review recorded income and spending, see the unpaid bills due in the next seven days, and choose one next action. Preserve bank connections and transaction organization. Do not add bookkeeping, payroll, or another set of top-level tools.

## Implemented in this working copy

- Five primary destinations: Home, Money, Invest, Plan, Coach. Plan groups Budget, Bills, Recurring, and Goals. More is a grouped menu.
- Home loses the duplicate shortcut directory, score, and net-worth section. These financial records remain in their existing destinations. Trends are collapsed. The floating action menu no longer obscures mobile content.
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

No revision in this working copy has been published yet. Vercel project `yorbit/yorbit-life-os` serves the app and follows GitHub `yosefhamdi1998-source/yorbit-life-os`, production branch `master`. Verified live baseline: `7fe70fe9cf5b6c6f82d0f8cf2c3111abf4539078`.

Supabase project: `pvjiialxboslqyiiybpe`. Supabase Edge Functions require a separate deployment from Vercel. No production database rows or schema were changed in this revision.

1. Complete GitHub publishing authorization, then publish the verified code and check Vercel's resulting deployment. The old credential helper points to a missing gh.exe; the installed Git Credential Manager is available but requires authorization.
2. Verify Yorbit's Stripe account, live prices, webhook secret/delivery, successful checkout, entitlement activation, and cancellation with a test account before advertising paid subscriptions. Mocked tests do not establish billing readiness. Review tax obligations and Stripe Tax registrations before enabling tax collection. Repeated-trial handling and event ordering still need verification. Do not treat the local checkout changes as a complete billing launch.
3. iOS store distribution remains unfinished: APP_STORE_ID and REVENUECAT_API_KEY are blank. This does not prevent a web release. Store credentials, product configuration, and device purchase/restore tests are required only for an App Store release.
4. Perform final signed-in smoke checks on the deployed site. Do not run destructive tests against personal financial records.

This is an implementation pass, not a claim that every security, banking, billing, or store-release condition has been independently audited. The original source folder and older iCloud backups were preserved. This file supersedes older status reports for this revision's status.

## Backup note

The legacy backup script exports a Claude transcript and regenerates older PDF narratives. It was not used to overwrite the existing iCloud/Desktop backups for this Codex revision. A separate source-only archive is generated from this commit; it contains no database backup or environment secrets.
