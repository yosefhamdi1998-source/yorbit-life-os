# Yorbit launch status
Updated September 27, 2026 after the Codex bank-backend deployment and hosted verification. Replaces earlier readiness claims; the evidence trail is in YORBIT_PROGRESS.md. Owner steps are in OWNER_ACTIONS.md.

## Readiness decisions
| Release | Decision | Why |
|---|---|---|
| Paid web launch | **Not ready** | Billing has never run end to end (Stripe test-key and webhook-redeploy approvals unresolved). Bank backend and all three schema migrations are deployed; webhook, AI allowance and RevenueCat endpoints remain pending. Cron credentials still need repair. Scheduled bank sync has not run since 2026-09-14. |
| TestFlight | **Not ready** | No signed build. Needs Apple team/signing, a Mac with Xcode 26, the backend deployed, RevenueCat credentials, and native redirect registration. |
| App Store submission | **Not ready** | Everything TestFlight needs, plus signed-device verification, a production reviewer account, the privacy policy update, final privacy answers, and a device-family decision. A working website or passing build does not establish any of this. |

## What is deployed, and where
| Where | State |
|---|---|
| Web (Vercel, yorbit-life-os.vercel.app) | This release restores Disconnect after hosted auth, ownership, synthetic disconnect and retry checks. Existing native export and RevenueCat client work is preserved. Production deployment evidence is recorded in the September 27 bank deployment handoff. |
| Supabase (deployed and verified by Codex September 27) | plaid-disconnect-account v1, plaid-sync-transactions v24, plaid-sync-holdings v11, sync-all-accounts v10, plaid-create-link-token v11, delete-account v13; all ACTIVE with verify_jwt=true. All three new schema migrations applied. |
| Committed, NOT deployed | revenuecat-sync, revenuecat-webhook, stripe-webhook and ai-coach. Existing Stripe/AI/webhook approvals and provider configuration remain unresolved. No real provider transaction or bulk revocation was performed. |
| Native iOS | No signed build, no TestFlight, nothing submitted. The Xcode project now registers the Filesystem and Share plugins. |

## What was actually tested
All against a real, local, throwaway PostgreSQL 17.10 with the schema built from schema.sql plus the real migrations, the real Edge Function handlers, and recording fakes for Plaid, Stripe and RevenueCat. No real accounts, payments, bank connections or production data.
- **Bank disconnect** (26 checks; independently rerun by Codex): simultaneous sibling claims, observed lock contention, duplicates, cleanup/credential-read/provider failures leaving a visible retryable state, sync and reconnect races, client guard. Fails against the reported retry bug and without the lock.
- **Stripe webhook** (10 checks; 9 independently rerun by Codex): stale events after cancellation, replays for an old subscription, payment failure and recovery, unexpected statuses, concurrent duplicates, coexistence with App Store rows.
- **RevenueCat server verification** (13 checks): header auth, trial, cancel at period end, grace period then expiry, replays after expiry, refund, transfer, aliases, unknown users, outages, 8/8 concurrent deliveries converging on one row, Stripe coexistence, and a sync that only touches the caller. Fails without the grace period, without concurrent-insert recovery, or ignoring a transfer's source.
- **Cron repair script**: the whole fix runs against real Postgres with stubbed cron/net - re-points bank sync and reminders to Vault with schedules kept, leaves the AI job untouched, and each rewritten job sends exactly the trimmed key.
- **Exports**: the save helper's web path, native path (exact bytes, 70 KB), dismissal and failures; web CSV/PDF and budget PDF exports confirmed in the fixture build.
- Full suite 64 scripts, strict lint, production build pass. Codex subsequently ran the existing enum validator against live metadata read through its connector: all 27 checks pass after the three migrations. The CLI itself remains unauthenticated.

## Scheduled jobs (diagnosed live, read-only, by Codex)
Bank sync's stored bearer is malformed or truncated; the reminders and weekly-analysis jobs hold non-JWT secret keys; retained responses are 401 UNAUTHORIZED_INVALID_JWT_FORMAT. Not a rotated key. scripts/cron-auth-fix.sql (Vault-sourced legacy service_role key) is ready for the two non-AI jobs; the AI job waits on its approval.

## Unfinished engineering (all needs access, credentials, approval or a device - none is done)
- Bank deployment and hosted synthetic disconnect verification are complete; no real Plaid revocation was tested. Remaining hosted checks: authenticated cron dry run after credential repair, RevenueCat sandbox purchase verification, and real-provider sandbox lifecycle checks.
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

## September 27 hosted bank verification
- Deployed six bank endpoints with JWT checks intact. Privileged claim/finalize RPCs are callable by service_role, not authenticated clients.
- Two disposable email/password users and one synthetic teller row (no provider credentials) tested the actual hosted HTTP endpoint: signed-in wrong owner 404, no JWT 401, owner disconnect 200/success, repeat 200/success. Ordinary-user dispatcher dry_run returned 403. No Plaid/Teller/Stripe/AI call occurred.
- Confirmed the fixture became disconnected, then removed both users and their fixture rows; remaining fixture users, profiles and bank rows are all zero. This was not signup/email-delivery or real-bank E2E verification.
- Local fixture browser: restored Disconnect button removed the synthetic row and showed the empty state. Focused bank UI test, lint and production build passed.
- Connector-assigned migration versions: atomic_bank_disconnect_claim 20260927212600 (local file 20260927120000); unique_stripe_subscription_rows 20260927213555 (local 20260927130000); app_store_subscriptions 20260927213604 (local 20260927140000). These exact saved migrations are already applied: reconcile this mapping before any future blanket CLI db push; do not reapply blindly.
