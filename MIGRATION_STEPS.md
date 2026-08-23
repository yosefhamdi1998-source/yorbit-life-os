# Yoglow: Base44 → Supabase — full migration package

This is everything needed to move off Base44, built against your actual 146-file
codebase (not just the generic plan). Hand this whole folder to **Claude Code**
(desktop, VS Code, or terminal) — that's where `npm install`, a live Supabase
project, and iterative testing actually happen. This chat can't run any of that.

## What's in this package

```
supabase/schema.sql                        — all 18 tables (15 entities + profiles + advisor chat), RLS, cron
supabase/functions/*/index.ts              — 12 Edge Functions (11 ported + new ai-coach)
supabase/functions/_shared/*.ts            — shared CORS + Supabase client helpers
src/api/supabaseClient.js                  — Supabase client init
src/api/entities.js                        — generic CRUD matching base44's list/filter/create/update/delete shape
src/api/base44Client.js                    — drop-in `base44` object shim (entities, auth, functions, AI)
src/lib/AuthContext.jsx                     — REWRITTEN (not a shim — see "Auth" below)
src/pages/ResetPassword.jsx                 — REWRITTEN (Supabase's recovery flow works differently)
scripts/1-export-from-base44.mjs           — pulls all your live data out of Base44
scripts/2-import-to-supabase.mjs           — creates matching Supabase users + imports data
.env.example
```

## What changed from the original plan doc

The first-pass plan said auth was "wired, one setting to change." Having now read
`AuthContext.jsx`, `app-params.js`, and the auth pages directly, that undersold it:
your app talks to Base44's own hosted `/api/apps/public/...` endpoint and manages
tokens via URL params + localStorage — that's Base44's proprietary app-hosting
layer, not a swappable auth client. **`AuthContext.jsx` needed a real rewrite**,
which is included above. `Login.jsx`, `Register.jsx`, `ForgotPassword.jsx`, and
`Settings.jsx` did **not** need changes — they only call `base44.auth.*` methods,
which the shim (`base44Client.js`) reimplements with matching signatures.
**`ResetPassword.jsx` did need a rewrite** — it expected a `?token=` query param;
Supabase's recovery link instead creates a session automatically via a URL hash,
so the page now waits for that session instead.

## Step 1 — Supabase project + schema

1. Create a project at supabase.com (free tier is fine to start).
2. SQL Editor → paste all of `supabase/schema.sql` → Run. It creates every table,
   RLS policy, the `profiles` auto-populate trigger, and the advisor-chat tables.
   The `pg_cron` job definitions at the bottom will fail silently on placeholder
   URLs until you do Step 4 — that's expected, don't worry about it yet.
3. Settings → API: copy your Project URL and anon key into `.env` (see `.env.example`).

## Step 2 — Auth configuration (dashboard, not code)

1. **Google OAuth**: Authentication → Providers → Google → add your OAuth client ID/secret.
2. **Email templates**: your app's Register flow shows a 6-digit OTP input
   (`Register.jsx`), so under Authentication → Email Templates → "Confirm signup",
   switch to the `{{ .Token }}` code template (not the magic-link default) —
   otherwise users get a link instead of a code and the OTP screen never gets filled.
3. **Redirect URLs**: Authentication → URL Configuration → add your deployed
   app's `/reset-password` and `/` paths to the allow list, or the recovery link
   and OAuth redirect will bounce.

## Step 3 — Swap the code

```bash
npm uninstall @base44/sdk @base44/vite-plugin
npm install @supabase/supabase-js
```

Copy in `src/api/supabaseClient.js`, `src/api/entities.js`, `src/api/base44Client.js`
(overwrite the old one), `src/lib/AuthContext.jsx`, and `src/pages/ResetPassword.jsx`
from this package. Remove the `@base44/vite-plugin` entry from `vite.config.js`.

Then `npm install && npm run dev` and test: register (OTP flow), log in, Google
login, forgot/reset password, add a transaction, add a bill, add a custom form + record.

## Step 4 — Deploy the Edge Functions

```bash
supabase functions deploy delete-account
supabase functions deploy custom-forms
supabase functions deploy save-bill
supabase functions deploy cleanup-duplicate-records
supabase functions deploy generate-subscription-reminders
supabase functions deploy weekly-custom-record-analysis
supabase functions deploy ai-coach
# Only when you re-enable the disabled features:
supabase functions deploy create-checkout
supabase functions deploy sync-all-accounts
supabase functions deploy plaid-create-link-token
supabase functions deploy plaid-exchange-token
supabase functions deploy plaid-sync-transactions
# stripe-webhook is called by Stripe itself, which can't send a Supabase JWT:
supabase functions deploy stripe-webhook --no-verify-jwt
```

Set secrets once (these never go in `.env`, never reach the browser):
```bash
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
# When billing/bank-sync are re-enabled:
supabase secrets set STRIPE_SECRET_KEY=... STRIPE_WEBHOOK_SECRET=...
supabase secrets set PLAID_CLIENT_ID=... PLAID_SECRET=...
```

Then go back to `supabase/schema.sql`'s cron section, replace `<PROJECT_REF>` and
`<SERVICE_ROLE_KEY>` with your real values, and re-run just those three
`select cron.schedule(...)` blocks in the SQL Editor.

## Step 5 — Data migration (your existing users' data)

Neither the original plan nor a schema swap alone gets your live data across —
this needs an explicit export/import pass:

```bash
# 1. Export everything from the still-running Base44 app
BASE44_APP_ID=xxx BASE44_ACCESS_TOKEN=xxx node scripts/1-export-from-base44.mjs

# 2. Dry-run the import first — fixes data problems before touching real tables
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/2-import-to-supabase.mjs --dry-run

# 3. Real import
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/2-import-to-supabase.mjs
```

**Passwords cannot be migrated** — Base44's password hashes aren't portable to
Supabase's auth system. The import script creates a matching Supabase auth user
per email and immediately sends them a password-reset email, so plan for a
"we've upgraded — check your email to set a new password" step in your cutover
communication to users.

## Step 6 — Things that need your decision, not just code

- **`OAuthConsent.jsx` does not port.** It's a hand-rolled page hitting Base44's
  own `/api/apps/{id}/mcp/consent-info` and `/authorize-grant` endpoints — this is
  Base44's platform feature for letting AI clients (Claude, Cursor, etc.) connect
  to your app via OAuth. Supabase has no equivalent. Decide whether this feature
  matters to you: if not, delete the page and its route; if so, it needs a custom
  OAuth-provider implementation from scratch (out of scope here — say the word
  and I'll help design that separately).
- **`base44.agents.*` (AdvisorChat.jsx)** is replaced with a much simpler
  conversation-log + Realtime table pair (`advisor_conversations`/`advisor_messages`,
  in schema.sql) plus the new `ai-coach` function's `advisor_chat` mode. It is
  **not** a general agent platform — good enough for this one chat UI, not a
  drop-in for base44's full agents SDK if you build more agent features later.
- **`deleteAccount` was widened.** The original Base44 function only deleted 9 of
  the 15 entity types (missing Goals, Habits, Tasks, HealthLogs, JournalEntries,
  Notes, CustomForms/Records, Notifications) and never deleted the account/auth
  user itself. The rewritten version deletes all 18 tables' rows for that user
  *and* the Supabase auth user. If you actually want the old, narrower behavior,
  trim the `ENTITY_TABLES` list in `supabase/functions/delete-account/index.ts`.
- **`weeklyCustomRecordAnalysis` was fixed to be per-user.** The original pulled
  every user's custom records into one combined prompt and posted one shared
  notification — in a multi-tenant app that's a cross-user data leak, not just a
  quality issue. The rewrite groups by user and sends each their own analysis.
- **`cleanupDuplicateRecords` was rewritten as generic dedup logic**, since the
  original deleted a hardcoded list of ~46 specific Base44 record IDs that can't
  exist in the new Postgres tables (fresh UUIDs). Run it once post-migration,
  then it's safe to leave deployed or remove.

## Step 7 — Verify RLS actually isolates users

Before trusting this in production, prove it with two real (or test) accounts.
In the SQL Editor, `set role authenticated; set request.jwt.claim.sub = '<user-a-uuid>';`
then try to `select * from transactions where user_id = '<user-b-uuid>'` — it
should return zero rows. Repeat for a couple of tables. Supabase's dashboard also
has a "Impersonate user" tool under Authentication for a faster manual check
through the actual app UI.

## Step 8 — Indexes

`schema.sql` already includes indexes on `(user_id, date)`, `(user_id, due_date)`,
etc. for the tables the app filters/sorts on most (`transactions`, `bills`,
`tasks`, `health_logs`, `journal_entries`). If you add new query patterns later,
check `explain analyze` on the slow query before assuming an index will help.

## Not covered here (flag if you want these next)

- File/image uploads: confirmed there are none in this codebase (no
  `UploadFile`/`integrations.Core.UploadFile` calls anywhere), so nothing to port.
- CSV import (`CSVImport.jsx`) reads/writes only through `base44.entities.Transaction`,
  already covered by the generic shim — no separate work needed there.
- Stripe/Plaid: fully ported but left disabled by your earlier choice; flip them
  on by setting the relevant secrets and deploying those functions per Step 4.
