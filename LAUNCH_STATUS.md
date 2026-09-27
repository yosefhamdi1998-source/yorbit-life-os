# Yorbit launch status
Updated September 27, 2026 (master 7f4d46f). Replaces earlier readiness claims; the evidence trail is in YORBIT_PROGRESS.md. Owner steps are in OWNER_ACTIONS.md.

## Readiness decisions
| Release | Decision | Why |
|---|---|---|
| Paid web launch | **Not ready** | Billing has never run end to end (Stripe test-key approval unresolved). Corrected billing, entitlement, disconnect and cron code is committed but not deployed. Scheduled bank sync has not run since 2026-09-14. |
| TestFlight | **Not ready** | No signed build exists. Needs Apple account/team, signing, a Mac/Xcode 26 build, native auth redirect registration, and the backend above deployed. |
| App Store submission | **Not ready** | Everything TestFlight needs, plus signed-device verification, a production reviewer account, final privacy answers, and a device-family decision (see below). A working website or passing build does not establish any of this. |

## What is deployed, and where
| Where | State |
|---|---|
| Web (Vercel, yorbit-life-os.vercel.app) | master 7f4d46f, bundle index-CaKPW_Jf.js, verified live. Bank disconnect shows an honest "temporarily unavailable" state; the minified bundle contains no call to the undeployed disconnect function. |
| Supabase Edge Functions (last verified 2026-09-23) | plaid-sync-transactions v23, plaid-sync-holdings v10, sync-all-accounts v9, plaid-create-link-token v10 - all older than the committed fixes below. stripe-webhook v2 and ai-coach are older still. |
| Committed, NOT deployed | Migrations 20260927120000 (server-side disconnect) and 20260927130000 (one subscription row per Stripe subscription). Functions: plaid-disconnect-account (new), plaid-sync-transactions/holdings (shared sync guard), sync-all-accounts (authenticated dry run), plaid-create-link-token (reconnect guard), delete-account (disconnected accounts no longer block deletion), stripe-webhook (replay-safe; redeploy needs explicit approval), ai-coach (paid AI allowance; redeploy carries native-app origins, so it waits on the AI approval). |
| Blocker for all backend deploys | This environment's Supabase CLI has no login (401). Codex reports working read access through its own connector; deployment permission is not confirmed for either agent. |
| Native iOS | No signed build, no TestFlight, nothing submitted. |

## What was actually tested (September 27)
Against a real, local, throwaway PostgreSQL 17.10 (the production major version), with schema built from schema.sql plus the real migrations:
- **Bank disconnect** (scripts/test-disconnect-sql.mjs, 26 checks): the migration and the real Edge Function handler together; Plaid is a recording fake. Covers ownership, duplicate requests, 25/25 simultaneous sibling claims (exactly one revokes a shared Item), an observed advisory-lock wait, cleanup / credential-read / provider failures leaving a visible retryable state, sync and reconnect races, and the client-side guard. Fails against a migration with the reported retry bug and against one without the lock. The previously committed migration was shown to fail on every call (ambiguous columns).
- **Stripe webhook** (scripts/test-stripe-webhook-sql.mjs, 9 checks): real handler, fake Stripe. A stale event after cancellation no longer restores access; replayed events for an old subscription no longer overwrite a newer paid one; payment failure removes and recovery restores access; unexpected Stripe statuses no longer violate the CHECK constraint; 8/8 duplicate concurrent deliveries leave one row. The old handler fails the stale-event case.
- **Cron auth SQL** (scripts/test-cron-auth-sql.mjs): the read-only diagnosis classifies bearer formats without printing them; the fix's pre-check accepts only a complete service_role JWT. It caught a real bug in the fix (a pasted trailing newline).
- Unit/handler tests: paid-subscription AI allowance (fails against old code), sync refusing a mid-disconnect account, sync-all-accounts dry run, disconnect UI states, account deletion with a disconnected account. Full suite 62 scripts (check:enums excluded: needs live DB access; it will report drift until migration 20260927120000 is deployed), strict lint and production build pass.
- Browser (fixture build): the "Disconnect not finished / Retry disconnect" state renders and stays disabled under containment. 12 synthetic App Store screenshots captured and reviewed.

None of this used real accounts, real bank connections, real payments or production data.

## Remaining engineering, blocked or untested
- **Scheduled bank sync**: root cause not yet confirmed. The gateway error (UNAUTHORIZED_INVALID_JWT_FORMAT) means the stored bearer is not a JWT, and this project uses Supabase's newer non-JWT keys - so a pasted sb_secret_ key is the leading hypothesis, not a rotated key. scripts/cron-auth-diagnose.sql confirms it read-only; cron-auth-fix.sql and cron-auth-verify.sql are prepared. The reminders and weekly AI jobs use the same template and are probably failing too.
- **Billing end to end**: checkout, webhook delivery/replays in Stripe itself, cancellation, payment failure and subscribed-account deletion still need the approved test key and disposable accounts (OWNER_ACTIONS.md item 3).
- **iOS entitlements server-side**: App Store purchases are verified only in the app (RevenueCat). The server does not know about them, so iOS Pro users get the free AI allowance. Needs a RevenueCat server integration (webhook or REST, with a RevenueCat secret key) - engineering plus an owner credential.
- **Legacy disconnected accounts**: accounts disconnected by the old client-only path still hold live Plaid credentials. A new disconnect request (once deployed) or account deletion revokes them; a bulk revocation would change real connections and needs your authorization. Count them read-only first (OWNER_ACTIONS.md item 1).
- **Hosted end to end**: real signup, cross-account browser sessions, bank sync and account deletion in a disposable hosted environment remain untested.
- **Native**: signed build, device checks (auth return, bank return, keyboard/safe areas, purchases/restore, deletion), native bank-link redirect registration, Supabase auth redirect for app.yorbit://auth/callback.
- **Device family**: the Xcode target is universal (iPhone + iPad), which makes iPad screenshots mandatory and iPad review likely. Both screenshot sets exist; making it iPhone-only is a one-line change if preferred.
- **Listing**: APP_STORE_SUBMISSION.md was corrected against the app (no in-app trade import, real navigation, Pro includes Coach). Privacy answers remain a draft to reconcile against the signed build. The Home screenshot shows a negative synthetic savings rate and Invest shows $0 trading activity - honest, not flattering.
- **AI**: native-origin AI deployment remains pending your approval; no financial payload was sent to Anthropic.

## Evidence sources
- Work log: YORBIT_PROGRESS.md. Codex's disconnect review: C:\Users\Yosef\Yorbit-Main-Handoff\2026-09-26\disconnect-review.md.
- Supabase API keys (new keys are not JWTs): https://supabase.com/docs/guides/api/api-keys
- Apple screenshot specifications: https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications/
- Apple upload requirements: https://developer.apple.com/news/upcoming-requirements/
- Apple review and account deletion: https://developer.apple.com/app-store/review/guidelines/ and https://developer.apple.com/support/offering-account-deletion-in-your-app/
