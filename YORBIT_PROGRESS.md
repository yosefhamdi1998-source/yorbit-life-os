# Yorbit progress — September 9, 2026

## September 9 follow-up

- Automation follow-up: removed the reproduced collision between the lint regression test and strict lint. The regression test now uses ESLint's in-memory lintText with the same page file path/configuration instead of creating and deleting a source file. Both checks passed when run concurrently; all crash-detection assertions remain. This changes development checks only, not application behavior.

- Integrated Claude's fixes-and-dead-code work and lint cleanup through 7b58524 by fast-forward, preserving all existing commits. Reviewed the full cleanup diff, including removal of Home's unused net-worth/account requests and preservation of bill-copy/export field omissions.
- Independently passed the full regression suite, all 25 live enum checks, production build, and strict lint with zero warnings. Run strict lint after the test suite: test-lint-config temporarily creates/removes a source fixture, which can collide with a simultaneous lint scan.
- Verified the integrated Home renders with sample data. Claude additionally reported a 13-route sample-data pass; that broader pass was not independently repeated during this integration.
- Normal lint now exposes warnings, and lint:strict fails on warnings. No financial records were modified during integration. GitHub Pages remains unchanged.

- Enhanced Home charts: more vertical space on desktop, a dashed spending line to distinguish series beyond color, and an expandable period table with exact cents and direct detail access.
- Period details now support previous/next navigation without closing the panel, show category percentages, and stack totals on phones to prevent amounts wrapping. Verified first/last navigation boundaries, April-to-May links, September detail, and layouts at 390px and 1440px using sample data.
- Added Home chart style in Settings. The chart and Settings share a device preference; selecting Line, navigating Home, and reloading preserved the choice. Full-mode chart tools remain absent from Simple Home.

- Fixed unstable pagination when many records share the same date or amount. All entity reads now use a unique ID tie-breaker. A regression test simulates differently ordered ties across pages and checks 51,025 records, filtered reads, generic entity reads, and failed pages. This does not provide a database snapshot during concurrent writes.
- Consolidated duplicate imports in Coach and Settings and enabled the duplicate-import lint rule to prevent recurrence.
- Full automated test suite passed, including 25 live database enum checks, import deduplication, CSV handling, date windows, starter budgets, checkout mocks, and export pagination. Lint and production build passed. Payment mock tests are not proof of live billing readiness.
- Completed a read-only signup audit. Private signup identities stay out of this repository. No accounts or financial data were deleted.

## Access this work from another computer

- Live app: https://yorbit-life-os.vercel.app/
- This report: https://github.com/yosefhamdi1998-source/yorbit-life-os/blob/master/YORBIT_PROGRESS.md
- Engineering handoff: https://github.com/yosefhamdi1998-source/yorbit-life-os/blob/master/YORBIT_HANDOFF.md
- The Codex task is named **Review Yorbit UX** and is pinned on its local host. The local conversation and working files do not become a synced ChatGPT conversation by pinning them.
- For continuing the same local task remotely, use the same ChatGPT account and workspace. Where available, set up **Settings > Connections > Control this Mac or PC** on the original computer, then **Control other devices** on the second computer. The original computer must remain awake, online, and running the app. Official instructions: https://learn.chatgpt.com/docs/remote-connections
- A different ChatGPT account does not automatically gain access. Online code/report access follows the GitHub repository permissions.

Plaid Trial supports ten bank connections (Items), not ten Yorbit signups. Removing Items does not restore trial slots. This describes Plaid's public Trial terms; the team's exact plan and historical usage still need dashboard verification: https://support.plaid.com/hc/en-us/articles/39994173227159-What-is-the-Plaid-Trial-plan

## What changed in this work session

- **Simple mode:** Home, Money, and Plan are the three main destinations. Plan shows Budget and Bills. Home keeps the overview, next action, bills/budget, and three recent transactions. Extra tools remain available in an expandable menu. Full mode retains detailed charts.
- **Themes:** All nine color choices now affect the background, cards, navigation, links, and controls in light and dark mode. Removed fixed blue-gray overrides. Checked Rose on desktop and phone, Gold on phone, and all theme surface colors in both modes.
- **Planning income:** Starter budgets let you enter expected income for the draft without changing bank records. The amount is temporary and resets when leaving the page. Limits above this amount can still be saved.
- **Settings:** Returning from checkout no longer claims a subscription is active without checking its status. AI-consent changes wait for refreshed status. An uncertain deletion response no longer claims that nothing was deleted.
- **Transaction and bill entry:** Added accessible amount, date, category and range labels. Missing transaction dates now receive validation. Transaction buttons follow the selected theme.
- **Exports:** Removed the 50,000-transaction export cap. Tested the actual pagination adapter with 51,025 sample records and a failed-page case.
- **Home guidance:** The spending-above-income fallback opens Budget directly instead of depending on AI Coach.
- **Live database:** Fixed six unset function search paths. Closed a subscription-access loophole that allowed signed-in clients to write their own paid status. Customers can still read their own status; server billing writes remain available.

## What was checked

- Production builds and lint passed for the releases.
- Simple mode toggles, persistence through navigation, expandable tools, and returning to full mode.
- Desktop at 1440px and phone at 390px; viewport restored after testing.
- All nine themes in light and dark mode.
- Editable planning-income warning behavior using sample data.
- Transaction merchant search and a sample expense updating spending by its exact amount.
- Form validation: valid input, missing date, negative amount, and amount above the database maximum.
- Sample bill paid/unpaid round-trip updated and restored due totals and overdue counts.
- Data/account deletion confirmation dialogs and cancellation; no deletion performed.
- A 51,025-record export pagination test; failed pages reject rather than silently truncate.
- Live database checks: RLS is enabled on all 33 public tables; anonymous execution is denied for all 16 SECURITY DEFINER functions. These facts alone do not establish complete account isolation.
- Hardened timestamp triggers on a temporary table, rolled back afterward; pure classifier checks passed.
- Subscription writes tested as the authenticated database role: denied as intended; reads retained.

## Deployment and records

The code is committed to the GitHub production branch used by Vercel. The database migrations were applied separately to Supabase and recorded in its migration history. Source backups contain code, not a complete database backup or private credentials. No production financial rows were changed in these tests.

The September 9 pagination release was verified Ready on Vercel. See the production deployment history for the newest release and YORBIT_HANDOFF.md for earlier deployment IDs and engineering details.

## Still unfinished — do not advertise these as verified

1. Stripe key/webhook wiring, correct live prices in checkout, trial eligibility, cancellation portal, webhook ordering, and a complete test purchase-to-entitlement lifecycle.
2. Complete fresh-bank connection, sync, reconnection and disconnect testing, plus statement import end-to-end checks across providers.
3. Remaining database warnings: pg_net extension location, review of five signed-in privileged functions, and disabled leaked-password protection. Full multi-user isolation testing remains necessary.
4. AI provider funding and end-to-end Coach validation.
5. App Store distribution and native purchase/restore configuration. A Vercel web deployment is not an App Store release.
6. A complete button-by-button inventory and broader device/keyboard testing. The checks above describe the coverage actually completed.

The Stripe access change remains blocked by automatic approval review pending its exact-permission approval. The earlier approval question specifies the intended server key and six permissions. No Stripe key has been created or stored in this work session.

### Additional completed import check

The sample CSV passed upload, income/expense detection, category preview, import, and duplicate reimport. Reimport wrote zero rows and skipped all three duplicates. Fixed the receipt link so View Transactions opens the statement dates, then verified September 1–3 was selected in Money. This does not yet cover every bank or PDF layout.

Revision 07d35bc was verified Ready in Vercel deployment 5qPehuSHrrdcktLuFZDpgcKRBTn8, and its Home-to-Budget guidance was verified live.

## September 9, 2026 — centered figures and chart-forward Home

- Centered Home and shared summary figures with a lighter Inter numeric treatment, responsive sizing, and consistent spacing.
- Moved full-mode cash-flow and category insights above bills/budget. Simple mode retains its shorter layout.
- Added a spending category ring covering every category, with an accessible total and explicit remainder below the top-five list.
- Verified sample-data desktop and mobile Home in light/dark themes; exercised Bars/Line/Split, month detail and next-period navigation, and income/spending links with matching dates and totals.
- Validation: strict lint (zero warnings), production build, and report-range tests passed. This is a focused visual/navigation pass, not an assertion that every integration or button has been tested.
- Design references: Monarch Reports (help.monarch.com/hc/en-us/articles/21846787088916-Using-Reports) and Simplifi Dashboard (support.simplifi.quicken.com/en/articles/3357180-getting-to-know-your-dashboard): prominent cash-flow/category views with detailed reports behind them.

## September 9, 2026 — clear mobile report controls

- CSV/PDF report buttons now retain visible file-type labels on phones and have descriptive accessible names and scope tooltips.
- Spending Summary period tabs and arrows have 44px tap targets; calendar tabs expose their selected state. Custom date ranges no longer falsely highlight Monthly.
- Sample-data browser checks: mobile labels/layout, previous/next period navigation, yearly selected state, and custom-range unselected/disabled states. Export file generation itself was not retested in this pass.
- Strict lint, production build, and report-range tests passed. No financial records changed.

## September 9, 2026 — reconcile every spending category

- Replaced Spending Summary's hardcoded category whitelist with grouping of actual expense records. Categories such as freelance, newly introduced labels, and missing categories no longer disappear while still counting in the spending total.
- Charts, category breakdown, flow calculation, and exported category summary share this grouping. Missing labels fall back to other; income and transfers are excluded.
- CSV category names now use the existing CSV escaping routine.
- Added test:spending-categories to the full test command. Regression fixtures verify known/unknown/missing categories, repeat-category aggregation, income/transfer exclusions, and total reconciliation.
- Validation: category and report-range tests, strict lint, production build; browser sample report rendering and monthly previous-period navigation. No real financial records changed. Full provider/import/export lifecycle remains outside this pass.

## September 9, 2026 — elapsed-period spending averages

- Current-period daily averages now divide by elapsed calendar days rather than including future days. Monthly averages use calendar months reached so far, including the current partial month.
- Added visible day/month counts; completed periods retain their full length. Future ranges display no average rather than divide by zero.
- Added test:report-average to the full test command. Checks cover partial/completed periods, exact date windows, first day, future ranges, leap day, and daylight-saving calendar boundaries.
- Verified sample September report: $318/day across nine days, versus the former $96/day across 30. Completed August remains $280/day across 31 days.
- Validation: report-average regression tests, strict lint, production build, and sample browser current/previous month checks passed. No production records changed.

## September 9, 2026 — keep comparisons within the previous period

- Fixed partial-period comparison cutoff spilling out of a shorter previous month (for example March 30 previously reached into March when comparing against February).
- Uses elapsed calendar days instead of milliseconds, and clamps at the previous period end. Completed-period comparisons are unchanged.
- Added test:report-comparison to the full suite. Verified February/leap-year boundaries, current-record exclusion, completed periods, and DST under America/New_York.
- Validation: comparison and report-range tests, strict lint, build, and sample current-month report rendering passed. No production data changed.

## September 9, 2026 — accessible transaction filters

- Named the transaction search and minimum/maximum amount fields explicitly.
- Filters announces expanded state and identifies its controlled panel; type/category choices announce selected state, and sort buttons announce direction.
- Enlarged filter/type/category/sort controls to 44px minimum height for touch use.
- Verified sample minimum amount filter (20 of 61 results), Income selection, ascending/descending amount sorting, and clearing filters through browser controls.
- Strict lint, production build, and diff checks passed. No transaction data was modified; no claim of full screen-reader audit.

## September 9, 2026 — explain invalid transaction filter ranges

- Added specific guidance for negative amounts, minimum greater than maximum, and From date later than To date. Affected inputs expose invalid state and reference the guidance for assistive technology.
- Empty results distinguish invalid ranges from valid filters with no matches. Filters remain user-controlled; no financial records are modified.
- Browser sample checks passed for reversed amounts, negative values, and correction back to zero (warning and invalid state clear).
- Native date-field automation did not reliably commit React change events, so reversed-date browser interaction is not claimed as verified. Date validation is a direct comparison of ISO date inputs.
- Strict lint, production build, and diff checks passed.

## September 9, 2026 — distinguish unavailable reports from zero spending

- Spending Summary now shows a persistent load-error state with Retry instead of a transient toast followed by zero totals. Charts and export controls are withheld until records load successfully.
- Retry preserves explicit date ranges; cancelled requests cannot update an unmounted report.
- Added dev-only scenario=report-retry, which fails the first transaction load and succeeds on retry. Production does not use the fixture implementation.
- Browser check: failure screen contained no totals/exports; Retry restored the Aug 10–Sep 8 report and $8,048 sample total with its original date range.
- Strict lint, production build, and diff checks passed. No live data or network service was disrupted.

## September 9, 2026 — prevent empty figures during retries

- Home and Money now enter their loading state when retrying a failed load, instead of clearing the error and briefly rendering empty/stale figures while waiting.
- Loading placeholders expose a named status for assistive technology.
- Extended the dev-only report-retry fixture with a 1.5-second recovery delay. Verified both pages transition error -> named loading status -> populated page, without showing the report during the delay.
- Strict lint, production build, and diff checks passed. No real records or services altered.

## September 9, 2026 — unambiguous spending trend dates

- Daily trend labels include the month when a report crosses months, and the year when it crosses years. Monthly trends include years for multi-year windows.
- Single-month/day and single-year/month charts retain compact labels. Amounts and date filtering are unchanged.
- Added test:report-trend-label to the full test command, covering compact and cross-month/year formats.
- Verified rendered sample axes: Jan 2025 vs Jan 2026 in a multi-year report; Aug 10 through Sep 7 in a cross-month report. Existing axis spacing skips ticks as needed.
- Strict lint, production build, label regression tests, and diff checks passed.

## September 9, 2026 — prevent overlapping PDF transaction rows

- PDF transaction exports now advance once per wrapped line and add pages within the page margins. Long descriptions no longer collide with the next row or overflow the page.
- Added test:pdf-rows to the full suite using real jsPDF line wrapping. It checks all 600 repeated phrases survive a multi-page description, every baseline stays within margins, and the next transaction remains present with separate spacing.
- Generated a three-page synthetic PDF starting near a page bottom, rendered through Poppler, and visually inspected all pages. Test images/PDF are local QA files outside the source archive.
- Strict lint, production build, PDF row regression, and diff checks passed. This does not claim comprehensive PDF styling, Unicode, category-summary pagination, or export lifecycle coverage.

## September 9, 2026 — forgiving transaction search

- Merchant/note matching now trims leading and trailing query spaces, preventing pasted names from unexpectedly returning no matches.
- Added a named, touch-sized Clear transaction search button without resetting other filters or the page date range.
- Sample browser check: spaced Coursera query returned four matches; Clear restored all 61 transactions in the selected period.
- Strict lint, production build, and diff checks passed. Search semantics otherwise unchanged and no records modified.

## September 9, 2026 — load PDF engine only when requested

- Changed Spending Summary PDF export to import jsPDF on demand inside the existing busy/error handling, instead of loading it whenever the report opens.
- Production bundle inspection confirms dynamic PDF import and no static jsPDF import in the Spending Summary chunk. No measured latency claim is made.
- All 20 local Node regression scripts passed together, including CSV, starter budget, export pagination, report categories/dates, and PDF wrapping. Initial unprivileged run hit a filesystem restriction; rerun with required access passed. Live database checks were not part of this run.
- Strict lint and production build passed. Sample PDF export action returned to enabled controls with no browser errors; downloaded file contents were not re-reviewed because PDF layout did not change in this pass.

## September 9, 2026 — preserve CSV cells containing line breaks

- CSV cell escaping now quotes carriage returns as well as line feeds, commas, and quotes. Merchant names/notes containing CR-only line breaks no longer split into extra rows.
- Generated-date metadata is also escaped, preserving its comma inside one cell.
- Shared escaping helper is exercised by export-to-parser round-trip tests for commas, quotes, CR, LF, CRLF, zero, and null. Each transaction remains one row with its description and amount intact.
- Existing CSV parser/dedup checks, strict lint, production build, and diff checks passed. No real records changed; this pass does not claim a spreadsheet-formula security audit.

## September 9, 2026 — align report chart scales

- Long custom report ranges already grouped by month but incorrectly retained the Daily Spending Trend heading and daily area chart. Chart mode, heading, bucket grouping, and average now share the same monthly/daily decision.
- Browser checks: a multi-year custom range shows Monthly Spending with bars and Avg / Month; a 30-day custom range retains Daily Spending Trend with an area chart and Avg / Day.
- Strict lint, production build, and diff checks passed. Transaction totals and filtering are unchanged.

## 2026-09-09 — Totals drill-down and Home presentation
- Added exact calendar-month/year transaction links to Totals income/spending amounts, month rows, and chart bars. Mobile month cards expose income, spending and net rather than hiding amounts. Month counts now include transfers consistently with year counts.
- Fixed Money's URL type filter: expense links previously fell back to All. Both income and expense are now accepted.
- Refreshed Home with a theme-tinted header, clear Add transaction action, and Income & spending section title.
- Verified: report-range tests including leap February/year endpoints; strict lint; production build. Browser sample-data checks: January spending 63/65 records, income 2/65; Home Add opens New Transaction; phone Home and filtered Money screenshots inspected.
- Limits: chart-bar click handling was implemented but not independently exercised in this pass. This is a focused release, not an exhaustive all-buttons or App Store certification.

## 2026-09-09 — Recoverable Totals loading
- Replaced the transient failure toast followed by a misleading empty-account screen with a persistent error and Try again action. Retry shows an accessible loading status; abandoned requests cannot update an unmounted page.
- Added a direct Add transaction action to the genuine empty state.
- Verified strict lint and production build. Synthetic browser checks: first request failure -> error -> Try again -> loading -> 919 populated records; empty account action opens New Transaction. Also independently clicked the yearly expense chart bar from the prior release: opened Jan 1–Dec 31 2025, Spending selected, 372/383 records.
- No production financial records were changed. Monthly chart bars and other app flows still need their own coverage; this does not certify full launch readiness.

## 2026-09-09 22:32 UTC run — Plaid security verification (unresolved)
- Prioritized Claude audit branch 31d89de over cosmetic changes. No implementation/deployment overlapped; working tree was clean on a77d688.
- Live read-only CLI checks: 1 non-null Plaid legacy token row; 1 exact matching protected-table copy. No credential values selected or reported.
- anon/authenticated retain SELECT/INSERT/UPDATE column privileges. connected_accounts has RLS enabled and owner-only predicates auth.uid() = user_id for SELECT/INSERT/UPDATE/DELETE. This supports an own-account client token exposure finding, NOT evidence of anonymous or cross-user disclosure. plaid_credentials has forced RLS and zero policies.
- Source still writes tokens into the legacy column, tolerates protected-table write failure, and returns the inserted account via select(). The token retirement comment incorrectly names the net-worth migration. This remains unresolved and takes priority over polish.
- Safe follow-up requires coordinated Edge Function changes, verified protected storage, and retirement of legacy token data. This scheduled run did not alter real bank records, tokens, permissions, or deployed functions. Existing bank sync remains untouched. No claim of remediation or full security audit.
- Supabase connector denied access; existing authorized CLI connection succeeded. The first CLI query required --linked with --project-ref, corrected per returned error. CLI returns only last result set for multiple statements, so policies were verified separately.

## 2026-09-10 — Service authentication guard and category readability
- Added shared isServiceBearer, requiring a configured nonblank secret and exact Bearer token, using timingSafeEqual on equal-length bytes. Three guards now use it with zero sentinel fallbacks. Actual helper regression tests pass and are included in npm test.
- Deployed five affected Supabase functions successfully; read-only metadata confirms ACTIVE, verify_jwt=true preserved: transactions v20, holdings v6, sync-all v5, weekly analysis v8, reminders v8. No financial operation invoked. Live negative POST test was rejected by automatic approval review due to possible billable side effects; not retried. Runtime end-to-end authentication remains untested.
- Plaid legacy-token storage remains unresolved; this authentication fix does not retire that column.
- Spending report tooltips now explicitly use dark green in light mode / mint in dark, with foreground labels and subtle hover shading. Category comparison uses clear text labels. Home activity, Money transactions and Budget cards now share vector category badges; badges have subtle borders and brighter dark-mode icons.
- Verified light/dark category tooltip screenshots and Money list; strict lint, production build, actual service guard tests pass. Not a complete app or security certification.

## 2026-09-09 23:34 UTC — Accurate financial-record deletion disclosure
- Settings confirmation now lists records removed and retained, including retained Coach history, notes, account, subscription and bank connections. Title and success message no longer promise deletion of all financial data.
- No deletion behavior, database policies, records, or accounts changed. Checked against the existing RPC source and prior live audit; no destructive invocation performed.
- Strict lint and final production build passed. Opened the sample confirmation dialog, checked disclosure, and canceled.

## 2026-09-10 00:35 UTC — Accessible Add Transaction fields
- Added persistent accessible names to optional description/notes inputs and aria-pressed state to expense/income buttons. Validation messages now expose an alert and use light/dark red text variants.
- Sample browser checks: default Expense pressed; Income click updates selection and category; negative amount shows announced validation without saving; Cancel closes form. Strict lint and production build passed.
- No real financial data changed. This is targeted accessibility coverage, not full keyboard/dialog certification.

## 2026-09-10 01:35 UTC — Strict transaction date validation
- Extracted actual form validation into a tested helper. Date parsing now checks a real ISO calendar date rather than Date.parse normalization (e.g. February 30). Numeric input requires a finite complete value, not parseFloat's accepted prefix; save uses the same Number conversion.
- Regression cases cover leap/non-leap February, impossible month/day, malformed/empty amounts, zero/negative values, amount bounds and title length. Included in npm test. Focused tests, strict lint, production build passed.
- No production transaction writes. Validation is client-side feedback, not a replacement for server constraints.

## 2026-09-10 02:36 UTC — Budget remove-limit touch targets
- Enlarged remove-limit buttons to 44x44 CSS pixels and added category-specific accessible names. Small icon remains visually secondary; hover state clarifies destructive intent.
- Phone preview at 390px checked: Food/Transport/Entertainment cards fit; measured targets approx 44x44; keyboard Tab navigation reaches next control. No removal invoked and no records changed.
- Strict lint and production build passed (build slower than usual). This does not cover every Budget control.

## 2026-09-10 03:37 UTC — Persistent transaction save failure feedback
- Failed Add Transaction saves now retain an announced inline message after the parent toast disappears. Wording says the save could not be confirmed and advises checking transactions before retrying; does not claim an ambiguous network failure means no insert happened.
- Added dev-only save-retry fixture: first create throws before insert. Browser confirmed retained description/amount and alert; Cancel works. Subsequent browser retry did not close the form and remains unresolved; no claim of end-to-end retry success. Isolated fixture create test failed once and then returned one synthetic row as designed.
- Strict lint and production build passed. No production records written or financial functions invoked.

## 2026-09-10 04:37 UTC — Save retry follow-up
- Reproduced synthetic pre-insert failure with temporary local diagnostics, then retried using keyboard Enter on Save Transaction. Form closed and one Food expense for 12.34 appeared in the sample transaction list. Entries were preserved across the failure.
- Earlier pointer-driven retry did not produce a second handler error or successful activation; it is not evidence of a broken save handler. Pointer retry coverage remains uncertain. Keyboard recovery is now verified.
- Removed temporary diagnostic logging; production application code unchanged. No real financial record or bank operation touched. No deployment required for this verification-only follow-up.

## 2026-09-10 05:39 UTC — Transaction dialog keyboard access
- Replaced the custom sheet visibility/backdrop logic with the existing Radix modal primitive, keeping the bottom-sheet layout and pinned actions. Added linked dialog title/description, modal focus containment, Escape dismissal, and focus restoration to the opener. Removed the custom exit timer and manual root overflow override; closed content unmounts immediately.
- Fixture browser checks: initial focus on Close; Tab from final enabled Cancel wraps to Close; Escape closes and returns to Add; desktop category selection works; 390px phone layout retains native category picker and visible actions. Synthetic failed save preserves entries/alert; keyboard retry closes and returns focus to Add. No real records touched.
- Strict lint passed. Production build passed with approved expanded filesystem access after sandbox denied config resolution. Remote master verified at 40872f8 before release. Daily/weekly review schedules are newly configured; first daily review is due after 9 AM Eastern, weekly Monday after 10 AM.

## 2026-09-10 — Pro plan price contrast
- Fixed selected/hover plan backgrounds using theme card colors rather than hardcoded white, with a primary selection border and aria-pressed. Annual equivalent price uses readable light/dark green variants.
- Browser verified monthly and annual selection, dark price RGB 233/237/242 on card 26/27/40, and light price 16/23/40 on card 252/252/253. Strict lint and production build passed. No checkout or purchase initiated.
- Revenue priority: verify billing price IDs against the active Stripe account (Upgrade still contains older IDs), close known bank-token/security blockers, verify the paid entitlement lifecycle, and measure activation/retention in a small variable-income pilot before acquisition spending. Trial and AI claims must match funded/configured behavior. No pricing change in this release.

## 2026-09-10 06:41 UTC — Honest native purchase confirmation
- iOS purchase handler now requires result.isPro before welcoming the customer and navigating to Settings. A completed SDK call without a Pro entitlement stays on the screen with Restore Purchases guidance rather than falsely saying access is active. Cancellation remains silent.
- Added regression coverage that executes the actual screen handler with mocked purchase results: active Pro, missing entitlement, cancellation, and error. Existing RevenueCat initialization/restore tests also pass; strict lint passed. No real purchase, bank call, or paid build invoked.
- Reviewed Capacitor config, Codemagic workflow, and historical APP_STORE_READINESS.md. That September 5 checklist is historical, not a fresh live verification. Current native signing/device testing and paid entitlement lifecycle remain unverified. Existing billing price references and legacy Plaid token storage remain separate blockers.
- Reference: https://www.revenuecat.com/docs/customers/customer-info — access is checked through active entitlements, not merely completion of a purchase SDK call.
- Production build passed. Remote master verified at 428517a before release; this web release does not produce or submit an iOS binary.

## 2026-09-10 — Home Add opens on the first click
- Reproduced live: Home Add navigated to Money and consumed add=1 without leaving the form open. Local first-load success concealed it; revisiting the already-loaded Money route reproduced the failure.
- Layout now captures the current useOutlet() element for the keyed page transition instead of letting the exiting Outlet mount the next page prematurely and consume its one-shot Add request. Corrected the remaining Home empty-activity Add link to include add=1.
- Local repeated Home→Add navigation opens the transaction dialog on each attempt; Cancel and refresh keep it closed afterward. No transactions saved. Viewport override did not take effect (actual width remained 897), so no new phone-size verification is claimed. Strict lint, production build and final diff review passed; remote master was dbe03d7.

## 2026-09-10 — Five native subscription improvements
1. Native plan prices and currency now come from the validated RevenueCat product priceString instead of web dollar constants.
2. Removed unconditional seven-day trial and savings claims from the native paywall; Apple confirms eligible introductory offers. Web billing copy remains separately unverified.
3. Missing or mismatched products/periods cannot be selected or purchased; a valid remaining plan is selected automatically.
4. Failed offering loads have an actual retry action; late successful responses clear timeout errors and disposed requests cannot overwrite current state.
5. Purchase cancellation recognizes the installed SDK's string/numeric cancellation code and userCancelled flag, rather than showing a purchase error.
- Targeted tests execute actual native screen handler and offering effect with mocked SDK results, validate localized price and product/period mismatches, and check cancellation/error outcomes. Strict lint and production build passed; later test-only additions passed targeted tests/lint. Native browser fixture verified initial unavailable state, retry to EUR monthly pricing, annual disabled, missing entitlement purchase feedback, and Restore with no purchases. No real purchase or external financial call invoked.
- Fixtures are only aliased by vite.fixture.config.js; the production build uses real SDK modules. No secrets configured. Historical readiness document now identifies its date and current unverified native-build/account/billing/security gaps. Codemagic Node 20 versus installed Capacitor's Node >=22 is recorded for follow-up.
- Remote master verified at fbbcb33 before release. These are code/preparation improvements; a Vercel release does not update an installed iOS binary or constitute App Store approval.

## 2026-09-10 — Native build configuration corrections
- Updated both mobile workflows from Node 20 to Node 22 to satisfy installed Capacitor CLI requirements.
- iOS now resolves Swift packages against the checked-in App.xcodeproj instead of running pod install without a Podfile. IPA build targets that project instead of a nonexistent top-level workspace.
- This is source configuration preparation only: no cloud build, signing, submission, or purchase was triggered. Signing setup and the current build-number command (bundle ID where a numeric Apple application ID is required) remain explicitly unverified/unfinished.
- Follow-up in the same change: build numbering now requires the numeric APP_STORE_APPLE_ID, stops on failed/invalid lookup, and runs agvtool inside ios/App. First-ever upload without a returned build number needs an explicitly configured initial build; no fallback silently invents one. Signing remains unfinished. YAML parsing and checked-in path checks passed; no Xcode execution available on this Windows host.

## 2026-09-10 08:44 UTC — Native release preparation and customer recovery
Four useful improvements completed, rather than forcing five: (1) coherent manual native signing/publishing configuration, (2) native purchase/restore SDK-rejection recovery, (3) accessible Upgrade Back control, (4) readable selected report periods. Remaining launch work depends on verified signing/device/account configuration or coordinated sensitive backend changes; no speculative fifth change added.
- Codemagic now references uploaded App Store signing identities and the same Apple environment credentials documented for setup. Removed push triggers from both native workflows so routine Vercel releases do not automatically initiate native builds/submissions. No cloud build invoked. This also publishes the prior local Node/SPM/build-number corrections.
- Purchase and restore handlers release busy state after unexpected SDK rejection and show recovery guidance. Purchase uncertainty directs users to restore before trying again. Mock tests cover active/no entitlement, returned errors, thrown errors, no incorrect success navigation, and unlocked controls.
- Upgrade's icon-only back button now has an accessible name, verified returning to the report.
- Report's selected period no longer uses theme primary text on a white background; verified RGB 15/23/42 on white in light and dark themes.
- Validation: native regression tests and report-average tests passed; strict lint passed; YAML parsing plus runtime/project/signing/publishing/manual-trigger assertions passed. Production build status recorded after completion.

### Coverage checkpoint — 2026-09-10 08:44 UTC
| Area | Status | Evidence / next gap |
|---|---|---|
| Upgrade native SDK exception, purchase and restore | Tested, synthetic | Clicked both actions; visible error; controls re-enabled; no real purchases |
| Upgrade Back | Tested, synthetic | Accessible Go back returns to Spending Summary |
| Report monthly/yearly/previous/next | Tested, synthetic | Periods update; current Next disabled correctly; earlier Next enabled |
| Report selected period light/dark | Tested, 897px viewport | Computed colors verified; screenshot inspected; no horizontal overflow |
| Report chart rendering | Partial | Donut and report layout rendered; chart keyboard/drill-down coverage remains pending |
| Phone viewport, Simple mode, remaining settings | Not re-tested this run | Prior coverage does not certify all controls |
| Native signing, physical device and Apple payments | Blocked/unverified | No macOS build or configured-account verification here |
- Daily 9 AM and Monday review are not due at this 04:44 Eastern run.
- Configuration references: https://docs.codemagic.io/yaml-code-signing/signing-ios/ and https://docs.codemagic.io/yaml-publishing/app-store-connect/ . This is source configuration validation, not a signed-build certification.
- Final combined production build exited 0; strict lint and targeted tests passed. Pre-publish remote master was 8fe9cd1.
- Production verification: e7a171055959b1caeb0c7edb7a01a649f9c58b8b deployed Ready in 21s; Vercel deployment 6rhiZf92M8uxqSqXv83qiwoWfn5j. Reloaded the canonical live report and clicked Monthly: selected=true, text RGB 15/23/42 on white. No real data mutated. This deployment evidence is retained locally for the next coordinated commit.

## 2026-09-10 09:46 UTC — Reconcile report categories with transactions
One complete customer-flow improvement this run: report category drill-down and reconciliation. Did not manufacture five separate changes from this one flow. Precise filtering, unknown-category handling, accessible navigation, cent-level totals and browser verification were treated as one coordinated change; launch signing/payment/token work remains subject to the previously documented constraints.
- Every Spending Summary breakdown row is now a keyboard-accessible link to Money with the report's exact start/end dates, expense type and encoded category. Category filter is visibly selected on arrival and can be cleared.
- Other includes null/empty categories, matching report aggregation; imported categories remain visible. Regression tests reconcile every bucket and verify exact custom dates and encoded unusual names.
- Breakdown amounts and the matching spending/income total show cents. Header cards retain whole-period context; the list explicitly labels its filtered total.
- Strict lint caught a missing formatting import during development; corrected before release, then replaced the whole-dollar formatter with cents precision. Final strict lint and range/category regression tests pass. No failure was published.

### Coverage checkpoint — 2026-09-10 09:46 UTC
| Flow | Status | Evidence |
|---|---|---|
| Monthly report category to transactions | Tested, synthetic | Keyboard Enter on food opens expense/category/date filters |
| Custom report category to transactions | Tested, synthetic | Aug 10–Sep 8 food: report and list both $230.76 |
| Empty search and clear-search recovery | Tested, synthetic | No matches and zero total, then records return |
| Clear category | Tested, synthetic | All categories restores period spending total |
| Dark and light layout | Tested at 897px | Screenshot inspected, no horizontal overflow; phone-size not claimed |
| Report charts | Partial | Rendered during traversal; breakdown offers keyboard-accessible underlying records; direct chart interactions still pending |
| Phone, Simple mode, other settings | Not re-tested this run | Remain on rotating coverage list |
| Native signing and real payment lifecycle | Unverified | No native build or financial operation invoked |
- Daily 9 AM and Monday checkpoint not due at this 05:46 Eastern run.
- Final combined production build exited 0; remote master verified e7a1710 before publishing.
- Production verification: 3b679880638e94f4077f21aa8056333944dee88c Ready in 27s, Vercel CxaYgsDBuxFuCeJkvdFampstTGx8. Reloaded canonical live report; Other link opened /finance with original 2025-01-01 through 2026-09-08 range, type=expense, category=other, visible selected category and Matching spending label. Read-only verification; no records changed. Evidence retained locally for next coordinated commit.

## 2026-09-10 10:47 UTC — Empty-period recovery and Money chart accuracy
Four verified improvements: empty-period recovery; correct chart period/monthly-budget scope; complete imported/uncategorized expense buckets; uncapped textual budget usage. No arbitrary fifth change: the remaining launch/security items need the documented coordinated configuration or native validation, and this run closed the findings actually reproduced during the walkthrough.
- Existing accounts with an empty selected period now get an accurate explanation plus View all history. Truly empty accounts retain Add Transaction. Both actions meet 44px minimum height.
- Spending chart caption follows selected dates/range instead of always saying This month. Monthly budget comparisons appear only for an explicit complete calendar month and use that month's budget. Rolling/multi-month/all-history totals are not compared to a monthly cap.
- Money chart now uses the same expense grouping as reports, including null/empty categories as Other and unknown imported categories.
- Budget usage text reports actual overrun, rather than capping the label at 100%.
- Targeted date tests cover leap-month, full month, partial month and multi-month windows; category reconciliation tests passed. Strict lint and production build exited 0. Added synthetic category-accuracy fixture, then lint passed again.

### Coverage checkpoint — 2026-09-10 10:47 UTC
| Flow | Status | Evidence |
|---|---|---|
| Existing history / empty dates | Tested, synthetic | Jan 2024 empty; View all history restores 919 records |
| New account / Add / Cancel | Tested, synthetic | No-history copy; form opens; Cancel closes without saving |
| Spending tab and period label | Tested, synthetic | All-history caption, no inappropriate budget comparisons |
| Exact monthly budget / overrun | Tested, synthetic | Sep 1–30 food displays 181% of $100, not 100% |
| Unknown and empty categories | Tested, synthetic | Imported $15 and Other $5 rendered |
| Light/dark layout | Tested at 897px | Screenshot inspected; no horizontal overflow; not a phone-size claim |
| Other settings / Simple mode / physical iPhone | Not tested this run | Remain pending rotating coverage |
- Daily and Monday reviews not due at this 06:47 Eastern run. No real financial operations or native cloud builds invoked.
- Production verification: 828af0aedd5685e2ff2b088f8a36e4c5c49068db Ready in 21s, Vercel 4SEJA8KzHoWQXofJ4QiXZ2NqZXd2. Canonical live Money all-history Spending tab shows All caption, no This month caption, and no monthly budget comparison. No records changed. Evidence retained locally for next commit.

## 2026-09-11 07:32 UTC — Restart recovery and Spending empty-state completion
- Restored synthetic preview after shutdown; saved source HEAD 828af0a and previous release evidence intact. No conflicting remote changes observed.
- One verified improvement: Spending tab now distinguishes an empty date period from no expense history and offers View all history when appropriate. New accounts get expense-specific guidance. Buttons use theme foreground and 44px targets. No artificial fifth change added; restart recovery and hands-on verification were completed before publishing this bounded correction.
- Browser checks: empty Jan 2024 period → Spending → View all history restores chart; truly empty fixture shows no-expense guidance; Add opens the expense form, Cancel closes without writes. Desktop viewport 1280, screenshot inspected, no horizontal overflow. Mobile/dark/Simple mode not re-tested this run.
- Daily reliability catch-up for missed September 10 checkpoint: consolidated preceding tested report drill-down, category reconciliation, period-budget scope and empty-state checks. Current run verifies restart and desktop recovery. Existing native signing, real billing lifecycle, bank-token security and physical-device evidence remain unverified; no blanket all-controls pass. September 11 daily checkpoint remains due after 9 AM Eastern.
- Strict lint passed; build completion recorded before release. No financial record changes, purchases, cloud native builds or account operations.
- Production build exited 0 on the final source tree; strict lint passed.
- Production verification: fda0855 pushed after remote race check; canonical live Finance Spending empty-period view displays new message and View all history successfully restores chart. No real records changed. Post-deploy evidence retained locally for next commit.

## 2026-09-11 08:32 UTC — Settings subscription restore and Simple mode coverage
- One substantive fix: Settings native Restore now releases its busy state on unexpected SDK rejection and displays recoverable feedback. Reproduced before editing using native-sdk-error: button stuck Restoring. After fix: Restore failed message and Restore enabled again. No actual store call or payment.
- Tests execute the actual Settings handler for active entitlement, no entitlement, returned error and thrown rejection. RevenueCat regressions, strict lint and production build passed.
- Did not force five changes: the reproduced subscription bug was fixed and verified while expanding previously pending Simple mode coverage. Native setup and sensitive backend launch work remain separately unverified.

### Coverage checkpoint — 2026-09-11 08:32 UTC
| Flow | Status | Evidence |
|---|---|---|
| Settings native Restore exception | Tested, synthetic | Failed before fix; message and unlocked button after fix |
| Simple Mode switch | Tested, synthetic | Reload applies Home/Money/Plan/More navigation |
| Simple Home → Money | Tested, synthetic | Short Home renders; Money navigation works |
| Money Spending chart in Simple mode | Tested, synthetic | Chart renders with Last 30 days caption |
| Desktop layout | Tested at 1280px | No horizontal overflow |
| Original preference restoration | Completed | Simple Mode turned back off in preview |
| Phone, physical iOS and live purchases | Not tested | No native certification claimed |
- September 11 daily checkpoint not due yet (04:32 Eastern). Production verification recorded after deploy.
- Production verification: Vercel deployment STuqCpGnoH9LJrWYwDytDKgwEaY1 Ready in 22s for exact commit 4354e0f15d91911220c58dc697ecd0bc5795187f. Direct local-filename asset comparison was inconclusive (HTML fallback), so no byte-for-byte match claimed. Native restore behavior verified only with SDK mocks/browser fixture, not real Apple restore. Evidence retained locally for next commit.

## 2026-09-11 10:36 UTC — Native configuration gate and readable annual chart caption
- Two substantive improvements completed: native release configuration wiring/preflight, and the reproduced annual chart caption fix. Did not inflate these into five; real native account/signing and restricted backend work remain unverified and were not bypassed.
- App Store ID and RevenueCat Apple public SDK key read build environment configuration. iOS CI checks presence/format before installing/building and maps APP_STORE_APPLE_ID into VITE_APP_STORE_ID. Missing/secret/other-platform/example keys fail without printing their values. No keys supplied, accounts authenticated, paid build started or native binary produced. Format success is not credential validity. Reference: https://www.revenuecat.com/docs/projects/authentication (public SDK keys only; secret keys remain server-side).
- Browser walkthrough found the year selector exposed YEAR-2026 in the spending caption. Shared formatter now displays 2026; rechecked after editing.
- Native preflight and RevenueCat targeted tests passed; date-range regressions and strict lint passed on combined code. Production build exited 0.

### Coverage checkpoint — 2026-09-11 10:36 UTC
| Flow | Status | Evidence |
|---|---|---|
| Native paywall load failure and Retry | Tested, synthetic | Initially unavailable; retry restores localized 5,99 EUR monthly price; absent annual remains disabled |
| Paywall to Money navigation | Tested, synthetic | Money renders transaction history |
| Money Spending tab and annual selector | Tested, synthetic | 2026 selected, totals/chart update and caption is readable year |
| Desktop light/dark chart layout | Tested at 1280px | Dark screenshot inspected, no horizontal overflow in light layout |
| Physical iOS, phone viewport, Simple mode | Not re-tested this run | Native signing/purchase and phone claims not made |
| Real financial mutations | Not performed | Synthetic/read-only checks only |
- September 11 daily reliability checkpoint is not due until 9 AM Eastern; weekly Monday checkpoint not due. Prior preserved release evidence included. Production verification follows push.
- Production verification: 684ec3597b40a45bc5ed2f78de569b09f6796c1d Ready in 20s on Vercel deployment 4z4BUS1ZsSzS5zjhL65wkxZk3ScP. Canonical live Money > Spending > 2026 shows the corrected annual caption and no YEAR-2026 label. Read-only production check; native preflight remains code/test verified, not a signed iOS build. Post-deploy evidence retained locally for the next coordinated commit.

## 2026-09-11 11:37 UTC — Platform-appropriate restore and accessible Net Worth entry
- Two useful fixes, not five: removed the web paywall's misleading Restore Purchases button (it merely opened Apple subscription settings); native restore remains available. Labeled Net Worth name/value and both selectors so assistive technology can identify every entry field. No billing backend or purchase behavior changed.
- RevenueCat regression suite passed, strict lint and final production build exited 0; diff check passed. Remote baseline verified at 684ec35.

### Coverage checkpoint — 2026-09-11 11:37 UTC
| Flow | Status | Evidence |
|---|---|---|
| Web paywall | Tested, synthetic | No misleading Apple Restore button; no checkout invoked |
| Native restore | Tested, synthetic SDK rejection | Restore remains visible; error appears and button unlocks |
| Paywall to Money | Tested, synthetic | Navigation renders transaction history |
| Net Worth Add Entry / Cancel | Tested, synthetic | Form opens; empty Save disabled; labels identify name, value, type, category; Cancel closes |
| Money Spending chart | Tested, synthetic | Settled donut and category legend inspected after animation |
| Light desktop layout | Tested at 1280px | No horizontal overflow |
| Phone, dark theme, Simple mode, real billing | Not re-tested this run | Remain explicitly pending coverage; no full launch certification |
- Five changes not forced: this run closed the two concrete walkthrough findings and preserved restricted/unverified launch work. Daily reliability review not due until 9 AM Eastern; weekly checkpoint not due. No real financial mutations or payments performed.
