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
- **UI Theme:** **Dark-luxury only** (near-black `#070809` + gold `#d4a847`), in the style of
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

## Dev-only screens

Four routes that exist only under `import.meta.env.DEV` and never reach a production
bundle. They exist because the most important moments in this product are the hardest to
look at — the loading screen is over in a second, and the level-up popup sits behind the
login. What you cannot look at, you cannot judge.

| Route | What it is for |
|---|---|
| `/dev` | Loading-screen / intro-sequence harness |
| `/dev/loaders` | Spinner gallery, for picking one |
| `/dev/levels` | **All 25 levels side by side.** Click a card to open the *real* `LevelUpPopup` through the *real* store — the only way to see level 17 without earning 120,000 XP. Also carries a “reset explainer” control, since the don’t-show-again button writes to localStorage. |
| `/dev/motion` | **“Bloom” — a 12.8s title sequence on canvas.** One card becomes 52, which open into a rotating rosette, close into a dealer's fan, and give back the card they started from. Two earlier versions of this screen failed the same way and the lesson is worth keeping: the first animated the product's *vocabulary* (running count, true count, bet ramp) and meant nothing to anyone who did not already know those words; the second drew card **backs** — dark rectangles on a dark ground, monotone no matter how well lit. The colour in a deck is on the front. Faces up on green felt, suits stepping ♠♥♣♦ so red and black alternate around the ring. The model (`services/motion/deck-film.ts`) is a pure function of `(card, t)`, so the piece is seekable — which is what makes the scrubber a review tool rather than a toy. |

They are excluded from `i18next/no-literal-string` on purpose: read by whoever is building
the thing, never by a user. Guard new ones with the same ternary as the others — guarding
only the `<Route>` leaves the dynamic import in place and Rollup emits a chunk nothing can
reach.

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

1. **A failed checkout still produces no automatic signal.** It is not a
   webhook, so nothing in Stripe notices — and there is nothing server-side to
   notice it *with*, because the failures that matter here (a blocked preflight,
   a dead network, Supabase unreachable) never reach a server at all. Closing
   this properly needs a Supabase log drain or a client-side error reporter, and
   neither exists.

   What changed on 19 Aug 2026 is the half that was actively working against
   us: the paywall no longer answers with the thrown message. See *The error a
   customer reads is written for them* below. The reporting channel is the
   customer, and it is now open rather than blocked — but it is a person
   choosing to write in, not a signal, and it should not be mistaken for one.

2. **Cache headers are prepared but not applied.** Measured on 19 Aug 2026, not
   assumed: Caddy already sends an `ETag` on everything, so a returning visitor
   re-downloads nothing — they just *ask*, about thirty times, one conditional
   request per asset before the page paints. It costs round trips, not bytes,
   which makes this an optimisation rather than a hole.

   [`docs/traefik-cache-headers.yml`](./traefik-cache-headers.yml) is ready to
   paste, scoped to `/assets` only — the one place Vite content-hashes, and
   therefore the only place `immutable` is safe. **One blank remains** and it is
   the one that decides whether it works: the service name Dokploy generated,
   which cannot be read from here. Rollback is deleting the file.

3. **The business side is unproven.** Zero subscribers. The purchase path was
   exercised once, by hand, on 18 Aug 2026 — that is one data point, not a
   track record. Also untested: what a non-Swiss address does to the VAT line,
   which needs a deliberate test-mode run rather than a real address typed into
   a live checkout.

4. **Signature verification is still untested.** Everything else on the payment
   path now has a test — the write check, the Stripe-mode check, the price
   validation, the customer rules, the webhook's routing and ledger, and as of
   19 Aug the CORS allowlist. What remains is `constructEventAsync`, which is
   the Stripe SDK: testing around it means manufacturing a valid signature,
   which is its own risk and proves less than it looks. Left deliberately.

### Closed

- **The light theme is no longer a second-class rendering** (26 Aug 2026).
  Measured screen by screen in a browser rather than judged by eye, which
  mattered: the failures were not scattered mistakes but six assumptions, each
  made in one place and inherited everywhere.

  A colour that works on near-black does not work on white — the semantic
  green measured **1.86:1**, the top of the level ladder **1.05:1**, and the
  achievement metals **1.24:1**, all of them carrying meaning. Alpha does not
  blend symmetrically, so one dim-text ramp cannot serve both themes; it now
  has a floor per theme, and the dark one was quietly failing too. Gold does
  two jobs — accent type and button fill — that pull in opposite directions on
  a light ground, so the ink on gold became its own static token, which is also
  the correction of a change made earlier the same day in the wrong direction.
  Three cards carried a warm lift that is a gold glow over black and half-black
  over white. And two bars — the landing header, the credibility strip — were
  pinned near-black under theme-following text.

  Two rules came out of it worth keeping, and they outlived the theme that
  produced them. **The ink belongs to the fill, not to the theme** — the
  strategy chart's five action colours and every gold surface say so by name
  now, via `--color-on-gold`. And **measure, do not look**: white on the chart's
  yellow read 1.92:1 and the dim-text ramp 3.49:1, both of them in the dark
  theme, both invisible to the eye that had signed them off.

  **The light theme itself was then removed** (26 Aug 2026, same day). Dark
  luxury is the product's identity, the felt is green and the cards lie on
  black; two half-committed looks are weaker than one. Removed rather than
  hidden, so nothing unreachable is left behind — one commit, and `git revert`
  brings all of it back if that judgement changes.

- **A sign-out no longer costs progress** (26 Aug 2026). Two things lived only
  in `localStorage`, under `bjt_*` keys that the sign-out wipe clears as a
  security boundary — and unlike everything else it clears, they did not come
  back from the cloud.

  The **Casino Session Tracker** is a log of real-money bankroll figures, and
  signing out deleted it silently and for good. No fifth table was needed:
  `training_sessions.details` is jsonb, so the opening and closing bankroll and
  the table config now ride along in the session record and the tracker is
  rebuilt on sign-in. Sessions recorded before those fields existed are skipped
  rather than filled with zeros — a money chart with an invented starting
  balance looks exactly as authoritative as a real one.

  The **claimed-stage list** is the only thing between a finished curriculum
  stage and being paid for it twice. It was wiped the same way while the
  session history it is derived from came back, so every finished stage looked
  unpaid and paid again; level XP reconciles by `max`, so the inflated total
  then won the merge. Signing out was worth free XP, repeatedly. It travels in
  `profiles.settings` now — a jsonb column the schema already had — and merges
  as a union.

- **A session with no hands is no longer a session** (26 Aug 2026). Opening the
  casino table and leaving wrote a full record: 60 XP, a zero-hand row in the
  analytics and the tracker, and one third of the final curriculum stage, which
  asks for three casino sessions at `minAccuracy: 0`. Three open-and-close trips
  finished the last stage of the training plan without a card being dealt. The
  drill modes have had the equivalent threshold from the start; the casino path
  never grew one.

  Related, from the same sweep: only the **first** drill of a mode visit was
  ever recorded. The double-save guard was re-armed on a bfcache restore and
  nowhere else, and every summary screen offers "play again", which restarts
  the mode without unmounting it. The second round ran, ended, met a closed
  guard and vanished — no row, no XP, no error.

- **The error a customer reads is written for them** (19 Aug 2026). Four screens
  did `setError(e instanceof Error ? e.message : t(…))`, which puts whatever was
  thrown in front of a person. From `supabase-js` that is "Edge Function
  returned a non-2xx status code" — English, on a German paywall, at the moment
  someone had decided to pay. The translated fallback sitting right beside it
  only ran when the thrown thing was *not* an `Error`, which is almost never, so
  in practice it never ran at all.

  This was a **fifth class** of untranslated English, distinct from the three
  found during the i18n work and from the constants and JSX expressions: text
  that reaches the screen through `Error.message`, where no lint rule can see
  it. Worth remembering when the next one is hunted.

  The two halves are now split — `services/failure-log.ts` takes the cause to
  the console, and the component owns a translated sentence that never depends
  on what was thrown. `logFailure` returns `void` deliberately, so it cannot be
  put back into state. Checkout and portal failures name the contact address,
  because on those paths the customer writing in is the only report there will
  be; the data-reset failure does not, and instead says the thing the reader
  actually needs after confirming a destructive action — that nothing was
  deleted.

  Three existing tests asserted the old behaviour and had to be turned around,
  which is the useful part of the record: the defect was covered, and the
  coverage was pointed the wrong way.

- **The payment path is watched** (19 Aug 2026). Read in the dashboard rather
  than assumed, which mattered: **"Webhook errors" → e-mail was already on**, by
  Stripe's own default. Clicking it would have switched the alerting *off* and
  reported it as done. Everything that fails on the webhook path ends as a
  non-2xx, Stripe records a failed delivery, and the account owner is mailed.
  Also on by default: API integration errors, and changes to API keys.

  One row was genuinely off and is now on: **"Fehler bei der Generierung eines
  Webhook-Ereignisses"** — Stripe failing to *create* an event at all. That is
  the failure the rest is blind to by construction: no event means no delivery,
  no delivery means no failed delivery, and the webhook alert stays quiet while
  somebody has paid and no entitlement was written. Verified after a reload, not
  from the click.

  Worth knowing for the next reader: the livemode guard answers **202** on
  purpose, so a rejected test-mode event is not an error and correctly raises
  nothing. The alerting and the code agree on what counts as a problem.

- **The CORS allowlist has tests** (19 Aug 2026). It is a security boundary, not
  plumbing — echoing back whatever `Origin` arrives is
  `Access-Control-Allow-Origin: *` with extra steps, which would let any site on
  the internet start a checkout in a signed-in user's name. It was the last
  guard on the money path with no test, because `cors.ts` reads `Deno.env` at
  module load and is unreachable from the test run.

  The deciding moved to `_shared/origins.ts`, pure and covered: the apex/`www`
  pairing in both directions, trailing-slash handling on `APP_URL` and on the
  extra origins (a single stray slash produces an entry that looks right in the
  dashboard and matches nothing), lookalike hosts, and the scheme counting as
  part of the identity. All seventeen passed first run — the behaviour was
  already right, it just could not be shown.

- **The Dockerfile deployment is gone from the repo** (19 Aug 2026). `Dockerfile`,
  `nginx.conf` and `.dockerignore` described a way of shipping this app that has
  not been used since S54, when the switch away from Nixpacks was attempted for
  security headers and abandoned — Dokploy does not pass build arguments to
  Dockerfile builds, and the Dockerfile depended on exactly that
  (`ARG VITE_SUPABASE_URL`). Three files describing a deployment that does not
  exist, and the only thing referencing them was this list. Build verified clean
  after deletion.

- **Stripe will not file the VAT returns, and that is a decision** (19 Aug 2026).
  The Swiss registration sits at "action required" and stays there. That status
  concerns **collect-and-remit** — Stripe preparing and submitting returns as a
  paid add-on — not calculation, which was verified working on a live checkout
  (VAT 5.17 CHF stated separately on a 69.00 total). The GmbH files its own
  returns, so the service would duplicate an existing process.

  Recorded so nobody re-opens it as a defect. If the standing warning ever
  becomes annoying, the button next to it — "I file my own returns" — clears the
  status without committing to anything; it tells Stripe who files, it does not
  file.

- **`STRIPE_TAX_RATE_CH` is deleted** (19 Aug 2026). Left over from the
  fixed-rate approach `create-checkout-session` argues against; read by no code.
  Verified absent from `supabase secrets list`.

- **No open advisories in any dependency** (18 Aug 2026). `npm audit --omit=dev`
  had three high-severity findings: `react-router` / `react-router-dom`
  (RSC-mode CSRF bypass) and `ws` (uninitialised memory disclosure, plus a
  fragment-based DoS). All fixed by patch bumps with no API change —
  react-router 7.18.1 → 7.18.2, ws 8.19.0 → 8.21.3. `npm audit` reports zero
  across production *and* dev.

  Neither advisory obviously applied to this app, and that is exactly why they
  were patched rather than reasoned about: "probably does not apply" is only
  worth something if somebody writes down why, and a patch bump costs less than
  being right. Verified beyond the suite, because react-router is the routing
  core: client-side navigation `/` → `/login` → back, no crash, lazy chunk
  loads.

- **The purchase path was exercised end to end** (18 Aug 2026). Until then no
  `POST /v1/checkout/sessions` existed in the API log at all: the paywall was
  live and its purchase path had never been run in the configuration that
  actually ships — the same shape as the Origin Voice incident, where the only
  green test covered a different path than the one production used.

  Signed in, clicked Go Pro, chose yearly. Stripe's hosted checkout loaded on a
  `cs_live_` session showing 69.00 CHF, of which **VAT 5.17 CHF stated
  separately**, total due 69.00 CHF — exactly 8.1% inclusive. Session creation,
  automatic tax, and every claim the paywall and the Terms make about the price
  hold at the till. Nothing was paid.

- **The webhook's routing and its ledger have tests** (18 Aug 2026). The part
  with a history: the ledger row used to be written up front and left there,
  which turned Stripe's at-least-once delivery into at-most-once — a handler
  that threw returned 500, Stripe retried, the retry hit the unique key,
  answered "Already processed", and the event was gone. That fix was correct and
  had no test, which is how such a thing comes back. Routing and claim/release
  now live in `_shared/webhook-dispatch.ts` with everything injected, so a test
  needs no Stripe, no database and no Deno. `index.ts` is the wiring only.

- **A missing customer id no longer sells a second subscription** (18 Aug 2026).
  The refusal to sell to someone already paying consulted only the id stored on
  the profile, so a missing one skipped the check entirely — a fresh Stripe
  customer was created and the same person could be billed twice on one card.
  Checkout now asks Stripe: every customer under the user's email is checked for
  a live subscription, and one of them is **adopted** rather than another being
  added to the pile. Adopting matters as much as refusing — the customer portal
  needs that id, so refusing alone would leave someone billed with no way to
  cancel. Email is a weak identity in Stripe, but it is the only link that
  survives a Supabase user being replaced, and reusing a customer costs far less
  than billing twice.

- **The unchecked writes on the payment path are checked** (18 Aug 2026). Three
  instances of one defect: `supabase-js` neither throws nor reports a write that
  matched nothing, and only one of the three call sites remembered that. The
  Stripe customer id was written fire-and-forget, so a lost write left a paying
  customer **unable to reach the portal to cancel** — and disarmed the
  double-charge guard and the `past_due` downgrade along with it. The downgrade
  itself checked only `error`, so someone who stopped paying kept Pro while
  Stripe was told 200.

  The rule is now a named function, `_shared/db.ts` → `requireWrite`, used at all
  three sites. Checkout refuses the sale if the customer id did not land, before
  a Checkout Session exists and before anyone is charged.

- **The Edge Functions have tests** (18 Aug 2026). Deno is not installed here and
  a second test runtime is one nobody remembers to run, so the parts that carry a
  *rule* rather than plumbing moved into pure modules under
  `supabase/functions/_shared/` — the write check, the Stripe-mode check, and the
  price validation — and are covered by the ordinary `npm run test:run`. The
  remaining `index.ts` files are thin I/O around them. Not full coverage of the
  functions, and the audit still says so; but every guard on the money path now
  has a test that fails if it is removed.

- **The prices shown are the prices charged** (18 Aug 2026). `PLAN_OPTIONS` held
  CHF 8.90 / 69 as literals kept in step with Stripe by a comment; on 10 Aug the
  prices were re-cut for Swiss VAT and the page advertised 8.90 while the
  configured price billed 7.90. Amounts now come from Stripe at runtime via
  `get-plan-prices`. Verified live on `black-jack-training.com` in both plans and
  both languages, and against the deployed function directly
  (`{"monthly":890,"yearly":6900}`). The two superseded prices and the stray
  "Pro-Zugang" product are archived.
- **Sandbox events can no longer write production entitlements** (18 Aug 2026).
  The ledger's earliest rows are dated 13 July, a month before the live cutover:
  test-mode events that verified against the then-current secret and granted
  real Pro from a test card. The webhook now compares `event.livemode` against
  the mode implied by `STRIPE_SECRET_KEY` and answers 202 to anything from the
  other world. That the key is a live one is established by it successfully
  retrieving live prices, so the guard points the right way.
  The ledger's 4-created-vs-2-deleted gap was the July test subscriptions;
  Stripe's live subscription list is empty.
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

The payment path was re-audited on 18 Aug 2026 —
[docs/PAYMENT-PATH-AUDIT-2026-08-18.md](./PAYMENT-PATH-AUDIT-2026-08-18.md) lists what was
checked and found sound as well as what was not, so a later reader can tell "never examined"
from "examined and fine".

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
