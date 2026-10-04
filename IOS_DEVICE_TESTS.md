# iOS device verification plan

Prepared October 4, 2026 on branch claude/ios-launch. **No test below has been run on a device**: there is no signed build, no TestFlight, and no Apple account yet. "Evidence so far" is local tests and synthetic browser checks only; it does not replace the device result. Record each device result in the Status line with the build number, device, iOS version, date and what was observed. Never use real bank logins, real cards or real customer accounts.

## Preconditions

| Needed | Owner / status |
|---|---|
| Signed TestFlight build from codemagic.yaml (ios-app-store workflow) | Needs Apple membership, Codemagic account, App Store Connect API key, signing certificate/profile (OWNER_ACTIONS item 3) |
| AASA file deployed for the real App ID prefix | Codex, after the owner supplies the prefix (NATIVE_BANK_RETURN.md); the pipeline refuses to build without it |
| iPhone (and iPad while the app is universal) with TestFlight | Owner |
| Sandbox Apple Account (App Store Connect > Users and Access > Sandbox) signed in on the device under Settings > Developer/App Store sandbox account | Owner |
| RevenueCat project, products app.yorbit.pro.monthly / yearly, entitlement `pro`, V1 secret key, webhook | Owner (OWNER_ACTIONS item 3) |
| Custom SMTP for confirmation/reset email | Owner (OWNER_ACTIONS item 0) |
| PLAID_SANDBOX_SECRET and PLAID_SANDBOX_EMAILS with the tester's address | Owner (OWNER_ACTIONS item 4) |
| Disposable tester account(s) on addresses you control | Owner |

Apple sandbox subscriptions renew fast: by default a 1-month subscription renews every 5 minutes (options 3/5/30/60 minutes), up to 12 renewals, with sandbox billing retry and grace periods; purchase history can be cleared and purchases interrupted per tester (https://developer.apple.com/help/app-store-connect/test-in-app-purchases/manage-sandbox-apple-account-settings/).

## D1. Install, launch, layout
- Steps: install from TestFlight; cold launch; rotate (iPad); open Home, Money, Invest, Plan, Coach, More, Settings; check the notch/Dynamic Island and home indicator areas; dark and light mode.
- Pass when: Yorbit splash then the app (no white flash, no Capacitor/MoneyGlow branding); nothing hidden under the status bar or home indicator; iPad usable in all orientations.
- Evidence so far: Info.plist orientations/encryption checked; splash and icon are the Yorbit artwork; store screenshots captured from the fixture build at device sizes.
- Status: Pending (device).

## D2. Sign-up, email confirmation, return to the app
- Needs: custom SMTP.
- Steps: register a disposable address in the app; open the confirmation email on the same iPhone (Mail); tap the link with the app (a) running in the background, (b) fully closed. Repeat opening the email on a computer.
- Pass when: same-device link opens Yorbit via app.yorbit://auth/callback and lands signed in (warm and cold); cross-device link confirms the email and the app login then works; an expired/reused link shows the friendly error.
- Evidence so far: test:native-auth (PKCE callback, warm/cold listeners, duplicate suppression), test:auth-state; Supabase allows app.yorbit://auth/callback (Codex, Sept 28).
- Status: Pending (device; blocked on SMTP).

## D3. Login, unconfirmed account, password reset
- Steps: log in; log out; log in with an unconfirmed account and use "Resend confirmation email"; "Forgot password?" then open the reset email on the phone and set a new password; try a wrong password.
- Pass when: each path ends in the right screen with no stuck spinner; reset link opens the app's reset screen; old password rejected afterwards.
- Evidence so far: test:login-unconfirmed, test:password-reset-request, test:password-recovery; fixture-browser checks (Sept 30, Oct 3). Live web release of both screens.
- Status: Pending (device; reset/confirmation emails blocked on SMTP).

## D4. Bank link and OAuth bank return (Plaid Sandbox)
- Needs: tester on PLAID_SANDBOX_EMAILS, sandbox secret, AASA deployed, Plaid allowed redirect https://yorbit-life-os.vercel.app/bank-oauth-return.
- Steps: More > Connected accounts > connect; (a) a non-OAuth sandbox bank with user_good / pass_good; (b) Plaid's OAuth sandbox institution, completing the bank page in Safari so the universal link returns to the app, once with the app in the background and once after force-quitting it; (c) cancel midway; (d) tap the return link twice.
- Pass when: accounts appear and first sync runs; OAuth returns to Yorbit (not the web fallback page) and resumes the same link; cancel leaves nothing half-connected; duplicate return handled once.
- Evidence so far: test:native-bank-link, test:ios-universal-links, test:plaid-environment; the six sandbox-capable bank functions are deployed (32f1d1d, Codex) with hosted 401/CORS checks only.
- Status: Pending (device; blocked on Plaid sandbox secret, AASA/App ID prefix).

## D5. Sync, disconnect, delete with a linked sandbox bank
- Steps: pull to refresh / Sync; Disconnect one account; delete the account (D10) while another sandbox bank is linked.
- Pass when: sync updates balances/transactions; disconnect removes it and Plaid sandbox shows the item removed; deletion completes only after bank removal.
- Evidence so far: test:bank-disconnect (27 checks, real Postgres, fake Plaid), test:account-deletion, Codex hosted synthetic disconnect (Sept 27) - no real or sandbox Plaid call yet.
- Status: Pending (device/hosted sandbox).

## D6. Purchase (Apple sandbox)
- Steps: Upgrade > monthly; complete with the Sandbox Apple Account; then yearly on another tester; cancel the Apple sheet once; buy with airplane mode turned on right after Apple's confirmation.
- Pass when: Pro unlocks (all budget categories, unlimited goals, Coach) and the server agrees (Settings shows Pro after relaunch; revenuecat-sync row exists); a cancelled sheet changes nothing; offline confirmation shows "Purchase received - confirmation pending" and never suggests buying again; paywall shows price, length, auto-renew terms, Terms/Privacy links and Restore.
- Evidence so far: test:purchase-confirmation, test:purchase-identity, test:revenuecat, test:revenuecat-server-sql (13 checks, fake RevenueCat).
- Status: Pending (device; blocked on Apple + RevenueCat setup).

## D7. Restore, renewal, cancellation, expiry
- Steps: delete and reinstall, sign in, Restore Purchases; leave a monthly sandbox subscription renewing (5-minute renewals) and check Pro persists; cancel in Settings > Apple Account > Subscriptions and wait past the period; with "Interrupt Purchases" or a billing problem, check grace then loss of access.
- Pass when: restore brings back Pro for the same Yorbit account only; Pro stays through renewals; access ends after expiry (server and app agree); grace period keeps access, then ends.
- Evidence so far: server grace/expiry/refund/transfer cases in test:revenuecat-server-sql.
- Status: Pending (device).

## D8. Exports
- Steps: Money > export CSV and PDF; Budget > export PDF; Settings > Export My Data; choose Save to Files; repeat and dismiss the share sheet.
- Pass when: the share sheet opens each time; saved files open and contain the right data; dismissing shows no error and no false "saved" message.
- Evidence so far: test:save-file (exact bytes through the native path with fake Filesystem/Share), web exports confirmed in the fixture build (Sept 27).
- Status: Pending (device).

## D9. Import, keyboard, offline
- Steps: Import a statement from Files (CSV and PDF); fill forms near the bottom of the screen; turn on airplane mode at launch and during a sync, then reconnect.
- Pass when: file picker opens Files; imported rows match; the keyboard never hides the field being typed in; offline shows a recoverable message and recovers without restarting.
- Evidence so far: test:import-concurrency, Keyboard plugin resize=body config; no device evidence.
- Status: Pending (device).

## D10. Account deletion
- Steps: Settings > Delete Account on (a) a free account, (b) an account with an Apple sandbox subscription, (c) one with a sandbox web subscription if Stripe sandbox is configured.
- Pass when: (a) deletes and signs out; (b) shows that Apple billing continues and links to Apple's subscription page before deleting; (c) the Stripe sandbox subscription is canceled before data is removed; the old session cannot be reused.
- Evidence so far: test:account-deletion; Codex hosted free-account deletion with session rejection (Sept 27). Paid and provider paths unverified.
- Status: Pending (device).

## D11. Reviewer account walkthrough
- Needs: reviewer account seeded with supabase/seed/app_review_demo.sql (synthetic data only), Pro via a temporary RevenueCat promotional entitlement or sandbox purchase.
- Steps: sign in with the reviewer credentials on a clean device and follow APP_STORE_SUBMISSION.md "App Review notes" line by line, including the Coach consent screen and Restore Purchases.
- Pass when: every screen the notes mention is populated and reachable exactly as described; nothing references features the build lacks.
- Evidence so far: seed tested on local real-schema Postgres (Codex); not run in production.
- Status: Pending.

## D12. Not in the iOS build (regression)
- Steps: confirm there is no way to reach Tasks, Habits, Journal or Health Log in the app.
- Pass when: none is reachable (they are not registered natively, 119fa26).
- Evidence so far: test:native-legacy-routes; fixture browser with ?scenario=native-preview shows "Page not found" for all four (Oct 4).
- Status: Pending (device).
