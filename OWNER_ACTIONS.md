# Yorbit owner actions

Updated September 28, 2026. The sandbox portal release and native Supabase Auth redirect are complete. Do not repeat their approvals or setup. The fixed five-item launch scope is APP_STORE_READINESS.md; exact evidence is LAUNCH_STATUS.md and YORBIT_PROGRESS.md. No paid launch, signed build or App Store submission is claimed.

Never paste keys, passwords or tokens into chat, source or reports. Codex handles implementation, configuration checks and permitted testing after the required access exists.

## 0. Check that sign-up and password-reset emails can reach users (found September 30)

The live Auth settings (public endpoint, read September 30) show sign-up open, email confirmation required (mailer_autoconfirm false) and email as the only sign-in method. Supabase's built-in email service "will refuse to deliver messages to addresses that are not part of the project's team" unless a custom SMTP server is configured, and sends at most 2 per hour (https://supabase.com/docs/guides/auth/auth-smtp). If no custom SMTP is set, every real user's confirmation and password-reset email is dropped and they can never sign in. Hosted signup/email delivery has never been tested.

1. Codex, read-only: whether custom SMTP is enabled (Authentication > Emails > SMTP Settings), and run `scripts/launch-readonly-checks.sql` once. It returns counts and names only (tested against the real table definitions; writes nothing): confirmed vs unconfirmed users and recent confirmations; disconnected accounts still holding a bank credential (LAUNCH_STATUS legacy item); bank connections by state and last sync; subscription rows by provider/status; whether the Vault scheduler secret exists; and the recorded versions of the September 27 migrations.
2. If custom SMTP is not configured, you decide:
   - **Recommended:** set up a transactional email provider and enter its SMTP details yourself in Authentication > Emails > SMTP Settings (never in chat). Most providers require a sending domain you own and can add DNS records to; yorbit-life-os.vercel.app cannot be verified as a sender. Choosing a provider or plan and buying a domain are yours.
   - Or, temporarily, turn off "Confirm email". Sign-up then works without email, but anyone can register with someone else's address and password reset still cannot reach users.
3. After configuring, Codex tests sign-up confirmation and password reset end to end with a disposable inbox you control.

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

Choose ONE of these (both tested against real Postgres; neither is applied):

- **Option A - copy the legacy key (no deploy approval needed).** In Supabase Vault, add cron_service_role_jwt containing the complete legacy service_role JWT from the project's Legacy API keys screen. Codex then runs scripts/cron-auth-fix.sql. If legacy keys are unavailable, use option B; do not paste any credential here.
- **Option B - nobody copies a key (needs one approval).** Supabase's documented pattern for calling a function with the new secret keys is verify_jwt = false plus a key check in the function, which requireSystemCaller now does against SUPABASE_SECRET_KEYS (since this commit; inert while the gateway check is on). Approve deploying sync-all-accounts and generate-subscription-reminders with verify_jwt = false (Codex sets it for those two in config.toml and deploys). Codex then runs scripts/cron-auth-fix-secret-key.sql, which copies the sb_secret_ key the reminders job already holds into Vault inside the database, without anyone seeing it. If that key turns out to be revoked or truncated, the dry run below fails with 401 and you add a current secret key to Vault as cron_secret_key instead.

Either way, Codex then runs scripts/cron-auth-verify.sql through the exact scheduled authentication path (it sends whichever Vault secret the job uses). The expected dry run is HTTP 200 with dry_run/authenticated true and no bank request or financial write. Restoring schedules permits later real execution, so that actual execution remains separately controlled. The weekly AI job stays unchanged. No claim of restored automatic sync until authorized execution evidence exists.

## 3. Apple/Mac and RevenueCat access

Apple membership is not yet available, as previously confirmed. Owner supplies or arranges:
- Developer account/entity, app.yorbit ownership, Apple Team ID/App Store app ID and signing access.
- A Mac is not required: codemagic.yaml builds, signs and uploads to TestFlight on Codemagic's Macs (its personal plan has included free monthly macOS build minutes; confirm current terms before signing up, and it creates no cost unless you choose a paid plan). Owner creates the Codemagic account, connects this GitHub repo, adds the app_store_credentials group and uploads the Apple distribution certificate/profile as listed at the top of codemagic.yaml. An iPhone (and an iPad while the app is universal) with TestFlight is still needed for device testing. A Mac remains useful for swcutil universal-link debugging (NATIVE_BANK_RETURN.md step 6) but is not on the critical path.
- Apple agreements, tax, banking/trader and business/legal answers personally. No membership or paid service has been purchased.

RevenueCat source and endpoints are prepared, not purchase-verified:
- Configure Apple products app.yorbit.pro.monthly / app.yorbit.pro.yearly, offering and entitlement pro, and the public Apple SDK key for the native build.
- Securely save REVENUECAT_SECRET_API_KEY and REVENUECAT_WEBHOOK_AUTH in Supabase secrets. Both names were absent September 28. The secret key must be a **V1** key (RevenueCat Project settings > API keys > + New, version **V1**): the server calls RevenueCat's v1 subscribers endpoint, which a V2 key cannot use, so every confirmation would fail.
- This server half does not need Apple. A RevenueCat project (free), the V1 secret key, the `pro` entitlement and the webhook can be set up now; Codex can then verify the real server path by granting a short promotional `pro` entitlement to a disposable test account through RevenueCat's API and confirming revenuecat-sync shows Pro and then removes it, plus RevenueCat's "Send test event" to the webhook. Apple products and a real purchase still need item 3's Apple access.
- Set the matching webhook Authorization header in RevenueCat for https://pvjiialxboslqyiiybpe.supabase.co/functions/v1/revenuecat-webhook .
- revenuecat-sync v1 and revenuecat-webhook v1 are already deployed and sandbox-approved. Do not redeploy merely to repeat that work.

Supabase Auth is DONE: exact app.yorbit://auth/callback is saved alongside existing web redirects; callback tests passed. It still needs sign-in/recovery testing in the signed app.

Codex's next work after access: signed build, native purchase/restore/server confirmation and device journeys covering auth, imports, exports/share sheet, keyboard/safe areas, offline/recoverable errors and deletion. Use synthetic accounts and provider sandboxes.

## 4. Native bank-return registration

Owner supplies the actual Application Identifier Prefix for app.yorbit (usually the Apple Team ID; confirm against the App ID/profile). Android release signing fingerprint is needed only for an Android release.
- Plaid dashboard must allow https://yorbit-life-os.vercel.app/bank-oauth-return . (Do not register an Android package yet: the Android project still builds as app.moneyglow and is not release-ready; see LAUNCH_STATUS.md.)
- Apple App ID needs Associated Domains for applinks:yorbit-life-os.vercel.app.
- The iOS entitlement and guarded association generator are now implemented. Codex uses the supplied prefix to generate/deploy the exact association, verify its direct HTTPS response and test the signed app. The native pipeline checks this before building. Details: NATIVE_BANK_RETURN.md.
- Until associated correctly, an OAuth bank return can land on the fallback return-to-app page rather than resume automatically.

### Plaid Sandbox for synthetic bank testing (code in 27c64e4, not deployed)
Every Plaid call was production-only, so bank linking, the native OAuth return, sync, disconnect and deletion could only be tested with a real bank login. Since 27c64e4, listed test accounts can link Plaid Sandbox banks; real users' connections are unchanged.
1. Plaid Dashboard > Developers > Keys: copy the **Sandbox** secret. Save it in Supabase Edge Function secrets as PLAID_SANDBOX_SECRET (never in chat).
2. Save PLAID_SANDBOX_EMAILS in the same place: the exact disposable test and reviewer addresses (comma-separated). Unset = nobody.
3. Confirm https://yorbit-life-os.vercel.app/bank-oauth-return is an allowed redirect URI for Sandbox as well as Production.
4. Codex reviews and redeploys plaid-create-link-token, plaid-exchange-token, plaid-sync-transactions, plaid-sync-holdings, plaid-disconnect-account and delete-account, then tests link/sync/disconnect/delete on a listed disposable account using Plaid's public test login (user_good / pass_good), including an OAuth test bank for the native return once the app is signed.

## 5. Privacy, AI and reviewer decisions

- AI native-origin/financial-context deployment remains a separately unresolved decision. No financial payload has been sent to Anthropic in this work; funding/service health is not independently verified. Do not promise the paid AI allowance is live before the approved deployment and tests.
- Review the concrete factual privacy corrections in APP_STORE_SUBMISSION.md: hosted CSV records, backend bank tokens, actual payment/diagnostic providers, limited reset versus full deletion, and user-directed export copies. Final App Store privacy answers must match the signed archive and active services.
- Confirm the monitored support contact, reviewer access and legal/business answers. Codex can prepare the dedicated empty reviewer account and guarded synthetic seed once account access is settled; provide reviewer credentials only through App Store Connect. Seed grants no Pro by itself.
- Codex prepares screenshots/reviewer notes matching verified signed iPhone/iPad behavior; owner completes legal questionnaires and authorizes submission. Apple decides approval.

## Completed work that needs no owner repetition

Bank endpoint/migration deployment, hosted synthetic disconnect/ownership, free-account deletion with session rejection/isolation, portal v2 auth/configuration checks, and exact native Supabase callback registration are complete. Paid-account/provider/device lifecycle remains unverified; passing local tests is not a substitute.

Canonical repository: C:/Users/Yosef/projects/yorbit-life-os, master on GitHub. One implementer, automations paused, no agents. Existing source and uncommitted work are preserved. Local/GitHub saving is separate from the previously blocked cloud-backup export; cloud copying is not a launch prerequisite.
