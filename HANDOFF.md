# Yorbit — Handoff

**Written:** 2026-09-04
**Repo:** `C:\Users\Yosef\projects\yorbit-life-os`
**Owner:** Yosef Hamdi · yosefhamdi1998@gmail.com

Context for whoever picks this up: the app was built for four family members.
That assumption was retired when the decision was made to launch publicly —
App Store, strangers, real bank accounts. Everything below is graded against
*that* bar. A 7-section pre-launch audit was commissioned; Sections 1–4 are
substantially done, 5 partially, 6–7 not started.

---

## 1. Unfixed bugs, severity-ranked

### BLOCKER

**B1. Plaid access tokens are stored in plaintext.**
`connected_accounts.access_token_ref` is a plain `text` column (verified
against the live schema, not the snapshot file). Written at
`supabase/functions/plaid-exchange-token/index.ts:41`, read at
`plaid-sync-transactions/index.ts:~165`. The column name says "ref",
implying a pointer to a secret held elsewhere; it holds the raw token.

A Plaid access token grants ongoing read access to a real bank account.
Any database read compromise — leaked service key, future SQL injection,
stolen backup — hands over live bank access for every user at once, with
no expiry and no per-user revocation.

*Fix:* encrypt the column with AES-GCM via Web Crypto, key in a Deno env
secret. Needs a migration plus a re-encryption pass over existing rows.

**B2. Transaction dedup can both drop real transactions and create duplicates.**
`plaid-sync-transactions/index.ts:~275` keys on `` `${title}-${date}-${amount}` ``.
The live `transactions` table has 14 columns and **no Plaid transaction id**
(verified against `information_schema`), so there is nothing stable to key on.

Fails both directions:
- Two genuinely distinct transactions with the same merchant, day and amount
  (two identical coffees, a split bill) — the second is silently discarded.
  Real data loss, no error.
- Plaid refines `merchant_name` over time. A row imported as `SQ *COFFEE 12345`
  can return later as `Blue Bottle Coffee` — different key, no match,
  **inserted a second time**.

This is why "Pull full history" was called off. It gets worse the more
history is pulled.

*Fix:* add `provider_transaction_id text` with a unique index on
`(user_id, provider_transaction_id)`, store `tx.transaction_id`, dedup on
that. Existing 15,969 rows cannot be retrofitted — Plaid ids were never
stored.

**B3. Sync will time out on large accounts.**
`plaid-sync-transactions/index.ts:~290` does one `INSERT` per transaction in
a loop. A 5-year backfill for a new user is ~16,000 sequential round trips —
well past the edge function wall clock. Result: partial import behind a
generic error.

*Fix:* batch inserts in chunks of 500–1000.

### HIGH

**H1. Every page fetches the entire transaction history.**
Eight pages call `Transaction.list('-date', 50000)`:
`Dashboard.jsx:107`, `Finance.jsx:549`, `Budget.jsx:68`, `Recurring.jsx:27`,
`SaveMore.jsx:26`, `SpendingSummary.jsx:143`, `Totals.jsx:33`,
`CSVImport.jsx:404`.

**Measured: 7,130 kB of JSON per page load** for 15,700 rows. On a phone on
cellular this is the difference between an app that feels instant and one
that feels broken. Indexes exist (`idx_transactions_user_date`) so the query
is fine — the payload is the problem.

*Fix:* server-side aggregation for summary screens; pagination for the list.

**H2. `verify_jwt` is the only thing standing between the public anon key
and several endpoints.**
Three functions were found treating "the platform let this through" as
authorization. All three are fixed, but the pattern will recur: the anon key
ships in the frontend bundle, so **every visitor holds a key that passes
`verify_jwt`**. Any new system endpoint must call `requireSystemCaller()`.

**H3. `Access-Control-Allow-Origin` is unreachable on OPTIONS.**
Supabase's gateway answers preflight with `*` before function code runs.
The lockdown applies to the actual response, which is what governs whether
a browser can read it — but a reviewer will flag the preflight.

### MEDIUM

**M1. Service-role detection is a substring match.**
`authHeader.includes(SERVICE_ROLE_KEY)` in `requireSystemCaller` and both
sync functions. Not exploitable without the key, but an exact comparison
belongs there.

**M2. `full: true` is read straight from the request body.**
`plaid-sync-transactions/index.ts:~150`. Rate-limited to 10/hour now, but a
user can still force ten 5-year backfills an hour, each costing money at Plaid.

**M3. Partial failure in `plaid-exchange-token` leaves orphaned rows.**
The insert loop does `if (error) throw` mid-iteration with no transaction
wrapping it. Connecting a 4-account bank where the third insert fails leaves
two rows committed. Retrying inserts them again — there is no unique
constraint on `(user_id, provider_account_id)`.

**M4. Delete handlers are guarded per-row but `restoreBill` is not.**
`Bills.jsx` — `deleteBill` uses `useDeleteLock`; `restoreBill` has no guard.

**M5. `investment_holdings` is dead weight.** 0 rows. The Investments page
renders from transactions categorised `investment`, not from that table.

**M6. Legal pages say "Last updated: June 2026"** while the app's data
practices changed materially tonight.

### LOW

**L1.** `ai_usage_log` monthly sum is a full scan per request
(`ai-coach/index.ts:~80`). Fine at 4 users, wasteful at 10,000.
**L2.** `chart.jsx:61` uses `dangerouslySetInnerHTML` — reviewed, only
developer-defined chart colors reach it, no user input path. Documented so
nobody re-flags it.
**L3.** Rate-limit `identityFromRequest` falls back to IP when no user —
shared behind NAT, trivially rotated. Only used pre-auth.

---

## 2. Blockers before public launch

1. **B1** — encrypt Plaid access tokens.
2. **B2** — store `provider_transaction_id` and dedup on it.
3. **B3** — batch inserts so sync survives a real backfill.
4. **H1** — stop shipping 7 MB per page load.
5. **Rotate the three leaked credentials** (see §3).
6. **Email confirmation + CAPTCHA** in the Supabase dashboard before
   `signup_mode` goes to `open`. Neither is set; neither can be set from code.
7. **Privacy policy and terms reviewed by someone qualified.** Both pages
   exist but were not written for a public financial product.
8. **Error monitoring confirmed working end to end** — Sentry is wired
   (`main.jsx:8`, `ErrorBoundary.jsx:20`) and the DSN is in the bundle, but
   **it was never verified that an event actually arrives**. Do that before
   launch, not after.
9. **Onboarding + empty states** (Section 6, not started). A stranger with
   zero data currently lands on empty charts.

---

## 3. Only you can do these — numbered checklist

### 3.1 Rotate the Supabase secret key (do this first, in this order)

The cron authenticates by **substring-matching the service key in the
Authorization header**. Rotate out of order and bank sync dies silently.

1. Supabase Dashboard → Settings → API Keys → reveal current secret key.
   **Copy it somewhere first.**
2. Generate the new secret key. *Do not revoke the old one yet.*
3. Dashboard → Edge Functions → Secrets. Confirm
   `SUPABASE_SERVICE_ROLE_KEY` is set to the **new** key.
   (Supabase usually injects this automatically — verify, don't assume.)
4. Redeploy every function so they pick up the new secret:
   ```bash
   for f in ai-coach delete-account cleanup-duplicate-records \
            generate-subscription-reminders weekly-custom-record-analysis \
            plaid-create-link-token plaid-exchange-token \
            plaid-sync-transactions plaid-sync-holdings sync-all-accounts; do
     npx supabase functions deploy "$f" --project-ref pvjiialxboslqyiiybpe
   done
   ```
5. Dashboard → Database → Cron Jobs. Any job whose SQL embeds the old key
   in an `Authorization` header must be edited to the new one.
6. **Confirm the cron survived** — wait for the next scheduled run, then:
   ```sql
   select started_at, status, imported_count, error_count, message
   from bank_sync_logs order by started_at desc limit 10;
   ```
   Fresh rows = alive. No new rows after a scheduled run = step 5 was missed.
7. Only after 6 passes, revoke the old key.

### 3.2 Rotate the other two leaked credentials

8. **Supabase personal access token** (`sbp_…`) — account-level. Dashboard →
   Account → Access Tokens.
9. **Anthropic API key** (`sk-ant-…`) — console.anthropic.com. Update the
   `ANTHROPIC_API_KEY` edge function secret, then redeploy `ai-coach` and
   `weekly-custom-record-analysis`.

All three appeared in the session transcript at
`C:\Users\Yosef\.claude\projects\C--Users-Yosef\*.jsonl`, which is
**unredacted on local disk**. The iCloud copies are redacted and verified
clean; the local originals are not.

### 3.3 Supabase dashboard settings (cannot be set from code)

10. Auth → Providers → Email → **require email confirmation**.
11. Auth → **enable CAPTCHA** (hCaptcha or Turnstile).
12. Auth → Rate limits → review signup/OTP limits.

### 3.4 Domains and support

13. **Decide the support address.** Currently `yosefhamdi1998@gmail.com` —
    a personal Gmail — appears in `Support.jsx:24`, `PrivacyPolicy.jsx:79`,
    and `Register.jsx:56`. Fine for four family members, wrong for a public
    finance app.
14. **Decide the domain.** `yorbit.app` was invented by me and does not
    exist. Do not ship anything referencing it.

### 3.5 Apple / App Store

15. `src/lib/appStoreConfig.js` — `APP_STORE_ID` and `REVENUECAT_API_KEY`
    are both empty strings. The file documents exactly what to create.
16. Create the two subscription products (`app.yorbit.pro.monthly`,
    `app.yorbit.pro.yearly`) and the RevenueCat `pro` entitlement.

### 3.6 Plaid

17. **Verify production approval status.** Cannot be determined from the
    repo. The code hardcodes `PlaidEnvironments.production` in all four
    Plaid functions, which means either it is approved or those calls are
    failing.
18. Decide whether to rotate Plaid access tokens (16 appeared in the
    transcript). Rotating means users reconnect their banks.

### 3.7 Payments

19. `create-checkout` and `stripe-webhook` exist in the repo but **are not
    deployed** — the gateway returns `NOT_FOUND`. Payments are not wired.

---

## 4. Where the app still assumes a small trusted group

1. **`signup_mode = 'invite_only'`** in `app_settings`. Flip with
   `update app_settings set value='open' where key='signup_mode';` — but do
   §3.3 first.
2. **Support is one person's Gmail** (§3.4).
3. **The shared $15/month AI budget** still exists alongside the new
   per-user tiers. When the shared cap trips, Coach dies for *everyone*.
   At current measured cost (~$0.009/message) that is ~1,667 messages/month
   across all users. Fine at 4 users; at 1,000 the shared cap is the thing
   that breaks first.
4. **`DAILY_REQUEST_LIMIT_PER_USER = 40`** is generous for a family member
   and generous for an abuser.
5. **No admin UI.** `profiles.role = 'admin'` gates `cleanup-duplicate-records`
   and `sync-all-accounts`, but the only way to grant it is direct SQL.
6. **Legal pages** written in a personal register, not reviewed for a public
   financial product.

---

## 5. Invented or placeholder values still in the code

| Value | Location | Status |
|---|---|---|
| `support@yorbit.app` | — | **REMOVED.** I invented it; replaced with the real Gmail. Do not reintroduce. |
| `yorbit.app` domain | product IDs in `appStoreConfig.js` comments | Does not exist. Product ids are placeholders. |
| `APP_STORE_ID = ''` | `src/lib/appStoreConfig.js:17` | Empty. Required before submission. |
| `REVENUECAT_API_KEY = ''` | `src/lib/appStoreConfig.js:18` | Empty. Caused the hanging spinner now fixed. |
| `$4.99/mo`, `$29.99/yr` | `appStoreConfig.js` comments | Not configured anywhere real. |
| "Last updated: June 2026" | `PrivacyPolicy.jsx:16` | Stale. |
| `COST_PER_1K_*` | `ai-coach/index.ts:29-35` | **Verified 2026-09-04** against claude.com/pricing for Sonnet 5 ($2/$10 per MTok). Re-verify if `MODEL` changes. |

---

## 6. What a fresh session needs to know

### Architecture

React 18 + Vite + Tailwind + shadcn/ui, Supabase (project ref
`pvjiialxboslqyiiybpe`), Plaid production, Recharts, Sentry.

Deployed twice from one repo:
- **Vercel** ← `master` (production branch is `master`, **not** `main`)
- **GitHub Pages** ← `gh-pages`

`src/api/base44Client.js` is a compatibility shim emulating a previous
"base44" SDK. `entities.*` calls go **straight to Postgres** through
supabase-js under RLS; only a handful of things go through edge functions.
That is why deleting `save-bill` and `custom-forms` was safe.

### Build and deploy

**Builds must run in PowerShell.** Git Bash mangles `--base=/yorbit-life-os/`
into a Windows path.

```powershell
$env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
npm run build -- --base=/yorbit-life-os/
```

Then push `master` (Vercel auto-deploys), and for Pages:
`git worktree add /tmp/gh_deploy origin/gh-pages` → copy `dist` → push.

A Vercel **Ignored Build Step** stops `gh-pages` pushes from deploying:
`if [ "$VERCEL_GIT_COMMIT_REF" = "gh-pages" ]; then exit 0; else exit 1; fi`

### Patterns established — follow these, don't reinvent

**Submit locks.** `setState` + `disabled={saving}` **cannot** stop a fast
double-tap: React batches, so every tap in the same tick runs before the
re-render. Only a synchronously-mutated ref works. Three separate bugs came
from this — duplicate transactions, resurrected bills, and goal
contributions that silently *lost* money (both taps read the same stale
base and the second overwrote the first).
Use `src/hooks/useSubmitLock.js` (forms) and `src/hooks/useDeleteLock.js`
(per-row deletes, wrapping the framework-free `src/lib/reentryLock.js`).

**Enum source of truth.** `src/lib/enums.js` + `npm run check:enums`, which
queries live database constraints and exits 1 on drift. Two silent bugs came
from duplicated category lists. Never hand-write an enum list twice.

**Error IDs.** `errorResponse()` in `supabase/functions/_shared/cors.ts`
returns `YORB-XXXXXXXX` to the user and logs the same id with the real
cause. Alphabet excludes `0/O/1/I/L` and all vowels so it survives being
read aloud and cannot spell words. Never return raw `error.message` to a
browser.

**Rate limiting.** `_shared/rateLimit.ts` + the `check_rate_limit` Postgres
function. Counters live in Postgres because edge functions are stateless and
horizontally scaled — an in-process counter enforces nothing. The
increment-and-test is one atomic statement. It **fails open** deliberately.

**System endpoint gate.** `requireSystemCaller()` in `_shared/supabase.ts`.
Any endpoint acting across all users must call it.

**Secret redaction.** `scripts/lib/secretPatterns.js` is the single source;
`export-session.js` redacts **at write time**, not after.

### Tests

`npm test` runs five suites: enums, venmo mapping, delete lock, redaction,
AI context, error ids. All plain node scripts — no framework.

### Traps that cost real time tonight

1. **A test that re-implements the logic it tests is worthless.** The Venmo
   test passed while the shipped mapper was inverted, because the test
   restated the logic instead of importing it. Import the real module, and
   assert exact expected values, never "not empty."
2. **Postgres evaluates uncorrelated subqueries once.** A rate-limit test
   showed 5/5 calls allowed; the counter read 1. The test was wrong, not the
   limiter.
3. **The Supabase gateway rejects before your code runs.** Testing with a
   missing/garbage token proves nothing about your authorization logic — the
   gateway returns `{"code":"UNAUTHORIZED_..."}`. **Test with the anon key**,
   which passes the gateway and reaches your code. That single test found
   three separate auth bypasses.
4. **Threading `req` for CORS.** The first CORS lockdown would have broken
   GitHub Pages, because most `jsonResponse` call sites didn't pass `req` and
   every response carried the primary origin. Test *each* origin.
5. **Git Bash mangles `--base=/...`.** Use PowerShell for builds.
6. **`supabase link` prompts for a database password.** Any script that runs
   it with output redirected to `/dev/null` looks frozen with an invisible
   prompt.
7. **The Windows Desktop is OneDrive-redirected** (`C:\Users\Yosef\OneDrive\Desktop`),
   and file extensions are hidden. Launchers live in `C:\YORBIT`.

### Backups

`C:\YORBIT\Backup Yorbit Now.bat` → encrypted snapshot into
`iCloudDrive\Yorbit Backups`. `Verify Backup Now.bat` proves it decrypts and
parses. The plaintext snapshot is written to a **non-synced** local folder
and deleted after encryption — never let it be written inside a synced
directory. Last verified backup: 15,969 transactions, 25 tables, 16,059 rows.

**Run a backup before any migration.**

---

## 7. Honest read on the gap

The app works, the data is real, and it is genuinely useful to the person
who built it. The bugs fixed tonight were not cosmetic — duplicate
transactions, bills that came back from the dead, and goal contributions
that silently vanished are all "this app is lying to me about my money"
problems, and every one was found by looking rather than by being reported.
That is the honest good news: the foundation is sound enough that a careful
audit finds real bugs instead of finding rot.

The gap to *a stranger trusts this with their bank account* is not mainly a
features gap. It is four things:

**Plaid tokens sit in plaintext.** One database compromise is a bank breach
for every user simultaneously. This is the single thing that would turn a
bad day into a catastrophe, and it is unfixed.

**The dedup is wrong in both directions.** Silently dropping a real
transaction and silently duplicating another are both unacceptable in a
product whose entire value proposition is "these numbers are true." A user
who notices will never trust it again, and most will not notice.

**Nobody finds out when it breaks.** Sentry is wired but unverified. If this
fails for a stranger at 2am, the current mechanism for learning about it is
that they email a personal Gmail address.

**The first five minutes are unbuilt.** A stranger signing up today lands on
empty charts with no guidance. Sections 6 and 7 were never started, and
Section 6 is the one that decides whether anyone comes back.

None of that is a reason not to launch — it is a reason to launch to a small
number of people you can talk to, with the tokens encrypted and the dedup
fixed first. The distance from here to that is days of focused work, not
months. The distance to *App Store, thousands of strangers* is longer, and
most of it is Section 6 and the legal work, not the engineering.

The engineering discipline established tonight is worth preserving. Log
before fixing, ask "one bug or a pattern?" after every fix, and write tests
that fail before and pass after. That question found additional instances
**every single time it was asked** — one double-submit became fourteen, one
auth bypass became three, one missing redaction pattern became sixty-eight
leaked keys. Whoever picks this up should assume the same is true of
whatever they find next.
