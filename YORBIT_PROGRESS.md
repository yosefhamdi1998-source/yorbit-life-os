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
