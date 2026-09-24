# Yorbit owner actions
Verified September 23, 2026, updated the same evening. Nothing below has been purchased, signed, paid or submitted by this work session.

## 1. Resolve the exact Stripe test-key approval
Review the existing restricted-key proposal: TEST MODE first; Checkout Sessions, Customers and Customer portal write; Subscriptions read/write; Products and Prices read; everything else None. Store the approved key only as STRIPE_SECRET_KEY in Supabase Edge Function secrets. Do not paste any key into chat, source code or a report.

Approval of a key is only the first gate. After it is configured, engineering still must prove checkout, webhook replay/order handling, entitlements, cancellation and deletion using disposable test users and a test subscription. Existing live Stripe webhook/portal deployments were left unchanged after automatic approval review rejected their redeployment. No paid launch is claimed.

## 2. Answer the pending AI deployment question
The proposed deployment only adds packaged iOS/Android origins to the existing AI endpoints while preserving consent. Those endpoints can send the financial context described in the app to Anthropic, which is why automatic approval review required specific approval. No financial payload was sent during this work. Your earlier statement that you added funds is recorded; current funding and AI service health have not been independently verified and no additional funding is requested here.

## 3. Provide or verify Apple release access and configuration
Confirm the Apple developer account/entity, ownership of app.yorbit, numeric App Store application ID, signing certificate/profile and permission to use the selected Mac build host. Verify the RevenueCat Apple public SDK key, products app.yorbit.pro.monthly and app.yorbit.pro.yearly, offering and pro entitlement. Public keys may be build settings; private signing credentials belong only in approved secret storage.

The owner must personally review any developer membership, agreements, tax, banking, trader-status or other legal/account declarations. No new membership, company formation or purchase is assumed necessary based on an old checklist. Do not incur build costs without checking the existing allowance and approving any expense.

## 4. Provide access for signed-device verification
After the configuration gates are satisfied, the already-authorized engineering work should continue with disposable synthetic accounts, Plaid sandbox and Stripe/Apple sandbox purchases. Provide an iPhone/TestFlight tester for checks that cannot run on this Windows host. The walk must cover sign-in/recovery, bank return, import/file picker, keyboard/safe areas, offline/error recovery, restore/cancel purchases, export and account deletion. Do not use your real financial records for destructive testing.

## 5. Confirm the actual submission content
Provide reviewer access to synthetic data and verify the final privacy answers, support details, screenshots, age-rating questions, availability and listing claims against the signed build. Engineering can prepare the materials; the owner approves legal declarations and submission. The current web site being live does not mean App Store acceptance.

## 6. Restore the scheduled bank-sync cron's authorization (new, found this session)
Verified read-only: the sync-all-accounts-4h scheduled job is active and correctly configured except for one thing - Supabase's gateway has been rejecting its Authorization header as 401 UNAUTHORIZED_INVALID_JWT_FORMAT on every dispatch sampled from the last 3 days. The job fires on schedule; it just never reaches the function. No connected account has synced automatically since 2026-09-14, matching this exactly. The most likely cause is a service-role key rotation since the job's Authorization header was last set - MIGRATION_STEPS.md documents that value as a one-time manual paste into the cron.schedule() SQL, with nothing that re-syncs it if the key changes afterward.

The fix is pasting the CURRENT service-role key into that SQL statement, run once in the SQL Editor (MIGRATION_STEPS.md, "Set secrets once" / cron section). That is a secret value, so it was not done here. After updating it, the next scheduled run's outcome is visible read-only via `select status_code, count(*) from net._http_response where created > now() - interval '1 hour' group by status_code` - a 200 confirms it, without needing to inspect a real sync's contents.

This is independent of the bank-sync concurrency fix in this same session and predates it. A signed-in user's own manual Sync button is unaffected - it authenticates with their session, not this stored key - so this has been silent rather than something anyone would have noticed clicking around the app.

## Working arrangement
Continue in YORBIT MAIN 222. Canonical code: C:/Users/Yosef/projects/yorbit-life-os, master on GitHub. Earlier Codex checkout and its uncommitted journal are preserved. Do not restart multiple development agents or overlapping recurring implementation jobs. The concise status is LAUNCH_STATUS.md; detailed evidence is YORBIT_PROGRESS.md.
