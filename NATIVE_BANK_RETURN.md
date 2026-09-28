# iOS bank-return setup

This closes the saved-code gap for returning from a bank's OAuth login into Yorbit. It does not establish that a signed device or real bank flow works.

## Implemented and checked locally
- App.entitlements contains only applinks:yorbit-life-os.vercel.app. Both Debug and Release app targets sign this entitlement; Xcode capability metadata is set.
- scripts/ios-universal-links.mjs generates the modern Apple appIDs/components format for only /bank-oauth-return and app.yorbit. It does not claim other routes, password sharing or subdomains.
- Missing/invalid/sample prefixes are refused; a different existing file is preserved for review. Repeating the same configuration leaves its bytes unchanged.
- Vercel supplies application/json for /.well-known/apple-app-site-association and excludes that exact path from the SPA fallback. A missing association must not be disguised as an HTTP-200 HTML page; ordinary app routes retain their fallback.
- The manual native pipeline checks local and published association before installing/building. It rejects redirects, non-200/HTML/malformed responses and wrong app/route content.
- No placeholder association file is committed or deployed.

## Owner information required
Provide the actual **Application Identifier Prefix** for the Apple App ID app.yorbit. It is usually the Team ID, but Apple defines the association identity using the application identifier prefix; confirm against the App ID/provisioning profile instead of assuming. This identifier is public, not an API key.

Enable Associated Domains on the Apple App ID and ensure the distribution profile includes the capability. Apple membership/signing access is required. Plaid must independently allow https://yorbit-life-os.vercel.app/bank-oauth-return .

## Implementer procedure after the prefix is supplied
1. Generate with the real public prefix:
   node scripts/ios-universal-links.mjs --write APP_ID_PREFIX
   APP_ID_PREFIX above is an instruction placeholder, not a value to use.
2. Review public/.well-known/apple-app-site-association, commit it, and deploy through GitHub/Vercel. Do not put a secret key in this file.
3. Verify the exact direct HTTPS response:
   node scripts/ios-universal-links.mjs --check-live APP_ID_PREFIX
   The check compares against the prepared local file and exact app/route. It makes no Apple or bank API call.
4. Set APPLE_APP_ID_PREFIX in the manual native CI environment. The pipeline refuses a missing/wrong prefix or undeployed file.
5. Build/sign only when other owner configuration is ready. Inspect the signed archive and provisioning profile: application-identifier must match the association appID; associated-domains must contain the exact production host. Source parsing is not proof of signed entitlements.
6. On macOS, use Apple's swcutil verify against the real AASA and callback URL; confirm unrelated routes do not match. Install the signed app and test Notes long-press/open plus an actual Plaid sandbox OAuth return. A typed address-bar navigation alone is not a universal-link test.
7. Capture cold-start and foreground returns, duplicate delivery, user cancellation and recoverable failure. Use synthetic accounts/provider sandbox only. Apple CDN caching can delay changes; record device/install state.

Before completing steps 1–7, native bank return remains unverified. Android App Links are a separate release path requiring its own package/signing fingerprint; this change does not claim Android readiness.

## Evidence and official references
Regression initially failed because App.entitlements was absent. A separate routing regression reproduced the existing public HTTP-200 HTML fallback at the missing association URL. Local tests cover generation, exact route/identity, safe existing-file handling, HTTP refusal cases and build gate wiring. Signed Xcode builds remain unavailable on this Windows host.

Apple documentation checked September 28, 2026:
- https://developer.apple.com/documentation/xcode/supporting-associated-domains
- https://developer.apple.com/documentation/technotes/tn3155-debugging-universal-links

Apple requires the website association and app entitlement to match and the HTTPS association response to have no redirect. Current App ID ownership, profile contents and device behavior are not verified by a correctly formatted file.
