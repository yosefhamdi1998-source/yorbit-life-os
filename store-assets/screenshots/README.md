# App Store screenshots (synthetic)

Captured with `node scripts/capture-store-screenshots.mjs` (after
`npm i --no-save playwright-core@1`) from the fixture build: the `store`
scenario in `fixtures/scenarios.js`, entirely fictional data, no production
database or real account. JPEG because App Store Connect rejects images with an
alpha channel. Sizes were checked against Apple's current specification
(2026-09-27):

| Folder | Size | Covers |
|---|---|---|
| `iphone-6.9/` | 1320 x 2868 | The required iPhone size (6.5" is only needed when 6.9" is missing) |
| `ipad-13/` | 2048 x 2732 | Required only while the Xcode target stays universal (TARGETED_DEVICE_FAMILY = 1,2) |

These are rendered by the same web bundle the iOS app wraps, in a mobile
viewport. They are not captures of a signed build on a device: no iOS status
bar, and native-only surfaces (the purchase sheet, Plaid's native flow) are not
shown. Re-capture from a signed TestFlight build before submission if the
store listing should show exactly what the device shows.

Worth a deliberate choice before using them: the Home capture shows the
synthetic month's negative savings rate (-26%) and three overdue bills, and the
Invest capture shows "$0" trading activity above the holdings list. They are
honest renders of the fixture data, not the most flattering ones.
