# MoneyGlow — Personal Finance App

A personal finance app (React + Vite + Tailwind + shadcn/ui) tracking transactions,
budgets, bills, goals, net worth, and custom forms, with an AI coach, bank sync, and
Stripe/RevenueCat monetization. Originally built on Base44; migrated to a
self-hosted Supabase backend — see `MIGRATION_STEPS.md` for the full migration
record and what's still pending.

## Tech Stack
- **Frontend:** React 18, Vite, Tailwind CSS, shadcn/ui (Radix), framer-motion, recharts, react-router-dom v6
- **Backend:** Supabase (Postgres + Auth + Row Level Security + Edge Functions + Realtime)
- **AI:** Anthropic Claude via the `ai-coach` / `weekly-custom-record-analysis` Edge Functions
- **Monetization:** Stripe (web) + RevenueCat/Capacitor (iOS/Android) — code present, disabled by default
- **Bank Sync:** Plaid — code present, disabled by default

## Quick Start
```bash
npm install
npm run dev
```
Requires a `.env` with `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` — see `.env.example`.
The database schema (`supabase/schema.sql`) must be run once in the Supabase SQL Editor
before the app has any tables to talk to.

## Project Structure
```
src/
  pages/          — Route-level screens (Dashboard, Finance, Budget, Bills, etc.)
  components/     — Reusable UI + feature components
    ui/           — shadcn/ui primitives
    finance/      — Finance-specific components
    dashboard/    — Dashboard-specific components
    forms/        — Custom forms feature
  hooks/          — useGoBack, useProStatus, usePullToRefresh, use-mobile
  lib/            — utils, AuthContext, query-client, features, appStoreConfig, revenuecat, platform
  api/            — supabaseClient, entities (generic CRUD), base44Client (compatibility shim)
supabase/
  schema.sql      — All tables, RLS policies, triggers, pg_cron jobs
  functions/      — Edge Functions (Deno), one per subfolder
base44/
  entities/, agents/, functions/, config.jsonc  — Original Base44 schema definitions,
  kept only as historical reference for the entity shapes; no longer live or read by the app.
```

## Database (Supabase Postgres)
18 tables, all with RLS enabled and scoped to `auth.uid() = user_id`: `transactions`,
`bills`, `budgets`, `goals`, `savings_goals`, `net_worth_entries`, `habits`, `tasks`,
`health_logs`, `journal_entries`, `notes`, `custom_forms`, `custom_records`,
`ai_insight_caches`, `notifications`, `connected_accounts`, `bank_sync_logs`,
`subscriptions` — plus `profiles` (auto-populated on signup) and `advisor_conversations`
/ `advisor_messages` (the AI Coach chat log, Realtime-enabled). Full definitions in
`supabase/schema.sql`. RLS isolation has been verified live with a two-account test —
see git log.

## Edge Functions (`supabase/functions/`)
| Function | Purpose | Status |
|----------|---------|--------|
| ai-coach | AI Coach chat + one-off LLM calls (Anthropic) | Not deployed — needs `ANTHROPIC_API_KEY` + a Supabase personal access token |
| weekly-custom-record-analysis | Weekly per-user AI analysis of custom form records | Not deployed |
| generate-subscription-reminders | Notifies on subscription-category bills due within 3 days | Not deployed |
| cleanup-duplicate-records | One-time dedup utility, admin-only | Not deployed |
| delete-account | Full account + data deletion, must stay server-side (deletes the auth user itself) | Not deployed |
| custom-forms, save-bill | Superseded — the client now calls the generic Entity CRUD directly instead (see `src/pages/Forms.jsx`, `Bills.jsx`); kept for reference | Bypassed, not needed |
| create-checkout, stripe-webhook | Stripe billing | Not deployed, billing disabled |
| plaid-create-link-token, plaid-exchange-token, plaid-sync-transactions, sync-all-accounts | Plaid bank sync | Not deployed, disabled |

Deploying any of these needs `supabase functions deploy <name>` via the Supabase CLI,
which requires logging into your Supabase account (`supabase login`) — see
`MIGRATION_STEPS.md` Step 4.

## Key Pages
- **Dashboard (`/`)** — Income vs expenses, budget/bill/goal summaries, recent transactions
- **Finance (`/finance`)** — Transaction CRUD, spending charts, net worth tracker
- **Budget (`/budget`)** — Category budgets with progress bars
- **Bills (`/bills`)** — Bill tracking, paid/recurring status, overdue detection
- **Spending Summary (`/spending-summary`)** — Charts with monthly/biweekly/yearly views, CSV+PDF export
- **Goals (`/goals`)** — Goals with milestones and savings progress
- **Coach (`/coach`)** — AI financial advisor (Pro-gated; needs `ai-coach` deployed to actually respond)
- **Forms (`/forms`)** — Custom forms + records
- **CSV Import (`/csv-import`)** — Import transactions from a bank CSV export
- **Bank Sync (`/bank-sync`)** — Plaid connection UI (feature-flagged off)
- **Settings (`/settings`)** — Account, data export, account deletion, dark mode
- **Onboarding (`/onboarding`)** — Multi-step intro carousel

## Feature Flags (`src/lib/features.js`)
- `bankSync` — Plaid integration UI (edge functions not deployed, so connecting won't work yet)
- `launchChecklist` — internal dev-only pages, must stay `false` before any public release

## Auth
Email/password with a 6-digit OTP verification step, Google OAuth (needs a client
ID/secret added in the Supabase dashboard), and password reset via Supabase's
recovery-link flow. See `src/lib/AuthContext.jsx` and `src/api/base44Client.js`
(the auth/entities shim — keeps the same call shape as the original Base44 SDK so
most pages needed no changes).

## Known gaps
1. AI Coach, `deleteAccount`, and the other Edge Functions above aren't deployed yet
2. Google OAuth not configured in the Supabase dashboard
3. Stripe billing and Plaid bank sync are intentionally disabled (code present, no live keys)
4. RevenueCat / Capacitor native app packaging is a config file only — `@capacitor/core` etc.
   aren't installed; turning this into an actual iOS/Android build is separate future work
5. `src/pages/OAuthConsent.jsx` was a Base44-platform-specific feature (letting AI clients
   connect via OAuth) with no Supabase equivalent — not routed, needs a decision on whether
   to rebuild it or remove it

## Design System
- Colors: CSS custom properties in `src/index.css` (light + dark themes)
- Tailwind config maps tokens to utility classes in `tailwind.config.js`
- Cards: `.sky-card` (glassmorphic light, solid dark)
- Font: Inter
- Responsive: bottom tab nav below the `lg` (1024px) breakpoint, sidebar above it
