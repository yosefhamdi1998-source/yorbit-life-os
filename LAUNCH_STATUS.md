# Yorbit launch status
Updated September 27, 2026 (master 2e5cf70). Replaces earlier readiness claims; the evidence trail is in YORBIT_PROGRESS.md. Owner steps are in OWNER_ACTIONS.md.

## Readiness decisions
| Release | Decision | Why |
|---|---|---|
| Paid web launch | **Not ready** | Billing has never run end to end (Stripe test-key and webhook-redeploy approvals unresolved). Corrected disconnect, cron, webhook, entitlement and RevenueCat code is committed but not deployed. Scheduled bank sync has not run since 2026-09-14. |
| TestFlight | **Not ready** | No signed build. Needs Apple team/signing, a Mac with Xcode 26, the backend deployed, RevenueCat credentials, and native redirect registration. |
| App Store submission | **Not ready** | Everything TestFlight needs, plus signed-device verification, a production reviewer account, the privacy policy update, final privacy answers, and a device-family decision. A working website or passing build does not establish any of this. |

## What is deployed, and where
| Where | State |
|---|---|
| Web (Vercel, yorbit-life-os.vercel.app) | master 2e5cf70, bundle index-CehPRJHx.js, verified live. Exports use the new save helper; the iOS purchase flow asks the server to re-check RevenueCat. Disconnect still shows "temporarily unavailable"; the live bundle contains no call to the undeployed disconnect function. |
| Supabase (verified by Codex 2026-09-27) | plaid-sync-transactions v23, plaid-sync-holdings v10, sync-all-accounts v9, plaid-create-link-token v10, delete-account v12, stripe-webhook v2, ai-coach v13 - all older than the committed fixes. None of the three new migrations is applied; plaid-disconnect-account, revenuecat-webhook and revenuecat-sync do not exist there. |
| Committed, NOT deployed | Migrations 20260927120000 (disconnect), 20260927130000 (one row per Stripe subscription), 20260927140000 (App Store rows). Functions: plaid-disconnect-account, plaid-sync-transactions/holdings, sync-all-accounts (dry run), plaid-create-link-token, delete-account, revenuecat-sync, revenuecat-webhook (gateway JWT off: needs approval), stripe-webhook (needs approval), ai-coach (carries native-app CORS origins: waits on the AI approval). |
| Native iOS | No signed build, no TestFlight, nothing submitted. The Xcode project now registers the Filesystem and Share plugins. |

## What was actually tested
All against a real, local, throwaway PostgreSQL 17.10 with the schema built from schema.sql plus the real migrations, the real Edge Function handlers, and recording fakes for Plaid, Stripe and RevenueCat. No real accounts, payments, bank connections or production data.
- **Bank disconnect** (26 checks; independently rerun by Codex): simultaneous sibling claims, observed lock contention, duplicates, cleanup/credential-read/provider failures leaving a visible retryable state, sync and reconnect races, client guard. Fails against the reported retry bug and without the lock.
- **Stripe webhook** (10 checks; 9 independently rerun by Codex): stale events after cancellation, replays for an old subscription, payment failure and recovery, unexpected statuses, concurrent duplicates, coexistence with App Store rows.
- **RevenueCat server verification** (13 checks): header auth, trial, cancel at period end, grace period then expiry, replays after expiry, refund, transfer, aliases, unknown users, outages, 8/8 concurrent deliveries converging on one row, Stripe coexistence, and a sync that only touches the caller. Fails without the grace period, without concurrent-insert recovery, or ignoring a transfer's source.
- **Cron repair script**: the whole fix runs against real Postgres with stubbed cron/net - re-points bank sync and reminders to Vault with schedules kept, leaves the AI job untouched, and each rewritten job sends exactly the trimmed key.
- **Exports**: the save helper's web path, native path (exact bytes, 70 KB), dismissal and failures; web CSV/PDF and budget PDF exports confirmed in the fixture build.
- Full suite 64 scripts, strict lint, production build pass. check:enums needs live database access and will report drift until the new migrations are applied.

## Scheduled jobs (diagnosed live, read-only, by Codex)
Bank sync's stored bearer is malformed or truncated; the reminders and weekly-analysis jobs hold non-JWT secret keys; retained responses are 401 UNAUTHORIZED_INVALID_JWT_FORMAT. Not a rotated key. scripts/cron-auth-fix.sql (Vault-sourced legacy service_role key) is ready for the two non-AI jobs; the AI job waits on its approval.

## Unfinished engineering (all needs access, credentials, approval or a device - none is done)
- Deploy, then verify on the hosted project: versions and JWT gates, the RPCs, auth and ownership refusals, synthetic disconnect, the sync dry run, RevenueCat sync with a sandbox purchase. Only then enable Disconnect.
- Billing end to end in Stripe test mode (checkout, replays, cancellation, payment failure, deletion) - blocked on the test-key approval.
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
