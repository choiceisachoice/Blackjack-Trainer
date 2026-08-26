# Blackjack Trainer

A web app for learning to count cards at blackjack — properly, in the order the
skill is actually built, rather than as a pile of disconnected drills.

**Live:** [black-jack-training.com](https://black-jack-training.com)

It runs a realistic six-deck shoe, teaches the Hi-Lo count, basic strategy and
the Illustrious 18 / Fab 4 deviations, and finishes at a full multi-seat casino
table with bots, splits, insurance and payouts. A placement test puts a learner
on a curriculum, and the plan answers "what do I do next" on every visit. Seven
languages. Free tier and a paid tier, with real Stripe subscriptions behind it.

---

## What is interesting about it, technically

Most of the difficulty in this project is not the blackjack. It is that the app
handles money, syncs across devices, has to stay usable offline, and is read by
people in seven languages — and any one of those can quietly corrupt the others.

**The engine is pure TypeScript with no React in it.** `src/engine/` holds the
shoe, the counting systems, basic strategy, the deviation tables and the betting
maths. It has no side effects and no framework, which is why it can be tested
exhaustively and reused by the bots, the drills and the analytics without three
copies of the rules drifting apart.

**Local-first, cloud-authoritative.** The app works offline against
`localStorage` and reconciles with Supabase on sign-in — union-merging what only
ever grows and taking the max of the counters. Sign-out wipes the device, which
is a security boundary rather than a convenience: without it, the sync layer
would push the previous user's training history into whoever signs in next.
See [ADR-001](docs/ADR-001-auth-and-cloud-sync.md).

**Entitlement is written by exactly one thing.** The Stripe webhook, verified by
signature, running as `service_role`. Row-Level Security is default-deny and a
trigger reverts any other write to the entitlement columns, so a client cannot
grant itself the paid tier even if everything in front of it is compromised.
See [ADR-002](docs/ADR-002-stripe-premium-gating.md).

**Prices come from Stripe at runtime.** They used to be literals kept in step by
a comment, and on 10 August 2026 they went out of step — the page advertised one
amount while the configured price charged another. A comment is not a mechanism.

## What the repository is worth reading for

Two audit documents, written to be read by someone who was not there:

- [`docs/PAYMENT-PATH-AUDIT-2026-08-18.md`](docs/PAYMENT-PATH-AUDIT-2026-08-18.md)
  — what on the money path was checked and found sound, as well as what was
  *not*, so a later reader can tell "never examined" from "examined and fine".
  The common cause of five defects: `supabase-js` neither throws nor reports a
  write that matched nothing.
- [`docs/AUDIT-2026-07-31.md`](docs/AUDIT-2026-07-31.md) — a pass over the whole
  app along four axes, including what was deliberately left alone.

`CLAUDE.md` carries a **Known gaps** section listing live risks with an owner
each, and records closed items as closed rather than deleting them — the next
reader needs to tell "never an issue" from "was an issue and was dealt with".

## Stack

React 19 · TypeScript (strict) · Vite 7 · Tailwind 4 · Zustand · Framer Motion ·
Recharts · three.js · i18next

Supabase — Auth, Postgres with RLS, Edge Functions (Deno) · Stripe subscriptions

Vitest + Testing Library · Docker via Dokploy on a Hetzner VPS

## Running it

```bash
npm install
npm run dev          # http://localhost:5173
```

Supabase and Stripe are optional for local work. With neither configured the
app falls back to `localStorage`, and every gated mode is open — there is no
billing backend to ask, so refusing would only make the app untestable. Pro is
otherwise *derived* from the subscription status and period end rather than
stored, so it cannot drift out of step with Stripe. Copy `.env.example` to
`.env` to wire the real thing up. No secret belongs in the repository, and none
is in it.

```bash
npm run test:run     # 2200+ tests across 131 files
npm run typecheck    # app and test projects
npm run lint         # includes type-aware no-floating-promises
npm run build
```

## Layout

```
src/engine/      Pure TypeScript. No React, no side effects. The rules.
src/store/       Zustand stores. The only thing components talk to.
src/services/    Supabase, Stripe, storage, achievements, curriculum, XP.
src/components/  UI, grouped by feature.
src/i18n/        Seven locales, with a parity test over the message trees.
supabase/        Migrations and Edge Functions; `_shared` holds the tested rules.
docs/            ADRs, audits, the Stripe setup guide, the decisions log.
```

Every module has a test file beside it. Roughly 26,000 lines of tests against
40,000 lines of source — the payment path, the shoe, the counting systems and
the strategy tables carry the most.
