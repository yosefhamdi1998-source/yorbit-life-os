# Yoglow — Personal Finance App

A production-ready personal finance app built on Base44 (React + Vite + Tailwind + shadcn/ui). Tracks transactions, budgets, bills, goals, net worth, habits, tasks, health, and journals with AI insights, bank sync, and Stripe/RevenueCat monetization.

## Tech Stack
- **Frontend:** React 18, Vite, Tailwind CSS, shadcn/ui (Radix), framer-motion, recharts, react-router-dom v6
- **Backend:** Base44 BaaS (entities, backend functions, automations, AI agents)
- **Monetization:** Stripe (web) + RevenueCat/Capacitor (iOS/Android in-app purchases)
- **Bank Sync:** Plaid (production credentials configured)
- **AI:** Base44 InvokeLLM + 3 custom in-app agents

## Quick Start
```bash
npm install
npm run dev
```

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
  api/            — base44Client (pre-initialized SDK)
base44/
  entities/       — JSON schema definitions (database models)
  functions/      — Backend functions (entry.ts each)
  agents/         — AI agent configs (JSONC)
  config.jsonc    — App config
```

## Entities (Database Models)
| Entity | Purpose |
|--------|---------|
| Transaction | Income/expense records with category, date, notes |
| Bill | Recurring bills with due dates, paid status |
| Budget | Monthly category spending limits |
| Goal | Personal goals with milestones, progress, savings |
| SavingsGoal | Named savings targets with progress |
| NetWorthEntry | Assets & liabilities for net worth tracking |
| Habit | Daily/weekly habit tracker with streaks |
| Task | Todo items with priority, status, due dates |
| HealthLog | Daily weight, sleep, water, steps, mood, energy |
| JournalEntry | Journal with mood tags |
| Note | Notes with tags, pin, AI summary |
| Notification | Event alerts (bill due, goal, info) |
| CustomForm | User-defined forms with custom fields |
| CustomRecord | Data entries for custom forms |
| Subscription | Stripe/RevenueCat subscription state |
| ConnectedAccount | Plaid/Teller bank connections |
| BankSyncLog | Sync run history |
| AIInsightCache | Cached AI briefings/coaching |

All entities have RLS set to `true` for all operations (public app, user-isolated by default).

## Backend Functions
| Function | Purpose |
|----------|---------|
| createCheckout | Stripe Checkout session creation (web) |
| stripeWebhook | Stripe webhook handler (subscription lifecycle) |
| deleteAccount | Full account + data deletion (App Store compliance) |
| saveBill | Bill creation/update helper |
| generateSubscriptionReminders | Checks recurring bills due in 3 days, creates notifications |
| syncAllAccounts | Daily bank sync via Plaid (scheduled 6 AM) |
| plaidCreateLinkToken | Plaid Link token generation |
| plaidExchangeToken | Plaid public token → access token exchange |
| plaidSyncTransactions | Fetch transactions from Plaid |
| customForms | Custom form/record CRUD |
| cleanupDuplicateRecords | Dedup utility |
| weeklyCustomRecordAnalysis | Monday 9 AM AI analysis of custom records |

## AI Agents
| Agent | Purpose |
|-------|---------|
| financial_advisor | Reads Budget, Transaction, Bill, CustomForm/CustomRecord; gives financial advice |
| subscription_budget_advisor | Analyzes recurring payments and budget health |
| savings_motivation_coach | Encouragement based on journal logs |

## Key Pages
- **Dashboard (`/`)** — Hero summary (income vs expenses, net worth), upcoming bills, goal progress, recent transactions
- **Finance (`/finance`)** — Transaction CRUD, spending charts, net worth tracker, AI briefing & coach
- **Budget (`/budget`)** — Category budgets with progress bars, export menu
- **Bills (`/bills`)** — Bill tracking with paid/recurring status
- **Spending Summary (`/spending-summary`)** — Donut/bar/trend charts with monthly/biweekly/yearly views, CSV+PDF export
- **Goals (`/goals`)** — Goal management with milestones and savings progress
- **Coach (`/coach`)** — AI financial advisor chat
- **Bank Sync (`/bank-sync`)** — Plaid connection management (feature-flagged)
- **Settings (`/settings`)** — Account, subscription, data export, account deletion, share/rate
- **Upgrade (`/upgrade`)** — Pro subscription (Stripe + RevenueCat)
- **Onboarding (`/onboarding`)** — Multi-step intro carousel
- **Notifications (`/notifications`)** — Alert center

## Integrations
### Stripe (Live Mode)
- **Products:** MoneyGlow Pro Monthly ($4.99/mo), Yearly ($29.99/yr)
- **Secrets:** STRIPE_SECRET_KEY, STRIPE_PUBLISHABLE_KEY, STRIPE_WEBHOOK_SECRET (all set)
- **Webhook endpoint:** `https://yorbit-life-os.base44.app/functions/stripeWebhook`
- Checkout flow checks for iframe context and blocks if inside preview

### RevenueCat (iOS/Android)
- Config in `src/lib/appStoreConfig.js` — **API key placeholder needs to be set**
- Entitlement: `pro`
- Product IDs defined in appStoreConfig.js

### Plaid (Bank Sync)
- PLAID_CLIENT_ID, PLAID_SECRET set (production tier)
- Feature flag in `src/lib/features.js`

## Feature Flags (`src/lib/features.js`)
- `bankSync` — Plaid integration (requires production credentials verified)
- `launchChecklist` — Internal launch tracking pages

## App Store Readiness
- ✅ Privacy Policy (`/privacy-policy`) and Terms of Use (`/terms-of-use`)
- ✅ Account deletion flow in Settings
- ✅ Support page (`/support`) with FAQ
- ✅ Onboarding flow
- ✅ Loading/empty/error states across pages
- ✅ Mobile-first responsive design with bottom tab nav
- ⚠️ Requires App Store Connect setup (app IDs, subscription products, RevenueCat keys)
- ⚠️ RevenueCat API key placeholder in `src/lib/appStoreConfig.js`

## Design System
- Colors: CSS custom properties in `src/index.css` (light + dark themes)
- Tailwind config maps tokens to utility classes in `tailwind.config.js`
- Gradients: `.gradient-primary`, `.gradient-finance`, etc.
- Cards: `.sky-card` (glassmorphic light, solid dark)
- Font: Inter

## Known Issues & TODOs
1. RevenueCat API key placeholder needs production value
2. App Store Connect setup pending (subscription products, RevenueCat dashboard)
3. Custom Forms feature exists in backend but limited UI access
4. Google Sheets sync paused (needs manual OAuth setup)
5. Test transactions in database (user chose to keep them)

## Environment Secrets (set in Base44 Settings → Secrets)
- STRIPE_SECRET_KEY, STRIPE_PUBLISHABLE_KEY, STRIPE_WEBHOOK_SECRET
- PLAID_CLIENT_ID, PLAID_SECRET
- (Test variants also set for development)

## Build & Deploy
- Base44 handles hosting and deployment
- For local dev: `npm run dev`
- Capacitor config at `src/capacitor.config.ts` for iOS/Android builds