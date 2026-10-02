# Yorbit launch status
Updated September 30, 2026 (release-path fixes below; earlier: September 28 sandbox portal deployment and native authentication configuration). The finite five-item acceptance checklist is APP_STORE_READINESS.md. Replaces earlier readiness claims; the evidence trail is in YORBIT_PROGRESS.md. Owner steps are in OWNER_ACTIONS.md.

## Readiness decisions
| Release | Decision | Why |
|---|---|---|
| Paid web launch | **Not ready** | Custom email delivery is not configured despite required email confirmation. Billing has never run end to end. Approved sandbox Stripe and RevenueCat endpoints are deployed, but provider configuration is incomplete; real Stripe billing is deliberately disabled in code. AI allowance deployment remains pending. Cron credentials still need repair. Scheduled bank sync has not run since 2026-09-14. |
| TestFlight | **Not ready** | No signed build. Needs Apple team/signing, a macOS/Xcode build environment (local or Codemagic), remaining backend configuration, RevenueCat credentials, and native bank-return association. Supabase Auth callback registration is complete. |
| App Store submission | **Not ready** | Everything TestFlight needs, plus signed-device verification, a production reviewer account, the privacy policy update, final privacy answers, and the screenshots for the current universal iPhone/iPad target. A working website or passing build does not establish any of this. |

## What is deployed, and where
| Where | State |
|---|---|
| Web (Vercel, yorbit-life-os.vercel.app) | Source commit 32f1d1d has Vercel success at 2026-10-01T03:37:42Z: https://vercel.com/yorbit/yorbit-life-os/5pjSuND1e7BJX72Y5YFDxzz7uRnE . This correction changes backend source and documentation, not frontend behavior. Backend deployment and native readiness are recorded separately. |
| Supabase (bank release verified September 30) | plaid-create-link-token v12, plaid-exchange-token v12, plaid-sync-transactions v25, plaid-sync-holdings v12, plaid-disconnect-account v2 and delete-account v15 are ACTIVE with verify_jwt=true, deployed from 32f1d1d. Hosted anonymous POSTs return 401; native-origin preflights return 200 with the expected origin. No real-bank lifecycle was invoked. Prior billing deployments and migrations remain as recorded below; scheduler endpoints were not redeployed. |
| Committed, NOT deployed | ai-coach update (native-origin/financial-context approval unresolved). Live Stripe activation is intentionally gated off; sandbox provider configuration remains incomplete. No real provider transaction or bulk revocation was performed. |
| Native iOS | No signed build, no TestFlight, nothing submitted. The Xcode project now registers the Filesystem and Share plugins. |

## What was actually tested
The bank, Stripe and RevenueCat server suites use real local throwaway PostgreSQL 17.10, the real schema/migrations and handlers, with fake providers. The export and checkout suites use local fakes. These local tests do not establish provider end-to-end success. Hosted synthetic checks are listed separately below.
- **Bank disconnect** (26 checks; independently rerun by Codex): simultaneous sibling claims, observed lock contention, duplicates, cleanup/credential-read/provider failures leaving a visible retryable state, sync and reconnect races, client guard. Fails against the reported retry bug and without the lock.
- **Stripe webhook** (11 checks; all independently rerun by Codex after fbe2c5b): stale events after cancellation, replays for an old subscription, payment failure and recovery, unexpected statuses, concurrent duplicates, coexistence with App Store rows.
- **RevenueCat server verification** (13 checks; all independently rerun by Codex): header auth, trial, cancel at period end, grace period then expiry, replays after expiry, refund, transfer, aliases, unknown users, outages, 8/8 concurrent deliveries converging on one row, Stripe coexistence, and a sync that only touches the caller. Fails without the grace period, without concurrent-insert recovery, or ignoring a transfer's source.
- **Cron repair script**: the whole fix runs against real Postgres with stubbed cron/net - re-points bank sync and reminders to Vault with schedules kept, leaves the AI job untouched, and each rewritten job sends exactly the trimmed key.
- **Exports**: the save helper's web path, native path (exact bytes, 70 KB), dismissal and failures; web CSV/PDF and budget PDF exports confirmed in the fixture build.
- Full suite 64 scripts, strict lint, production build pass. Codex subsequently ran the existing enum validator against live metadata read through its connector: all 27 checks pass after the three migrations. The CLI itself remains unauthenticated.

## Scheduled jobs (diagnosed live, read-only, by Codex)
Bank sync's stored bearer is malformed or truncated; the reminders and weekly-analysis jobs hold non-JWT secret keys; retained responses are 401 UNAUTHORIZED_INVALID_JWT_FORMAT. Not a rotated key. scripts/cron-auth-fix.sql (Vault-sourced legacy service_role key) is ready for the two non-AI jobs; the AI job waits on its approval.

## Remaining implementation and verification
- October 2 access check (Claude): Supabase CLI still unauthorized; the session browser is signed in to none of Supabase, Stripe, RevenueCat, Resend, Codemagic or App Store Connect; getyorbit.com is not registered (Verisign RDAP 404, DNS NXDOMAIN). No configuration, test email, payment or deployment was possible or attempted. Codex's 32f1d1d (sandbox testers fail closed without the sandbox secret) reviewed: correct, nothing to change.
- Bank deployment and hosted synthetic disconnect verification are complete; no real Plaid revocation was tested. Remaining hosted checks: authenticated cron dry run after credential repair, RevenueCat sandbox purchase verification, and real-provider sandbox lifecycle checks.
- Billing end to end in Stripe test mode (checkout, replays, cancellation, payment failure, deletion) - blocked on secure sandbox key/price/webhook/test-email configuration. Sandbox deployment approval is resolved; real billing activation is not authorized.
- Signed-device verification: auth return, bank return, purchase/restore and server sync, export share sheet, keyboard/safe areas, offline recovery, deletion.
- Legacy disconnected accounts still holding live Plaid credentials: count read-only, then an authorized cleanup.
- Hosted end to end: real signup, cross-account sessions, bank sync, account deletion. Sign-up requires email confirmation and uses email only; unless custom SMTP is configured, Supabase delivers no confirmation or reset email to non-team addresses (OWNER_ACTIONS item 0). Unverified - possibly blocks every new user.
- Associated Domains / assetlinks files for the native bank return once the Team ID and signing fingerprint exist.
- iOS subscribers' Pro AI allowance works once ai-coach and RevenueCat are both deployed.
- Plaid Sandbox bank testing: the six bank functions are deployed from 32f1d1d. Securely configure PLAID_SANDBOX_SECRET/PLAID_SANDBOX_EMAILS, then verify link/sync/disconnect/delete on a listed disposable account.
- Scheduler repair: option A (legacy key in Vault) or option B (project secret key, verify_jwt off for sync-all-accounts and generate-subscription-reminders, needs approval); both scripts tested, neither applied (OWNER_ACTIONS item 2).
- Legacy disconnected accounts: Codex runs the read-only count first; the app hides disconnected accounts, so any that still hold a credential need an authorized system cleanup (none built until the count shows it is needed).
- Android is not release-ready and out of this App Store scope: it still builds as app.moneyglow with MoneyGlow strings, has no deep-link intent filter for the app.yorbit auth callback and no App Links for the bank return. A Play package name is permanent once published; rename before any Android release.

## September 30 release-path fixes (Claude; nothing deployed to Supabase)
Supabase CLI still unauthenticated; the built-in browser is not signed in to Stripe or Supabase. All work below is local code plus GitHub/Vercel; no provider, payment, bank, credential or production data was touched.
- **Plaid Sandbox for listed test accounts (27c64e4).** Every Plaid call was production-only, so the planned Plaid-Sandbox device/hosted verification of linking, the native OAuth return, sync, disconnect and deletion could not happen without a real bank login. Calls now route by the token's own environment prefix; new sandbox links only for PLAID_SANDBOX_EMAILS with PLAID_SANDBOX_SECRET; a sandbox item never uses the production secret. Deletion now checks every connection's configuration before revoking any bank. New test-plaid-environment; sandbox cases in bank-sync (39), disconnect SQL (27, real Postgres) and deletion; five mutants each fail a test. Production-path suites unchanged and passing. Initially source-only; the corrected September 30 Codex release below is now deployed.
- **Cloud iOS build shipped no Supabase project (fc4f5f3).** Codemagic builds without Vercel settings or the gitignored .env, so createClient would have thrown at launch in every signed build. Tracked public .env.production (URL + sb_publishable_ key only; environment values still win). Verified by building with .env moved aside: the entry file matches the live site's content hash (index-CAWadl42.js). check-native-release.mjs now requires these and refuses a secret/service_role key.
- **iOS pipeline could never make its first build (24a096c).** It used get-latest-app-store-build-number, which (per Codemagic's source) ignores TestFlight-only builds and prints nothing when none exist; the step treated that as fatal. Now get-latest-build-number, empty = first build (1), failed lookup still stops. Test runs the real YAML step with stubbed CLIs and fails on the old step.
- **Deletion dialog (c7fca5f)** no longer tells iOS users to use a subscription-management button that is hidden on iOS; it states that web subscriptions are canceled automatically (as the server does before deleting anything).
- **Sign-up email delivery is a possible blocker (36d27a2, OWNER_ACTIONS item 0).** Public Auth settings: sign-up open, confirmation required, email only. Supabase's built-in mailer refuses non-team recipients unless custom SMTP is configured. Not verifiable from here.
- **Unconfirmed users at login (17efe39)** now get an explanation and a resend for the address that failed instead of the bare "Email not confirmed". Fixture-browser verified; live in Login-B1E5oG3z.js.
- **Checkout return (59ffae1):** Settings re-checks the subscription every 3 s for ~30 s after ?success=1 instead of waiting for a click; fixture-browser verified both ways. Codex's purchase-confirmation/identity tests now run in `npm test`.
- **Owner-step corrections:** RevenueCat needs a **V1** secret key (the server uses the v1 subscribers endpoint) and its server half can be verified before Apple with a promotional entitlement; Plaid Sandbox steps; no Mac is required (Codemagic builds on its Macs); crash reporting is off everywhere today (no Sentry DSN in the live or cloud build) - decide before the privacy answers.
- Checked and fine: iOS Info.plist (iPad orientations, encryption flag, no camera-triggering file input), lockfile in sync for `npm ci`, pre-install pipeline scripts use only Node built-ins, stripe@14 resolves to its fetch/Web-Crypto build in Deno, Capacitor's template scheme/versioning match Codemagic's documented recipe.
- Later: read-only production facts script (4de1d4e), scheduler option B with no key handling (7aebe08), reviewer Pro via RevenueCat promotional entitlement (caef211).
- Final full suite 73 scripts (check:enums and CLI-backed SQL suites need the login), strict lint and production build pass. Vercel deployed each push.

## Evidence sources
- Work log: YORBIT_PROGRESS.md. Codex reviews: C:\Users\Yosef\Yorbit-Main-Handoff\2026-09-26\disconnect-review.md and ...\2026-09-27\codex-release-review.md.
- Supabase API keys (new keys are not JWTs): https://supabase.com/docs/guides/api/api-keys
- RevenueCat webhooks and customer info: https://www.revenuecat.com/docs/integrations/webhooks and https://www.revenuecat.com/docs/api-v1/customer-info-model
- Apple screenshot specifications: https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications/
- Apple review and account deletion: https://developer.apple.com/app-store/review/guidelines/ and https://developer.apple.com/support/offering-account-deletion-in-your-app/

## September 27 hosted bank verification
- Deployed six bank endpoints with JWT checks intact. Privileged claim/finalize RPCs are callable by service_role, not authenticated clients.
- Two disposable email/password users and one synthetic teller row (no provider credentials) tested the actual hosted HTTP endpoint: signed-in wrong owner 404, no JWT 401, owner disconnect 200/success, repeat 200/success. Ordinary-user dispatcher dry_run returned 403. No Plaid/Teller/Stripe/AI call occurred.
- Confirmed the fixture became disconnected, then removed both users and their fixture rows; remaining fixture users, profiles and bank rows are all zero. This was not signup/email-delivery or real-bank E2E verification.
- Local fixture browser: restored Disconnect button removed the synthetic row and showed the empty state. Focused bank UI test, lint and production build passed.
- Connector-assigned migration versions: atomic_bank_disconnect_claim 20260927212600; unique_stripe_subscription_rows 20260927213555; app_store_subscriptions 20260927213604. Claude renamed the source files to these exact deployed versions in fbe2c5b. The migrations are already applied; do not reapply them.


## September 27 takeover verification and billing configuration correction
- Independently confirmed GitHub commit 7847b30 has Vercel success; Supabase inventory still has create-checkout v3, stripe-webhook v2 and ai-coach v13. A frontend deploy does not deploy Edge Functions.
- Deployed revenuecat-sync v1 from the reviewed saved code, JWT verification enabled. Hosted anonymous and malformed-token POST requests return 401; native-origin OPTIONS returns 200 with capacitor://localhost allowed. Authenticated no-configuration behavior is covered locally, not claimed as a live 501 check. No purchase or RevenueCat API request was made.
- Found and reproduced a remaining billing configuration defect: identical monthly/yearly price IDs were accepted, making price-to-plan mapping ambiguous and potentially selecting the wrong billing interval. Shared configuration now rejects duplicate or malformed overrides without falling back to live defaults. Regression failed before the fix, passed afterward; checkout handler assertions verify Stripe is never called on bad settings. This correction is deployed in create-checkout v4 and stripe-webhook v3 after sandbox-only approval and the live-billing code lock below.
- Stripe checkout, 11 Stripe webhook SQL cases and 13 RevenueCat SQL cases independently passed. The 64-script full-suite/build claim is Claude's recorded evidence; Codex did not repeat that broad run. No signed-device or real-provider E2E claim is made.


## Final backend release and hosted evidence
- Owner explicitly approved the reviewed Stripe checkout/webhook and RevenueCat webhook deployments and disposable sandbox lifecycle tests once credentials are configured. This did not approve live charges, AI processing or real-bank changes.
- Automatic approval review rejected the original checkout release because it could activate live subscriptions after a later secret change. A safe narrower release (34b575a) sets LIVE_BILLING_ENABLED=false in shared code. Both live key types stay at 501 even with otherwise valid settings; no Stripe session or webhook entitlement write occurs. Changing secrets alone cannot enable real billing. Checkout and all 11 webhook SQL checks passed with this boundary, as did strict lint.
- Successfully deployed create-checkout v4, stripe-webhook v3, revenuecat-sync v1 and revenuecat-webhook v1. JWT remains required on user endpoints; Stripe signatures / constant-time RevenueCat header authentication protect the webhooks once configured.
- Actual hosted checks: disposable-user password sign-in succeeded, anonymous checkout 401, signed-in checkout with deliberately invalid input 501, unsigned Stripe webhook 501, RevenueCat webhook 501. This establishes current disabled/incomplete configuration, not a working payment flow. Prior v3 checkout's sole 501 branch confirmed STRIPE_SECRET_KEY was absent without reading its value. No secret was retrieved or configured.
- Removed the disposable user; auth users, profiles, subscriptions and rate-limit counters for that fixture are all zero. No provider call, checkout session, real payment, real bank mutation or AI processing occurred.


## Current five-item completion batch
Purchase/restore confirmation now waits for an account-bound server result and reports a recoverable pending state on errors/timeouts. Reviewer seeding is corrected and guarded against existing-account overwrite, with local real-schema verification. Native export privacy reason C617.1 is present and parses. Focused tests, strict lint and production build pass. Hands-on synthetic browser checks cover purchase pending, restore pending on Upgrade/Settings, and confirmed navigation. Public privacy wording remains a prepared owner-review draft. No Apple/device/provider lifecycle result is invented. APP_STORE_READINESS.md is the fixed acceptance checklist; completion/deployment evidence for this batch is in C:/Users/Yosef/Yorbit-Main-Handoff/2026-09-27/five-item-release.md. No backend redeploy or credential change was needed for these client/source fixes.


## September 27 deletion follow-through
- Deployed delete-account v14, ACTIVE, verify_jwt=true. Only the handler changed; its five deployed shared dependencies were unchanged. Non-POST requests now return 405 before auth/data work. Finalized disconnected accounts with no credential need no Plaid configuration; retained credentials and lookup failures still fail closed. The fictional reviewer holdings account is now marked disconnected.
- Local failing-first regression reproduced the disconnected/no-config refusal before the fix. Account deletion, reviewer seed on real disposable Postgres, Plaid token handling, edge auth, JWT config, deletion coverage and strict lint pass.
- Hosted password sign-in and HTTP checks passed using two new synthetic free accounts: GET 405 with records preserved; POST 200 including a token-free disconnected holding; old session rejected (Auth 403, endpoint 401), refresh rejected (400); second user's data/session preserved; second user's endpoint cleanup 200. Database confirms zero fixture users, profiles, transactions, notes, subscriptions, accounts, holdings and rate counters.
- Hosted RLS rollback-only fixture report: 15 checks, zero failures. No fixture rows persisted. This covers the selected ownership/RPC paths, not every table or feature.
- No bank/provider call, paid subscription cancellation, Apple purchase, signup email, native UI or signed-device test occurred. Hosted free-account deletion is now verified; actual paid/provider lifecycle remains pending.
- Vault name-only check: cron_service_role_jwt still absent. No credential value read or changed. Automations remain paused.


## September 28 subscription-management follow-through
Prepared portal endpoint now applies the existing sandbox-only/tester policy, without blocking cancellation on missing checkout price settings. Settings rejects late portal responses after an account switch or sign-out, including away-and-back. Both failures were reproduced first. Targeted portal/checkout/account-isolation/auth-config tests, strict lint and production build pass. Synthetic Settings browser verified recoverable failure, retry and support navigation. Subsequent owner instruction resolved the portal release approval; portal v2 is now deployed and hosted checks are recorded below. No real portal session, payment or new credentials. Frontend source/build: index-VD62Lpra.js / Settings-lBHrW3tT.js; final GitHub/Vercel evidence goes in the local checkpoint.


## September 28 completed deployment and live configuration
- create-billing-portal v2 is ACTIVE with verify_jwt=true; bundle 0d5fee39b10eb71e2dfd5c54a14f2a085f61dfdeb96fbf00ee9133f819a774dc. Existing sandbox/tester policy rejects live or unrecognized keys and unlisted accounts before customer lookup/provider calls. Specific portal deployment approval is resolved.
- Hosted checks using one new disposable synthetic user: password sign-in 200, anonymous portal POST 401, authenticated GET 405, native-origin OPTIONS 200, authenticated deliberately invalid POST 501. The 501 confirms unavailable/denied configuration, not working Stripe billing. Fixture auth user/profile/subscription/rate-counter cleanup confirmed zero; no Stripe customer or session created.
- Supabase Auth now includes exact app.yorbit://auth/callback alongside both existing web redirect patterns; saved UI confirmation and total of three URLs verified. The native PKCE callback regression suite passes. No auth email or signed-device flow was tested.
- Live Edge Function secret NAME inventory: STRIPE_SECRET_KEY, STRIPE_PRICE_PRO_MONTHLY, STRIPE_PRICE_PRO_YEARLY, STRIPE_TEST_CHECKOUT_EMAILS, REVENUECAT_SECRET_API_KEY and REVENUECAT_WEBHOOK_AUTH are absent. STRIPE_WEBHOOK_SECRET exists; its sandbox match is unverified. No secret values were read. Vault name-only recheck still shows cron_service_role_jwt absent.
- Connected Stripe account inventory exposes only a live Yorbit account, no sandbox. Owner must connect a sandbox through Stripe's account-access screen before implementer-managed sandbox setup can proceed. No live Stripe changes were made.
- Remaining work is provider setup and actual sandbox lifecycle, scheduler authentication, signed Apple/device/reviewer evidence and unresolved AI/privacy decisions. These are not proof that no further engineering defects will be found.


## September 28 iOS bank-return source preparation
The iOS target lacked an Associated Domains entitlement even though its callback handler existed. Added the exact production applinks domain to App.entitlements, wired both Debug/Release signing settings and capability metadata, and added a guarded association generator plus direct-HTTPS preflight in the manual native build. This prepares the bank-return path without a sample Apple identity, real bank call, native build or paid CI run. The actual app identifier prefix, matching Apple profile/capability, Plaid allowlist and signed-device return remain required. See NATIVE_BANK_RETURN.md. Sandbox account access and scheduler credential were rechecked and remain absent.


## September 30 Codex sandbox correction and email verification
- Reproduced a gap in the new Plaid test-account routing: a listed tester with no sandbox secret received a successful production link. Environment selection now depends on tester membership alone; missing/blank credentials for that environment return 503 before any Plaid call. Sandbox link/exchange no longer requires a production secret. Existing-item reconnect stays in its stored token environment and ownership checks remain intact.
- Focused tests cover absent/blank credentials, sandbox-only link/exchange (including the native redirect), default production routing, unlisted-user refusal and existing-item routing. The regression failed before the fix and passed after it. Bank sync (39 scenarios), exchange privacy/cleanup, native bank return/CORS, account deletion and JWT configuration checks pass on synthetic fixtures. No real bank/provider action or signed-device result is claimed.
- Confirmed email-delivery blocker in the live dashboard: confirmation ON, custom SMTP OFF, no Auth Hooks. OWNER_ACTIONS item 0 now gives the finite provider/domain setup and disposable-inbox verification sequence; do not turn off confirmation as the default workaround.
- The six Plaid-related backend functions were subsequently deployed together from 32f1d1d, all ACTIVE with JWT verification enabled; Vercel itself does not deploy Edge Functions. Scheduler authentication, live billing and real-bank cleanup were not changed. Local operational counts remain in the private checkpoint rather than the public work log.

- Final check for this correction: strict lint passed with zero warnings. No frontend code changed; the broad suite and a local web build were not repeated.

- Completed bank release: create/exchange v12, transaction sync v25, holdings v12, disconnect v2, deletion v15. The disconnect suite also passed all 27 checks on real disposable PostgreSQL with fake providers. Hosted anonymous POST 401 and native CORS OPTIONS 200 passed for every function. This verifies deployed guards and preflight behavior, not authenticated Plaid Sandbox or real-bank end-to-end success. No bank record, credential, scheduler setting or real provider connection was modified by these probes.
