# CLAUDE.md – Blackjack Card Counting Trainer

## Project Overview
Web-based Blackjack Card Counting Trainer with realistic shoe simulation (6 decks, 312 cards), 6 counting systems, Basic Strategy, Illustrious 18 / Fab 4 Deviations, and 5 training modes.

**PRD Document:** See `docs/blackjack-trainer-prd.docx` for full feature specifications.
**Decisions Log:** See `docs/decisions-log.md` for all architectural and product decisions.

## Resolved Product Decisions
- **MVP Scope:** ALL 5 training modes included (Speed Drill, Table Counting, Deviations, Bet Spread, Deck Estimation)
- **Persistence:** Supabase (Cloud-Sync, User Accounts, Progress Tracking)
- **UI Language:** English
- **UI Theme:** Casino-realistic (green felt table, dark background, gold accents)
- **Gamification:** Deferred to post-MVP

## Tech Stack
- **Framework:** React 18+ with Vite
- **Language:** TypeScript (strict mode)
- **Styling:** Tailwind CSS
- **State Management:** Zustand
- **Animations:** Framer Motion (Motion)
- **Testing:** Vitest + @testing-library/react
- **Card Assets:** SVG-based (David Bellot CC-licensed or equivalent)
- **Backend/Auth:** Supabase (PostgreSQL, Auth, Row-Level Security)
- **Deployment:** Vercel (Free Tier)

## Dev Server Commands

```bash
# Install dependencies:
npm install

# Dev Server starten (start):
npm run dev
# → Opens at http://localhost:5173

# Dev Server stoppen (stop):
# Press Ctrl+C in the terminal, or:
kill $(lsof -t -i:5173)    # Kill Vite default port

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
| F-005 | Table UI | Phase 3 | P1 | ✅ Complete (with bug fixes) |
| F-006 | Training Modes (all 5) | Phase 4 | P1 | ✅ Complete |
| F-007 | Analytics & Statistics | Phase 5 | P2 | 🔲 Not started |
| F-008 | Supabase Auth & Persistence | Phase 3 | P1 | 🔲 Not started |

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
