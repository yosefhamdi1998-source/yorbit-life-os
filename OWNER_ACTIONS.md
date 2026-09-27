# Yorbit owner actions
Updated September 27, 2026 (master 7f4d46f). Ordered by what unblocks the most. Nothing has been purchased, signed, paid, submitted, or revoked. Never paste a key, token or password into chat, code or a report.

## 1. Let the committed backend be deployed (unblocks almost everything)
This environment's Supabase CLI has no login. Either:
- run `npx supabase login` yourself in a terminal on this machine (it opens a browser for you to approve; the CLI stores the session in your Windows profile), then tell me; or
- explicitly authorize Codex to deploy through its Supabase connector, if that connector has deployment permission (only read access is confirmed).

The deploy set, in this order - apply exactly these, and check `supabase migration list --linked` before any blanket `db push`:
1. Migrations `20260927120000_atomic_bank_disconnect_claim.sql`, then `20260927130000_unique_stripe_subscription_rows.sql` (the second fails loudly if duplicate subscription rows already exist).
2. Functions: plaid-disconnect-account (new), plaid-sync-transactions, plaid-sync-holdings, sync-all-accounts, plaid-create-link-token, delete-account.
3. **Not** in this set: stripe-webhook (item 3) and ai-coach (item 4).

After deploying: confirm versions and verify_jwt, confirm the two RPCs exist, check the endpoint refuses an unauthenticated call and another user's account id, and disconnect a synthetic account on a disposable test user. Only then flip `BANK_DISCONNECT_AVAILABLE` to true and release the frontend. Also run, read-only: `select count(*) from connected_accounts ca join plaid_credentials pc on pc.connected_account_id = ca.id where ca.sync_status = 'disconnected';` - accounts disconnected by the old client-only path whose Plaid credentials are still live. Revoking them in bulk changes real connections and needs your go-ahead.

## 2. Fix the scheduled jobs' authentication
The gateway's UNAUTHORIZED_INVALID_JWT_FORMAT means the stored bearer is not a JWT at all. This project uses Supabase's newer keys, and the sb_secret_ key is not a JWT - so the leading hypothesis is that it was pasted where the legacy service_role key belongs. Not yet confirmed.
1. Run `scripts/cron-auth-diagnose.sql` (read-only; Codex can run it). It reports each job's bearer *format*, never the value, plus recent responses and sync freshness.
2. If the sync job's format is "NEW secret key" or "malformed": in the dashboard, add a Vault secret named `cron_service_role_jwt` holding the **legacy** service_role key (API Keys, "Legacy API keys" tab; starts with eyJ). If legacy keys are disabled on this project, stop and tell me - that needs a different, code-level fix.
3. Run `scripts/cron-auth-fix.sql`. It refuses anything but a complete service_role JWT, then points only sync-all-accounts-4h at Vault, keeping its schedule.
4. After item 1's sync-all-accounts deploy, run `scripts/cron-auth-verify.sql`: a dry run through the job's exact auth path (no Plaid call, no write). Pass = 200 with `{"dry_run":true,"authenticated":true,...}`.
5. After the next 4-hourly run, re-run queries 3-4 of the diagnosis: 200 = all synced; 502 = partial failure with per-account results.
6. Decide separately whether to re-point the reminders and weekly AI jobs, which likely share the fault. Re-enabling the AI job starts scheduled AI analysis of users' data.

## 3. Resolve the exact Stripe test-key approval, then approve the webhook redeploy
Restricted TEST-mode key only: Checkout Sessions, Customers and Customer portal write; Subscriptions read/write; Products and Prices read; everything else None. Store it only as STRIPE_SECRET_KEY in Supabase secrets.

The webhook fix (replay/out-of-order safe, one row per subscription) needs an explicit approval to redeploy, because stripe-webhook runs with gateway JWT verification off and verifies Stripe's signature instead. Then, with disposable test users only:
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
- RevenueCat: public Apple SDK key, products app.yorbit.pro.monthly / app.yorbit.pro.yearly, offering and the `pro` entitlement. Server-side verification of App Store purchases (so iOS subscribers get the Pro AI allowance) also needs a RevenueCat secret key in Supabase secrets - engineering will build it once that exists.
- Supabase Auth: add `app.yorbit://auth/callback` to the redirect allow-list.
- Decide iPhone-only vs universal. The target is universal (iPhone + iPad) today, so iPad screenshots are required and iPad review is likely. Both screenshot sets are in store-assets/screenshots.

## 6. Register the native bank-link OAuth redirect
1. Plaid Dashboard (Team Settings > API): add `https://yorbit-life-os.vercel.app/bank-oauth-return` to Allowed redirect URIs; register Android package `app.yorbit`.
2. Apple: Associated Domains (`applinks:yorbit-life-os.vercel.app`) on the App ID, plus an apple-app-site-association file with the real Team ID.
3. Android: `.well-known/assetlinks.json` with the release signing certificate's SHA-256, and an `autoVerify` intent filter.
Until then, an OAuth bank's return lands on a friendly "return to the app" page instead of resuming.

## 7. Reviewer account and submission content
- Create a production reviewer account with synthetic data only (transactions, budgets, bills, some holdings) and Pro access through Apple's sandbox, so the reviewer can reach Coach. Provide the email, password and support email for the review notes - through App Store Connect, not chat.
- Reconcile the privacy answers (draft in APP_STORE_SUBMISSION.md) against the signed build's privacy report, SDKs and server processing (Plaid, Anthropic, Sentry, RevenueCat, Stripe).
- Choose screenshots: the synthetic Home capture shows a negative savings rate and Invest shows $0 trading activity; re-capture from the signed build before submitting if the listing should match the device exactly.
- Complete the age-rating questionnaire against the signed build. Submission is yours to approve.

## 8. Signed-device verification
Provide a TestFlight tester for: sign-in and recovery, bank return, import/file picker, keyboard and safe areas, offline/error recovery, purchase/restore/cancel, export, and account deletion (including the Apple-subscription warning). Use disposable synthetic accounts, Plaid sandbox and Apple sandbox - never your real financial records.

## Working arrangement
One implementer at a time; automations stay paused. Canonical code: C:/Users/Yosef/projects/yorbit-life-os, master on GitHub. Concise status: LAUNCH_STATUS.md. Evidence: YORBIT_PROGRESS.md.
