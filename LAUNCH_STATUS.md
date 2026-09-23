# Yorbit launch status
Verified September 23, 2026. This report replaces older launch-readiness claims, not the historical evidence in YORBIT_PROGRESS.md.

## Verdict
The website is live. Public paid launch and App Store submission are not yet verified ready. A Vercel deployment does not create an iPhone App Store release.

## Live and verified
- Web release ef26e4a deployed successfully through GitHub to Vercel. The production bundles contain account-bound import/export checks, holdings retry and separate currency totals.
- Profile authority: client attempts to change role, AI tier and profile identity are rejected; owner consent/onboarding and trusted service administration still work. Seven rollback-only database checks passed.
- Child ownership: messages must belong to an owned conversation; custom records cannot be moved into another user's form. Six rollback-only database checks passed. Existing mismatch counts were zero.
- Bank transactions v22: authorized failure cleanup, reconnect state, checked writes and bounded complete pagination. The bank screen exposes recoverable errors and keeps accounts visible on a failed disconnect.
- Holdings v9: complete snapshots replace one account's positions atomically using provider security IDs. Eighteen database checks passed, including a forced mid-insert failure, repeated/empty snapshots and account isolation. Previous holdings survive failed saves.
- Legacy administrator bulk cleanup v8 is disabled with HTTP 410. It cannot read or delete financial records.
- Production assets and backend source/JWT settings were checked. These are configuration and code-deployment checks, not a real bank connection or payment test.

## Validated release package; deployment evidence belongs in YORBIT_PROGRESS.md
- React Router updated to 7.18.4 for the upstream security fix. The current production-dependency audit reports zero advisories. Three moderate advisory entries remain in the native build tool chain through xcode/uuid; no forced downgrade or incompatible override was applied.
- Installed the Keyboard, SplashScreen and StatusBar plugins already referenced by native configuration. Capacitor iOS source/assets sync succeeded on Windows. Portable Swift paths are normalized after sync; native auth/plugin checks pass.
- The manual Mac build workflow now checks for Xcode 26 and iOS SDK 26 or later before building. Apple has required these upload minimums since April 28, 2026. No paid build or submission was triggered.

## Tested customer interactions
- Synthetic bank load retry, failed sync/reconnect, failed disconnect, and phone/dark layout.
- Home date filters, chart month drill-down, previous/next month and transaction navigation with matching synthetic totals.
- Settings synthetic export; Simple mode navigation; light phone layout; holdings load retry and separate EUR/USD totals.
- Transaction amount and blank-date validation using real keyboard input, plus form cancellation.
- Import parsing, review and confirmed import of exactly three sample-statement rows in the isolated in-memory fixture app; the result displayed September 1-3 and View Transactions preserved those dates. Account-change and dedup behavior also have actual-handler tests.
- The final combined full test suite, strict lint, production build and Capacitor source sync passed after the router and native packaging changes. This is not an iOS compilation or signing result.
- Browser screenshots showed capture resize artifacts. These checks do not establish physical-iPhone safe areas or keyboard behavior.

## Remaining engineering and end-to-end evidence
- Payment checkout, webhook ordering, entitlements, cancellation and subscribed-account deletion need a properly approved test-mode setup and end-to-end verification.
- Native bank linking still needs a verified supported return/deep-link flow and physical-device checks. Native authentication, offline/error handling, safe areas, keyboard and purchases require a signed build.
- Sync concurrency and abandoned syncing-state recovery remain to finish. Real signup, cross-account browser sessions, bank sync and account deletion remain untested in a disposable hosted environment.
- Privacy answers, reviewer login/data, screenshots and listing claims need verification against the signed release and current service configuration. Do not submit the draft listing as finished.
- AI origin-only deployment remains pending specific approval. No real financial test payload was sent to Anthropic.

## Evidence sources
- Full work log and coverage: YORBIT_PROGRESS.md.
- Apple upload requirements: https://developer.apple.com/news/upcoming-requirements/
- Apple review and account deletion: https://developer.apple.com/app-store/review/guidelines/ and https://developer.apple.com/support/offering-account-deletion-in-your-app/
- Router advisory: https://github.com/remix-run/react-router/security/advisories/GHSA-wrjc-x8rr-h8h6
