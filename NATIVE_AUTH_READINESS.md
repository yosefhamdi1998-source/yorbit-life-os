# Native authentication return readiness

Implemented: native-only PKCE auth, app.yorbit://auth/callback iOS scheme, warm and cold return listeners, duplicate-code suppression, confirmed-session routing, recovery routing from the stored PKCE verifier, generic failure recovery, native browser open/close, and Google-start error handling. Web retains its current implicit flow. Auth secrets and callback codes must never be logged.

Configuration still required: add exactly `app.yorbit://auth/callback` to the existing Supabase project pvjiialxboslqyiiybpe authentication Redirect URLs. Keep the existing Site URL and web return entries. No wildcard is needed for the native callback. Read-only check on September15 showed only the GitHub Pages and Vercel web entries. The dashboard Add URL action did not open a usable form in this session; no setting was changed.

Verified locally: callback security/duplicate/error/recovery unit tests; existing auth and purchase regressions; Capacitor iOS sync and valid Info.plist. Sync generates plugin wiring; it is not compilation, signing, or a device test.

Before TestFlight: signed iOS build on macOS/Xcode or the configured cloud build; test Google sign-in, email signup confirmation, password recovery, cancelled/expired links, same-device PKCE behavior, cold and warm launch, duplicate link delivery, logout/account switching and browser dismissal on a real iPhone. Links started on another device cannot exchange this device's PKCE verifier; restart on the intended device. Verify Google/Apple provider configuration separately. Native bank-link return and StoreKit entitlement lifecycle are separate checks, not covered by this auth callback.

Documentation consulted September15: https://capacitorjs.com/docs/apis/app , https://capacitorjs.com/docs/apis/browser , https://supabase.com/docs/guides/auth/sessions/pkce-flow .
