# Yorbit owner actions
Verified September 23, 2026, updated the same evening. Nothing below has been purchased, signed, paid or submitted by this work session.

## 1. Resolve the exact Stripe test-key approval
Review the existing restricted-key proposal: TEST MODE first; Checkout Sessions, Customers and Customer portal write; Subscriptions read/write; Products and Prices read; everything else None. Store the approved key only as STRIPE_SECRET_KEY in Supabase Edge Function secrets. Do not paste any key into chat, source code or a report.

Approval of a key is only the first gate. After it is configured, engineering still must prove checkout, webhook replay/order handling, entitlements, cancellation and deletion using disposable test users and a test subscription. Existing live Stripe webhook/portal deployments were left unchanged after automatic approval review rejected their redeployment. No paid launch is claimed.

Verified this session (2026-09-23): re-read create-checkout, stripe-webhook, create-billing-portal and delete-account's Stripe-cancellation step end to end, and their synthetic test coverage (test-checkout.mjs, test-billing-portal.mjs, test-account-deletion.mjs) - all pass, and between them already exercise missing/invalid config, auth, rate limits, hostile input, ambiguous/duplicate customers, provider failures, and every terminal and non-terminal subscription status delete-account can encounter. No code defect was found; nothing here is waiting on engineering. The moment a test key exists, this is what to actually run (not just deploy) before calling billing verified:
1. Create a disposable Supabase test user. From Upgrade, start checkout with a Stripe test card (4242 4242 4242 4242); confirm redirect to success_url.
2. Confirm stripe-webhook received checkout.session.completed (Stripe Dashboard > Developers > Events, or `select * from subscriptions where user_id = '<test-user>'` — read-only) and the row's plan/status match the price purchased.
3. Confirm useProStatus reflects Pro in the UI without a manual refresh (it listens for the SUBSCRIPTION_CHANGED event and window focus).
4. From Settings > Manage Subscription, open the billing portal and cancel at period end; confirm customer.subscription.updated sets cancel_at_period_end and status stays 'active' - access must continue until the period actually ends.
5. Use Stripe's dashboard (test mode) to advance/cancel the subscription immediately, or wait for customer.subscription.deleted; confirm the row flips to plan 'free', status 'canceled', and useProStatus drops Pro access.
6. With an active test subscription, attempt account deletion; confirm delete-account cancels it at Stripe (test mode) before deleting any local rows, and that the response is a real confirmed 'canceled' status, not just a request sent.
7. Repeat steps 1-2 for the yearly price, and once for a card that Stripe's test suite declines, to confirm the failure path shows a real error and creates no orphaned subscription row.
None of this touches real money or a real customer; it only requires the approved TEST-mode key from item 1's scope.

Separately found this session, real but out of this item's scope: disconnecting a single bank account (Bank Sync > Disconnect) only flips its local status - it never calls Plaid's item/remove, so the access token in plaid_credentials stays valid and the Item stays live at Plaid indefinitely. Account deletion IS unaffected (it revokes every remaining token independently in its own step). This is pure engineering, not an approval gate, and was left unfixed here rather than folded into this batch without being asked - flagging it for a future batch or your call on priority.

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

## 7. Register the native bank-link OAuth redirect with Plaid and Apple/Google (new, found this session)
The client and server code for native OAuth bank redirects (Chase, USAA and other large banks that require a sign-in step outside Plaid's own Link screen) is implemented and covered by synthetic tests, but three owner-controlled configuration steps remain before it can work on a real device - none of them are things this session could do:

1. Plaid Dashboard (Team Settings -> API): add `https://yorbit-life-os.vercel.app/bank-oauth-return` to Allowed redirect URIs, and register the Android package name `app.yorbit` under Allowed Android package names.
2. Apple: add the Associated Domains capability to the app's App ID (`applinks:yorbit-life-os.vercel.app`) and host a correct `apple-app-site-association` file at that domain containing the real Apple Team ID - requires the Apple Developer Program access already tracked in item 3.
3. Android: host `.well-known/assetlinks.json` at the same domain with the SHA-256 fingerprint of the actual release signing certificate, and add an `autoVerify="true"` intent filter for that domain - requires the release keystore.

Until all three exist, a bank that needs this step redirects to that URL and it loads as a plain webpage - a friendly "return to the app" message (src/pages/BankOAuthReturn.jsx), not a broken one - instead of resuming the connection automatically. Institutions that don't need this step (most smaller/regional banks, and Plaid's own Sandbox test institutions) are unaffected either way, and no live redirect_uri is sent unless the client reports it's running natively. This was tested against synthetic fixtures only, not a real Plaid OAuth redirect, which needs a signed device - see item 4.

## 8. URGENT: restore this session's Supabase CLI access, then let it deploy the pending fix (new, found and caused this session)
This session's Supabase CLI has no stored login at all - not a revoked or expired credential, just nothing present (`supabase projects list` itself returns 401; confirmed no SUPABASE_ACCESS_TOKEN anywhere and a freshly-created, empty CLI config directory). This blocked two things: investigating the scheduled-sync auth failure (item 6) at all, and deploying the new bank-disconnect Edge Function after its frontend half already went live.

**Consequence, live right now**: the Disconnect button on Bank Sync calls a function (plaid-disconnect-account) that does not exist in Supabase yet - confirmed with a direct request to it returning 404. Every real user who clicks Disconnect gets an error until this is deployed. This is new, caused by this session's own commit 0326219, and is the top priority to close.

**The fix, no secret needed in chat**: in a terminal you control on this machine (not through me), run `npx supabase login`. It opens a browser for you to approve against your own Supabase account; the CLI stores the resulting session itself, in your own Windows profile (`C:\Users\Yosef\.supabase\`), same as it always has - nothing to paste anywhere. Once done, tell me and I'll deploy `plaid-disconnect-account` immediately and re-verify production, then continue the cron investigation with real read access instead of guessing.

If you'd rather this not require a fresh login every time a session starts clean, the more durable alternative is a personal access token: Supabase Dashboard -> Account -> Access Tokens -> generate one, then set it as a persistent Windows environment variable yourself (System Properties -> Environment Variables, or `setx SUPABASE_ACCESS_TOKEN "<value>"` in your own terminal) - again, never pasted here. Either one unblocks this the same way.

## Working arrangement
Continue in YORBIT MAIN 222. Canonical code: C:/Users/Yosef/projects/yorbit-life-os, master on GitHub. Earlier Codex checkout and its uncommitted journal are preserved. Do not restart multiple development agents or overlapping recurring implementation jobs. The concise status is LAUNCH_STATUS.md; detailed evidence is YORBIT_PROGRESS.md.
