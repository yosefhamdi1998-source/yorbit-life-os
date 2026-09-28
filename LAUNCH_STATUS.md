# Yorbit launch status
Updated September 28, 2026 after subscription-management regression fixes. The finite five-item acceptance checklist is APP_STORE_READINESS.md. Replaces earlier readiness claims; the evidence trail is in YORBIT_PROGRESS.md. Owner steps are in OWNER_ACTIONS.md.

## Readiness decisions
| Release | Decision | Why |
|---|---|---|
| Paid web launch | **Not ready** | Billing has never run end to end. Approved sandbox Stripe and RevenueCat endpoints are deployed, but provider configuration is incomplete; real Stripe billing is deliberately disabled in code. AI allowance deployment remains pending. Cron credentials still need repair. Scheduled bank sync has not run since 2026-09-14. |
| TestFlight | **Not ready** | No signed build. Needs Apple team/signing, a Mac with Xcode 26, remaining backend configuration, RevenueCat credentials, and native redirect registration. |
| App Store submission | **Not ready** | Everything TestFlight needs, plus signed-device verification, a production reviewer account, the privacy policy update, final privacy answers, and the screenshots for the current universal iPhone/iPad target. A working website or passing build does not establish any of this. |

## What is deployed, and where
| Where | State |
|---|---|
| Web (Vercel, yorbit-life-os.vercel.app) | Last independently verified frontend: 5ba4dd0, Vercel success https://vercel.com/yorbit/yorbit-life-os/56sSDwp1uuKC3doJe3XnpPq8Vr5E ; public HTTP 200, index-CSKagJjX.js. It includes the native purchase/restore confirmation and reviewer/privacy-source preparation. This deletion follow-through changes backend/seed/tests/docs only; its final GitHub/Vercel status will be recorded in the local checkpoint. A web deployment does not ship the native binary. |
| Supabase (deployed and verified by Codex September 27) | plaid-disconnect-account v1, plaid-sync-transactions v24, plaid-sync-holdings v11, sync-all-accounts v10, plaid-create-link-token v11, delete-account v14; all ACTIVE with verify_jwt=true. create-checkout v4 and revenuecat-sync v1 are also ACTIVE with verify_jwt=true. stripe-webhook v3 and revenuecat-webhook v1 are ACTIVE with gateway JWT off and their provider authentication checks in the handlers. All three new schema migrations applied. |
| Committed, NOT deployed | create-billing-portal sandbox-only boundary awaits its separate deployment approval (v1 remains deployed); local regression tests pass. ai-coach update (native-origin/financial-context approval unresolved). Live Stripe activation is intentionally gated off; sandbox provider configuration remains incomplete. No real provider transaction or bulk revocation was performed. |
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
- Bank deployment and hosted synthetic disconnect verification are complete; no real Plaid revocation was tested. Remaining hosted checks: authenticated cron dry run after credential repair, RevenueCat sandbox purchase verification, and real-provider sandbox lifecycle checks.
- Billing end to end in Stripe test mode (checkout, replays, cancellation, payment failure, deletion) - blocked on secure sandbox key/price/webhook/test-email configuration. Sandbox deployment approval is resolved; real billing activation is not authorized.
- Signed-device verification: auth return, bank return, purchase/restore and server sync, export share sheet, keyboard/safe areas, offline recovery, deletion.
- Legacy disconnected accounts still holding live Plaid credentials: count read-only, then an authorized cleanup.
- Hosted end to end: real signup, cross-account sessions, bank sync, account deletion.
- Associated Domains / assetlinks files for the native bank return once the Team ID and signing fingerprint exist.
- iOS subscribers' Pro AI allowance works once ai-coach and RevenueCat are both deployed.

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
Prepared portal endpoint now applies the existing sandbox-only/tester policy, without blocking cancellation on missing checkout price settings. Settings rejects late portal responses after an account switch or sign-out, including away-and-back. Both failures were reproduced first. Targeted portal/checkout/account-isolation/auth-config tests, strict lint and production build pass. Synthetic Settings browser verified recoverable failure, retry and support navigation. Backend portal v1 remains deployed pending the specific approval; no real portal session, payment or new credentials. Frontend source/build: index-VD62Lpra.js / Settings-lBHrW3tT.js; final GitHub/Vercel evidence goes in the local checkpoint.
