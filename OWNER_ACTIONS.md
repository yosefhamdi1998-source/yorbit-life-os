# Yorbit owner actions
Updated September 27, 2026 after the approved sandbox billing and RevenueCat deployments. Ordered by what unblocks the most. Nothing has been purchased, signed, paid, submitted, or revoked. Never paste a key, token or password into chat, code or a report.

## 1. Backend deployment status
Codex deployed and verified the bank backend through its existing connector; a new CLI login is not required to repeat that work. All three schema migrations are applied. Disconnect is restored in the accompanying frontend release after disposable hosted auth/ownership/disconnect/retry checks. See LAUNCH_STATUS.md for versions and migration-history mapping.

Now deployed: create-checkout v4, stripe-webhook v3, revenuecat-sync v1 and revenuecat-webhook v1. The user endpoints require JWT; webhooks validate their provider authentication. Owner sandbox deployment approval is resolved. Stripe is sandbox-only in code, and live hosted checks show billing/App Store provider configuration incomplete (501). Still pending: ai-coach and the configuration/device work below. No real App Store purchase has been verified. Local migration files were renamed in fbe2c5b to the versions production recorded (20260927212600/213555/213604), so the CLI sees them as applied. The separate approvals below remain unchanged. Do not redeploy the bank set or reapply migrations just because the CLI reports different timestamped filenames; first reconcile the recorded connector/source mapping.

Real Plaid revocation and legacy-account cleanup were not run. Keep real connections untouched until their specific authorized workflow. No new cleanup utility or generator is needed to repeat the completed bank deployment.

## 2. Fix the scheduled jobs' authentication
Confirmed by Codex's read-only diagnosis (2026-09-27): the bank job's stored bearer is malformed or truncated; the reminders and weekly-analysis jobs hold non-JWT secret keys; retained responses are 401 UNAUTHORIZED_INVALID_JWT_FORMAT. Not a rotated key.
1. In the dashboard, add a Vault secret named `cron_service_role_jwt` holding the **legacy** service_role key (API Keys, "Legacy API keys" tab; starts with eyJ). If legacy keys are disabled on this project, stop and tell me - that needs a different, code-level fix.
2. Run `scripts/cron-auth-fix.sql`. It refuses anything but a complete service_role JWT, then points bank sync and reminders at Vault, keeping their schedules, and leaves the weekly AI job untouched.
3. The sync-all-accounts dry-run code is now deployed. After credential repair, run `scripts/cron-auth-verify.sql`: a dry run through the job's exact auth path (no Plaid call, no write). Pass = 200 with `{"dry_run":true,"authenticated":true,...}`.
4. After the next 4-hourly run, re-run queries 3-4 of the diagnosis: 200 = all synced; 502 = partial failure with per-account results.
5. Decide separately whether to re-point the weekly AI job. Re-enabling it starts scheduled AI analysis of users' data.

## 3. HIGHEST PRIORITY: configure the deployed Stripe sandbox billing
The app's Stripe prices are live-mode prices, so a test key alone would fail at checkout. The deployed sandbox release requires two distinct valid test price IDs and only lets listed test accounts check out (otherwise anyone could get Pro free with Stripe's public test card on the live site). Do this yourself in the dashboards; never paste values into chat.
1. Stripe Dashboard: switch to a sandbox (account menu, top left; the account's test-mode sandbox is fine).
2. Product catalog: add product "Yorbit Pro" with two recurring USD prices, $4.99 monthly and $29.99 yearly. Note both price IDs (price_..., not secret).
3. Settings > Billing > Customer portal (still in the sandbox): save the configuration (cancel at period end, return URL https://yorbit-life-os.vercel.app/settings).
4. Workbench > Webhooks > Create an event destination > Your account > events checkout.session.completed, customer.subscription.updated, customer.subscription.deleted > Webhook endpoint > URL https://pvjiialxboslqyiiybpe.supabase.co/functions/v1/stripe-webhook. Reveal its signing secret (whsec_...).
5. API keys > Create restricted key ("building your own integration"): Checkout Sessions Write, Customers Write, Customer portal Write, Subscriptions **Write** (account deletion cancels subscriptions), Products Read, Prices Read, everything else None. Complete Stripe's email/SMS verification yourself; copy the rk_test_ key.
6. Supabase Dashboard > Edge Functions > Secrets: set STRIPE_SECRET_KEY (the rk_test_ key), STRIPE_WEBHOOK_SECRET (the sandbox whsec_; before replacing existing secrets, confirm live billing is disabled and no active live subscriptions depend on this endpoint; otherwise use a separate staging environment), STRIPE_PRICE_PRO_MONTHLY, STRIPE_PRICE_PRO_YEARLY, and STRIPE_TEST_CHECKOUT_EMAILS = one or two exact addresses you control (e.g. plus-addresses of your inbox) that the disposable test users will use.
7. Tell Codex the sandbox settings are saved and identify the exact approved test email addresses (no keys). The deployments and disposable sandbox lifecycle are already approved; they do not need another deployment approval. Keep public test checkout closed except to those exact emails. Current hosted 501 responses are evidence of incomplete configuration, not successful checkout.

Later, after the sandbox lifecycle passes: request a separate approved live-billing code release. LIVE_BILLING_ENABLED is false in 34b575a; replacing keys alone cannot enable real subscriptions. Review live products/prices and webhook settings during that release. Delete sandbox subscription users while the test key is still configured, because a live key cannot cancel sandbox subscriptions. Live activation is not covered by the sandbox approval.

Lifecycle, with disposable test users only:
1. Checkout with test card 4242 4242 4242 4242 (monthly, then yearly); the subscription row appears with the right plan/status and Pro unlocks without a refresh.
2. In Stripe test mode, resend (replay) checkout.session.completed and customer.subscription.updated; nothing changes.
3. Cancel at period end in the billing portal; access continues. Then cancel immediately; access ends. Resend the old updated event; access stays off.
4. Use a declining test card and a failing renewal (past_due); access ends; recovery restores it.
5. With an active test subscription, delete the account; Stripe shows it canceled before local data is gone.
6. With a Pro test account, confirm the Coach allowance is the Pro one (needs item 4's ai-coach deploy).

## 4. Answer the pending AI deployment question
Any ai-coach redeploy ships the shared CORS list, which includes the native app origin (capacitor://localhost) - that is the native-origin AI deployment awaiting your approval. The committed ai-coach change (paying web subscribers get the Pro AI allowance instead of the free one) waits on this. No financial payload has been sent to Anthropic. AI funding and service health are not independently verified.

## 5. Apple release access and configuration
- Confirm the Apple developer account/entity, ownership of app.yorbit, the App Store app ID, signing certificate/profile, and use of a Mac with Xcode 26 / iOS SDK 26. Review agreements, tax, banking and trader status yourself; nothing is assumed purchased.
- RevenueCat: public Apple SDK key, products app.yorbit.pro.monthly / app.yorbit.pro.yearly, offering and the `pro` entitlement.
- RevenueCat server verification is built and locally tested; revenuecat-sync v1 and revenuecat-webhook v1 are deployed. Sandbox deployment approval is resolved; actual Apple/RevenueCat purchase verification is still pending. To turn it on: create a RevenueCat **secret** API key and store it as `REVENUECAT_SECRET_API_KEY` in Supabase secrets; choose a long random webhook header value, store it as `REVENUECAT_WEBHOOK_AUTH`, and enter the same value as the webhook's Authorization header in RevenueCat (Integrations > Webhooks, URL `https://pvjiialxboslqyiiybpe.supabase.co/functions/v1/revenuecat-webhook`). The webhook deployment with its own authentication is already approved and complete. Never paste either value into chat.
- Supabase Auth: add `app.yorbit://auth/callback` to the redirect allow-list.
- The target remains universal (iPhone + iPad); retain both device families unless you request a change. Complete device verification and submission screenshots for both. Both screenshot sets are in store-assets/screenshots.

## 6. Register the native bank-link OAuth redirect
1. Plaid Dashboard (Team Settings > API): add `https://yorbit-life-os.vercel.app/bank-oauth-return` to Allowed redirect URIs; register Android package `app.yorbit`.
2. Apple: Associated Domains (`applinks:yorbit-life-os.vercel.app`) on the App ID, plus an apple-app-site-association file with the real Team ID.
3. Android: `.well-known/assetlinks.json` with the release signing certificate's SHA-256, and an `autoVerify` intent filter.
Until then, an OAuth bank's return lands on a friendly "return to the app" page instead of resuming.

## 7. Reviewer account and submission content
- Create a production reviewer account with synthetic data only (transactions, budgets, bills, some holdings) and Pro access through Apple's sandbox, so the reviewer can reach Coach. Provide the email, password and support email for the review notes - through App Store Connect, not chat.
- Approve a Privacy Policy update before submission. Its "Third-Party Services" section names Supabase, Anthropic, Plaid/Teller and Vercel-hosted pages only, while the app's privacy manifest declares purchase history and crash data. Suggested addition (your legal text to approve, not yet published): "Payments are processed by Stripe on the web and by Apple through the App Store; we use RevenueCat to confirm App Store subscriptions. We use Sentry to receive crash and error reports. Our website is hosted by Vercel. These providers receive only what they need to perform these services."
- Reconcile the privacy answers (draft in APP_STORE_SUBMISSION.md) against the signed build's privacy report, SDKs and server processing (Plaid, Anthropic, Sentry, RevenueCat, Stripe).
- Choose screenshots: the synthetic Home capture shows a negative savings rate and Invest shows $0 trading activity; re-capture from the signed build before submitting if the listing should match the device exactly.
- Complete the age-rating questionnaire against the signed build. Submission is yours to approve.

## 8. Signed-device verification
Provide a TestFlight tester for: sign-in and recovery, bank return, import/file picker, keyboard and safe areas, offline/error recovery, purchase/restore/cancel (and that the server then shows Pro), export through the share sheet ("Save to Files"), and account deletion (including the Apple-subscription warning). Use disposable synthetic accounts, Plaid sandbox and Apple sandbox - never your real financial records.

## Working arrangement
One implementer at a time; automations stay paused. Canonical code: C:/Users/Yosef/projects/yorbit-life-os, master on GitHub. Concise status: LAUNCH_STATUS.md. Evidence: YORBIT_PROGRESS.md.
