# Yorbit owner actions

Updated September 28, 2026. The sandbox portal release and native Supabase Auth redirect are complete. Do not repeat their approvals or setup. The fixed five-item launch scope is APP_STORE_READINESS.md; exact evidence is LAUNCH_STATUS.md and YORBIT_PROGRESS.md. No paid launch, signed build or App Store submission is claimed.

Never paste keys, passwords or tokens into chat, source or reports. Codex handles implementation, configuration checks and permitted testing after the required access exists.

## 1. Connect the Yorbit Stripe sandbox

The connected Stripe account inventory currently exposes only live Yorbit access. Use the Stripe account-access link supplied in chat to connect the Yorbit sandbox/test environment, then tell Codex it is connected. If that session link expires, request a fresh account-access link. This changes access only; do not make a real payment.

With sandbox access, Codex can complete the supported sandbox catalog/portal/webhook setup. Owner-controlled account verification and secret entry remain yours:
- Confirm the existing planned prices: Yorbit Pro, USD $4.99 monthly / $29.99 yearly, two distinct recurring test prices.
- Complete required Stripe email/SMS/account verification yourself. Securely create the restricted TEST key: Checkout Sessions Write, Customers Write, Customer portal Write, Subscriptions Write, Products Read, Prices Read; everything else None.
- Save STRIPE_SECRET_KEY, STRIPE_PRICE_PRO_MONTHLY, STRIPE_PRICE_PRO_YEARLY and STRIPE_TEST_CHECKOUT_EMAILS in Supabase Edge Function secrets. The tester allowlist must contain exact disposable-test email addresses you control; share only those addresses, never keys.
- Match STRIPE_WEBHOOK_SECRET to the sandbox destination. A secret with this name already exists; its mode was not read or verified. Before replacing it, establish that no live subscription depends on it; otherwise isolate the sandbox in staging.
- Sandbox webhook destination: https://pvjiialxboslqyiiybpe.supabase.co/functions/v1/stripe-webhook ; events checkout.session.completed, customer.subscription.updated and customer.subscription.deleted.
- Sandbox customer portal: cancel at period end, return https://yorbit-life-os.vercel.app/settings.

Live name-only configuration check found the four Stripe settings above absent. The existing webhook-secret name is not proof of working billing.

Already deployed: create-checkout v4, stripe-webhook v3, create-billing-portal v2. Their sandbox deployments/testing are approved; no repeat approval is needed. LIVE_BILLING_ENABLED remains false. A test key alone is insufficient without correct test prices, webhook and allowlist.

Codex's next work after configuration: disposable monthly/yearly checkout; real sandbox signed webhook delivery/replay; Pro access; cancellation, expiry, failure/recovery and deletion with confirmed provider cancellation. Clean up sandbox users while the test key can still cancel their subscriptions. Only then prepare a separate live-billing release; current code cannot sell real subscriptions.

## 2. Supply the scheduler credential securely

September 28 Vault name-only check: cron_service_role_jwt is absent. Earlier hosted diagnosis found malformed/non-JWT cron bearers and HTTP 401; repair has not been performed.

Owner: in Supabase Vault, add cron_service_role_jwt containing the complete legacy service_role JWT from the project's Legacy API keys screen. If legacy keys are unavailable, tell Codex; do not substitute a newer non-JWT key or paste any credential here.

Codex then applies the tested scripts/cron-auth-fix.sql for bank sync/reminders and runs scripts/cron-auth-verify.sql through the exact scheduled authentication path. The expected dry run is HTTP 200 with dry_run/authenticated true and no bank request or financial write. Restoring schedules permits later real execution, so that actual execution remains separately controlled. The weekly AI job stays unchanged. No claim of restored automatic sync until authorized execution evidence exists.

## 3. Apple/Mac and RevenueCat access

Apple membership and Mac access are not yet available, as previously confirmed. Owner supplies or arranges:
- Developer account/entity, app.yorbit ownership, Apple Team ID/App Store app ID and signing access.
- Mac with the required Xcode/iOS SDK and iPhone/iPad tester access.
- Apple agreements, tax, banking/trader and business/legal answers personally. No membership or paid service has been purchased.

RevenueCat source and endpoints are prepared, not purchase-verified:
- Configure Apple products app.yorbit.pro.monthly / app.yorbit.pro.yearly, offering and entitlement pro, and the public Apple SDK key for the native build.
- Securely save REVENUECAT_SECRET_API_KEY and REVENUECAT_WEBHOOK_AUTH in Supabase secrets. Both names were absent September 28.
- Set the matching webhook Authorization header in RevenueCat for https://pvjiialxboslqyiiybpe.supabase.co/functions/v1/revenuecat-webhook .
- revenuecat-sync v1 and revenuecat-webhook v1 are already deployed and sandbox-approved. Do not redeploy merely to repeat that work.

Supabase Auth is DONE: exact app.yorbit://auth/callback is saved alongside existing web redirects; callback tests passed. It still needs sign-in/recovery testing in the signed app.

Codex's next work after access: signed build, native purchase/restore/server confirmation and device journeys covering auth, imports, exports/share sheet, keyboard/safe areas, offline/recoverable errors and deletion. Use synthetic accounts and provider sandboxes.

## 4. Native bank-return registration

Owner supplies Apple Team ID; Android release signing fingerprint is needed only for an Android release.
- Plaid dashboard must allow https://yorbit-life-os.vercel.app/bank-oauth-return ; Android package is app.yorbit when relevant.
- Apple App ID needs Associated Domains for applinks:yorbit-life-os.vercel.app.
- Codex can finish/verify the association files using those supplied identifiers and test the actual return in a signed app.
- Until associated correctly, an OAuth bank return can land on the fallback return-to-app page rather than resume automatically.

## 5. Privacy, AI and reviewer decisions

- AI native-origin/financial-context deployment remains a separately unresolved decision. No financial payload has been sent to Anthropic in this work; funding/service health is not independently verified. Do not promise the paid AI allowance is live before the approved deployment and tests.
- Review the concrete factual privacy corrections in APP_STORE_SUBMISSION.md: hosted CSV records, backend bank tokens, actual payment/diagnostic providers, limited reset versus full deletion, and user-directed export copies. Final App Store privacy answers must match the signed archive and active services.
- Confirm the monitored support contact, reviewer access and legal/business answers. Codex can prepare the dedicated empty reviewer account and guarded synthetic seed once account access is settled; provide reviewer credentials only through App Store Connect. Seed grants no Pro by itself.
- Codex prepares screenshots/reviewer notes matching verified signed iPhone/iPad behavior; owner completes legal questionnaires and authorizes submission. Apple decides approval.

## Completed work that needs no owner repetition

Bank endpoint/migration deployment, hosted synthetic disconnect/ownership, free-account deletion with session rejection/isolation, portal v2 auth/configuration checks, and exact native Supabase callback registration are complete. Paid-account/provider/device lifecycle remains unverified; passing local tests is not a substitute.

Canonical repository: C:/Users/Yosef/projects/yorbit-life-os, master on GitHub. One implementer, automations paused, no agents. Existing source and uncommitted work are preserved. Local/GitHub saving is separate from the previously blocked cloud-backup export; cloud copying is not a launch prerequisite.
