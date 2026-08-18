# CLAUDE.md – Blackjack Card Counting Trainer

## Project Overview
Web-based Blackjack Card Counting Trainer with realistic shoe simulation (6 decks, 312 cards),
the **Hi-Lo** counting system, Basic Strategy, Illustrious 18 / Fab 4 Deviations, training modes,
and a full Casino Session table.

**PRD Document:** See `docs/blackjack-trainer-prd.docx` for full feature specifications.
**Decisions Log:** See `docs/decisions-log.md` for all architectural and product decisions.

## Resolved Product Decisions
- **Counting system:** **Hi-Lo only** in the UI (real card counters use Hi-Lo). The engine still
  defines the other systems — they are tested but intentionally not exposed in the UX.
- **Training modes:** Speed Drill, **Flashcards** (all basic-strategy hands + deviations; replaced
  the old "Table Counting"/"Deviations" modes), Bet Spread, Deck Estimation, plus the **Casino
  Session** (full multi-seat table) and a **Learn** theory page.
- **Training Plan:** the modes are no longer a flat menu. A placement test puts a learner on a
  **curriculum** of stages, and the **Plan** answers "what do I do next" on every visit. The
  curriculum is a pure module (`src/services/curriculum.ts`); a threshold decides *when* a stage
  is finished, never whether the work happened — a failed attempt still counts as practice.
- **Persistence:** **Local-first with cloud sync.** Login is required (Supabase Auth); the app still
  works offline via localStorage, and the cloud is the source of truth once signed in. Sessions,
  achievements, level/XP and the bankroll log all sync (see ADR-001).
- **Monetization:** **Stripe subscriptions** (monthly/yearly) gate a **Pro** tier. Server side runs on
  Supabase Edge Functions; entitlement is written only by the signature-verified webhook (see ADR-002).
- **UI Language:** English
- **UI Theme:** **Dark-luxury** (near-black `#070809` + gold `#d4a847`), in the style of
  Linear/Resend/Raycast. The Casino Session uses a realistic green-felt table within that shell.
- **First paint:** every visit opens on a **loading screen** tied to real load state — it holds at
  89% while auth and the route chunk are outstanding and gives up after 9s rather than stranding
  anyone. Two timelines: the first load of a session gets the welcome, every load after it gets
  the bar alone (`src/components/common/intro-sequence.ts`).
- **Gamification:** Achievements, levels/XP and daily/weekly challenges are implemented.

## Tech Stack
- **Framework:** React 19 with Vite 7
- **Language:** TypeScript (strict mode)
- **Styling:** Tailwind CSS 4 (`@theme` tokens; dark-luxury palette). Two faces: **Inter**
  for the interface (`--font-sans`) and **Instrument Sans** for display type
  (`--font-display`, used by the loading screen). Both self-hosted and subsetted in
  `public/fonts` with their OFL licences beside them — no runtime request leaves the origin
  for a font, deliberately.
- **State Management:** Zustand
- **Animations:** Framer Motion
- **Charts:** Recharts · **Icons:** lucide-react
- **Testing:** Vitest + @testing-library/react
- **Card Assets:** CSS/SVG-rendered cards (rank corner index + centre pip)
- **Persistence:** localStorage + **Supabase** (Auth, Postgres w/ RLS, Edge Functions). Local-first with
  cloud sync; login required. **Payments:** Stripe (subscriptions) via Edge Functions.

## Dev Server Commands

```bash
# Install dependencies:
npm install

# Dev Server starten (start):
npm run dev
# → Opens at http://localhost:5173

# Dev Server stoppen (stop):
# Press Ctrl+C in the terminal. This is a Windows machine — `lsof` does not
# exist here. To free the port when a process is orphaned, from PowerShell:
#   Get-NetTCPConnection -LocalPort 5173 | Select-Object -Expand OwningProcess | ForEach-Object { Stop-Process -Id $_ -Force }

# Run tests:
npm run test               # Watch mode
npm run test:run           # Single run
npm run test:coverage      # With coverage report

# Build for production:
npm run build
npm run preview            # Test production build locally

# Linting:
npm run lint

# Type checking:
npx tsc --noEmit

# Supabase (local development):
npx supabase start         # Start local Supabase
npx supabase stop          # Stop local Supabase
npx supabase db reset      # Reset local database
npx supabase migration new <name>  # Create new migration
```

## Architecture Rules (CRITICAL – enforce on every change)

1. **Engine is PURE TypeScript** – NO React imports in `src/engine/`
2. **Engine classes have NO side effects** – pure functions and classes only
3. **UI state lives in Zustand Stores** (`src/store/`)
4. **React components import ONLY from `store/`**, NEVER directly from `engine/`
5. **Every new file needs a corresponding `.test.ts` / `.test.tsx` file**
6. **All exported functions documented with JSDoc**
7. **No `any` types** – always use explicit types
8. **TDD approach**: Write tests FIRST, then implement
9. **Supabase access ONLY through `src/services/`** – never call Supabase directly from components
10. **Offline-first**: App must work without Supabase connection (localStorage fallback)

## File Structure

```
blackjack-trainer/
├── src/
│   ├── engine/                  # Pure TypeScript – NO React dependencies
│   │   ├── shoe/                # Shoe class, Fisher-Yates, Card types
│   │   │   ├── shoe.ts
│   │   │   ├── shoe.test.ts
│   │   │   └── types.ts
│   │   ├── counting/            # Counting systems, RC, TC, Deviations
│   │   │   ├── counting-system.ts
│   │   │   ├── deviations.ts
│   │   │   ├── counting-system.test.ts
│   │   │   └── types.ts
│   │   ├── strategy/            # Basic Strategy tables, S17/H17
│   │   │   ├── basic-strategy.ts
│   │   │   ├── basic-strategy.test.ts
│   │   │   └── types.ts
│   │   ├── betting/             # Bet Spread, Kelly Criterion
│   │   │   ├── bet-spread.ts
│   │   │   ├── bet-spread.test.ts
│   │   │   └── types.ts
│   │   └── rules/               # Casino rule sets, configuration
│   │       ├── casino-rules.ts
│   │       └── types.ts
│   ├── services/                # External service layer
│   │   ├── supabase/            # Supabase client, queries, auth
│   │   │   ├── client.ts
│   │   │   ├── auth.ts
│   │   │   ├── progress.ts
│   │   │   └── types.ts
│   │   └── storage/             # Abstraction: Supabase + localStorage fallback
│   │       ├── storage-service.ts
│   │       └── storage-service.test.ts
│   ├── store/                   # Zustand Stores
│   │   ├── game-store.ts
│   │   ├── training-store.ts
│   │   ├── auth-store.ts
│   │   └── settings-store.ts
│   ├── components/              # React UI components
│   │   ├── table/               # Card table, dealer, player hand
│   │   ├── cards/               # Card rendering, SVG, animations
│   │   ├── training/            # Training mode UIs
│   │   ├── analytics/           # Statistics, graphs
│   │   ├── auth/                # Login, signup, profile
│   │   └── common/              # Buttons, modals, layout
│   ├── hooks/                   # Custom React Hooks
│   ├── assets/                  # SVG cards, sounds, images
│   ├── styles/                  # Global styles, Tailwind config
│   └── types/                   # Global TypeScript types
├── supabase/
│   ├── migrations/              # Database migrations
│   └── seed.sql                 # Test data
├── tests/                       # Integration tests
├── docs/                        # Documentation
│   ├── blackjack-trainer-prd.docx
│   └── decisions-log.md
├── CLAUDE.md                    # THIS FILE
├── package.json
├── tsconfig.json
├── vite.config.ts
├── tailwind.config.ts
└── vitest.config.ts
```

## Naming Conventions

| Element | Convention | Example |
|---------|-----------|---------|
| Files | kebab-case | `shoe-engine.ts`, `count-display.tsx` |
| Classes/Interfaces | PascalCase | `ShoeEngine`, `CountingSystem` |
| Functions/Variables | camelCase | `dealCard`, `runningCount` |
| Constants | UPPER_SNAKE_CASE | `MAX_DECKS`, `DEFAULT_PENETRATION` |
| Enum values | PascalCase | `Suit.Hearts`, `Action.Hit` |
| Test files | `[name].test.ts` | `shoe.test.ts` |
| React components | PascalCase file + export | `CardDisplay.tsx` |
| Supabase tables | snake_case | `user_progress`, `session_stats` |
| CSS classes | Tailwind utilities | `bg-green-800`, `text-gold-400` |

## Key Domain Concepts

- **Shoe:** Array with `dealIndex` pointer, NOT `shift()`/`splice()` → O(1) per deal
- **True Count:** `Running Count / remaining decks`
- **Balanced System** (Hi-Lo, Omega II, Zen Count): RC after full deck = 0
- **Unbalanced System** (KO, Red 7): RC after full deck ≠ 0
- **Penetration:** Fraction of shoe dealt before reshuffle (0.65–0.85, default: 0.75)
- **Cut Card:** Checked AFTER a completed round, NOT mid-hand
- **Illustrious 18:** The 18 most important strategy deviations from Basic Strategy
- **Fab 4:** The 4 most important surrender deviations
- **S17:** Dealer stands on Soft 17 | **H17:** Dealer hits on Soft 17
- **Betting Correlation:** How well a counting system predicts favorable betting situations
- **Playing Efficiency:** How well a system predicts correct strategy deviations

## Feature IDs (PRD Reference)

| ID | Feature | Phase | Priority | Status |
|----|---------|-------|----------|--------|
| F-001 | Shoe Engine | Phase 1 | P0 | ✅ Done |
| F-002 | Blackjack Game Rules | Phase 1 | P0 | ✅ Complete |
| F-003 | Counting Engine | Phase 2 | P0 | ✅ Complete |
| F-004 | Basic Strategy Engine | Phase 1 | P0 | ✅ Complete |
| F-005 | Table UI (Casino Session) | Phase 3 | P1 | ✅ Rebuilt (dark-luxury, flow layout + animations) |
| F-006 | Training Modes | Phase 4 | P1 | ✅ Complete (Speed Drill, Flashcards, Bet Spread, Deck Estimation) |
| F-007 | Analytics & Statistics | Phase 5 | P2 | ✅ Complete — 2.0 redesign (dark-luxury; range-aware KPIs incl. training time, accuracy trend, practice heatmap, skill radar, real Casino Session edge from netProfit, weakest hands, insight hook). Pure derivations in `analytics-derive.ts`, hand-authored SVG charts in `AnalyticsCharts.tsx` |
| F-008 | Supabase Auth & Cloud Sync | Phase 3 | P1 | ✅ Complete (login required; sessions/achievements/level/bankroll sync, RLS default-deny; ADR-001) |
| F-010 | Sound Effects | Phase 5 | P2 | ✅ Complete |
| F-011 | Achievements / Levels / Challenges | Phase 5 | P2 | ✅ Complete |
| F-012 | Stripe Subscriptions & Pro Gating | Phase 6 | P1 | ✅ Code complete — Edge Functions + entitlement gating; needs Stripe dashboard wiring (docs/STRIPE-SETUP.md); ADR-002 |

## Known gaps — read before shipping

Live risks that exist right now. Each names who owns it, because "someone should" is how
these survive to production. Items that have been closed are recorded as closed rather than
deleted — the next reader needs to know the difference between "never an issue" and "was an
issue and was dealt with".

1. **The payment-path audit findings are not written down anywhere.** They live only in a
   chat transcript. The "before go-live" this entry used to carry is spent — the site is
   live and has taken a real card payment — so this is now a live system with unrecorded
   findings against it. They are not reconstructed from memory here on purpose: invented
   security findings are worse than none. **Darius owns** deciding whether the transcript
   still exists; if it does, they go into `docs/` before anything else, and if it does
   not, this entry should say so plainly instead of implying a to-do that nobody can act
   on.

2. **Sandbox Stripe events wrote real entitlements into the production database.**
   The `stripe_events` ledger in the production project holds events from
   **13 July 2026** — a month before Stripe went live. They passed signature
   verification because `STRIPE_WEBHOOK_SECRET` held the test-mode secret at the time,
   and the handler wrote the entitlement columns exactly as it does for a real payment.
   A test card unlocked Pro on a production account.

   Not exploitable today: the secret is the live one, so a test-mode event fails
   verification before anything is written, and the function holds only one secret. But
   that separation is a side effect of which secret happens to be set, not a rule the
   code states. Stripe stamps every event with `livemode`; `stripe-webhook/index.ts`
   does not look at it.

   Also in the ledger: `customer.subscription.created` counts **4**, and
   `customer.subscription.deleted` counts **2**. Two subscriptions were never explicitly
   ended. Worth reconciling against Stripe before that history matters.

3. **The advertised price and the price actually charged are set in two places that
   nothing keeps together.** `PLAN_OPTIONS` in `src/services/pro-features.ts` says
   CHF 8.90 / month; the amount charged comes from whichever price id sits in
   `STRIPE_PRICE_MONTHLY` / `STRIPE_PRICE_YEARLY` in the Supabase secrets. The 10 Aug
   test purchase was billed **7.90 CHF** on `price_1U2vOjR3rB09i6YB6G9IfaiB`, and two
   newer prices were created about 75 minutes later, after the Swiss VAT rate was set
   up. If the secrets still point at the old ids, the paywall shows one number and the
   till takes another. The file's own comment — "Keep these in sync with the Stripe
   Prices you create" — is a convention with no enforcement. **Darius owns** checking
   the two secrets; the durable fix is to stop displaying a hard-coded amount at all.

### Closed

- **The entitlement audit is resolved, and the payment path works end to end**
  (17 Aug 2026). The audit query below returned zero rows, which looked wrong: a real
  monthly Pro subscription had been bought on the live site and refunded, and the
  webhook writes Stripe's status verbatim — `canceled`, never `free`.

  ```sql
  select id, subscription_status, stripe_customer_id, current_period_end
  from public.profiles where subscription_status <> 'free';
  ```

  The `stripe_events` ledger settled it, because it survives what the profile row does
  not. Both halves of the transaction reached this database and both returned `200`:
  `checkout.session.completed` at `18:55:32.724138+00`, `customer.subscription.deleted`
  at `20:37:13.701964+00` — matching Stripe's own delivery log to the second once CEST
  is converted. So `canceled` *was* written.

  It reads `free` now because the row was re-created. `protect_entitlement_columns` is
  the only writer of `free` anywhere in the system, and only on `INSERT` by a caller
  that is not `service_role` — a deleted account signing up again. Confirmed:
  `select … from public.profiles where stripe_customer_id is not null` returns zero
  rows, so no profile carries a customer id at all. Nothing was granted outside the
  webhook, and there is nothing to revoke.

  The trigger erasing the trail is the correct trade: it is the same rule that stops a
  client granting itself Pro. The ledger is where payment history is meant to be read.

- **Stripe is live** (Aug 2026). Live keys are set at deployment on the real domain,
  never on localhost and never in the repo. Proven by use, not by configuration: a real
  monthly Pro subscription was bought on the live site and refunded again.
- **The entitlement migration is deployed** (1 Aug 2026). `pg_policies` on
  `public.profiles` returns exactly `profiles: read own` (SELECT) and `profiles: update own`
  (UPDATE) — no ALL, no INSERT, no DELETE — and `protect_entitlement_columns` reads
  `BEFORE INSERT OR UPDATE`. Verified against the running database, not inferred from a
  successful push.
- **Inter is self-hosted.** The `fonts.googleapis.com` `@import` is gone; one 48kB latin
  variable file (400–800) in `public/fonts`, preloaded, OFL beside it. Verified in a
  browser: zero requests to Google. That closes the GDPR/DSG exposure and removes a
  render-blocking third-party request from in front of the loading screen.

A full audit of the app along four axes — visual, comprehensibility, feedback, animation —
lives in `docs/AUDIT-2026-07-31.md`, with each item's verdict and what was deliberately
*not* changed.

## Implementation Workflow (for every feature)

1. Read feature spec in PRD (check Feature-ID)
2. Understand acceptance criteria
3. Define types (`types.ts`)
4. Write tests FIRST (TDD) → `npm run test`
5. Implement until all tests pass
6. Add JSDoc comments to all exports
7. Run `npm run lint` and `npx tsc --noEmit`
8. Update Feature status in this file (🔲 → ✅)
9. **When in doubt: ASK instead of guessing**

## Counting Systems Quick-Reference

```typescript
// Hi-Lo (balanced, Level 1) – Betting Correlation: 0.97
{ "2": 1, "3": 1, "4": 1, "5": 1, "6": 1, "7": 0, "8": 0, "9": 0, "10": -1, "J": -1, "Q": -1, "K": -1, "A": -1 }

// KO (unbalanced, Level 1) – NO True Count needed, IRC = -4 × (decks - 1)
{ "2": 1, "3": 1, "4": 1, "5": 1, "6": 1, "7": 1, "8": 0, "9": 0, "10": -1, "J": -1, "Q": -1, "K": -1, "A": -1 }

// Omega II (balanced, Level 2)
{ "2": 1, "3": 1, "4": 2, "5": 2, "6": 2, "7": 1, "8": 0, "9": -1, "10": -2, "J": -2, "Q": -2, "K": -2, "A": 0 }

// Zen Count (balanced, Level 2)
{ "2": 1, "3": 1, "4": 2, "5": 2, "6": 2, "7": 1, "8": 0, "9": 0, "10": -2, "J": -2, "Q": -2, "K": -2, "A": -1 }

// Wong Halves (balanced, Level 3) – uses fractions!
{ "2": 0.5, "3": 1, "4": 1, "5": 1.5, "6": 1, "7": 0.5, "8": 0, "9": -0.5, "10": -1, "J": -1, "Q": -1, "K": -1, "A": -1 }

// Red 7 (unbalanced, Level 1) – card COLOR matters for 7s!
// Red 7 = +1, Black 7 = 0, all other values same as Hi-Lo
```

## Supabase Schema (planned)

```sql
-- Core tables
users (managed by Supabase Auth)
user_profiles (id, username, created_at, preferred_system, settings_json)
session_stats (id, user_id, started_at, ended_at, mode, system, hands_played, accuracy, ...)
counting_errors (id, session_id, card, expected_count, user_count, timestamp)
training_progress (id, user_id, mode, level, best_score, total_practice_time)
```

## UI Theme Constants

```typescript
// Casino-realistic color palette
const THEME = {
  felt: '#1a6b3c',           // Green felt table
  feltDark: '#0d4f2b',       // Darker felt for borders
  wood: '#5c3a1e',           // Table rim
  gold: '#d4a847',           // Accents, chip highlights
  chipRed: '#c41e3a',        // Red chips
  chipBlue: '#1e3a8a',       // Blue chips
  chipGreen: '#15803d',      // Green chips
  chipBlack: '#1c1917',      // Black chips
  cardBack: '#1e3a8a',       // Card back color
  background: '#0a0a0a',     // Page background
  textPrimary: '#f5f5f5',    // Primary text on dark bg
  textSecondary: '#a3a3a3',  // Secondary text
  success: '#22c55e',        // Correct action
  error: '#ef4444',          // Wrong action
  warning: '#f59e0b',        // Warning/attention
};
```
