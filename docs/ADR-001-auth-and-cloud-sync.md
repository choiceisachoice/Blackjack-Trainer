# ADR-001: Authentication & Cloud Sync (Supabase)

**Status:** Proposed (for review)
**Date:** 2026-07-09
**Deciders:** Darius (owner). Christian only if deployed onto his infrastructure or on a security concern.

## Context

The Blackjack Trainer is feature-complete and fully **offline-first**: all state
lives in 14 `localStorage` keys (`bjt_sessions`, `bjt_achievements`,
`bjt_level_xp`, `bjt_bankroll_tracker`, `bjt_casino_session_tracker`, daily/weekly
challenges, sim counters, preferences). No accounts, no backend.

We now want **accounts** — as a prerequisite for Stripe premium (ADR-002, later)
and to sync progress across devices. `@supabase/supabase-js` is already a
dependency, and `StorageService` (an interface with `LocalStorageService`)
was written to anticipate a `SupabaseStorageService`. So the seams exist.

**Forces:**
- Real accounts + (later) real money → **security-first** (RLS, secrets hygiene).
- Darius wants "the best, effort no object, time available" — favor the correct
  long-term design over the quick hack.
- Auth **must** come before Stripe (payments need a user to attach a role to).
- Don't rebuild auth primitives (sessions, hashing, OAuth) by hand before payments.

**Decisions already made (owner):** Supabase Auth · login **required** · normalized data model.

## Decision

1. **Supabase Auth** for identity (email/password + OAuth later; JWT sessions; RLS).
2. **Login required to use the app**, but implemented **local-first**: the client
   caches state locally and treats Supabase as the source of truth, with
   background sync — so "login required" does **not** mean "no offline training."
3. **Deliberately normalized schema** — normalize what we will query
   (sessions, achievements, real-money log); keep singular per-user profile
   fields + preferences compact. Not one-table-per-localStorage-key.

## Data Model

Four real tables + JSONB where a table would be over-engineering. RLS on all.

```sql
-- One row per user; small singular state + preferences.
create table profiles (
  id             uuid primary key references auth.users(id) on delete cascade,
  username       text,
  level_xp       integer not null default 0,
  best_streak    integer not null default 0,
  onboarding_seen boolean not null default false,
  selected_system text not null default 'hi-lo',
  sim_count      integer not null default 0,
  sim_best_edge  integer not null default 0,
  settings       jsonb not null default '{}',   -- theme, sound{enabled,volume}, ambient_volume, dealing_speed
  challenge_state jsonb not null default '{}',   -- daily/weekly progress (small, transient)
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- Append-only training record — the core queryable data (analytics, later leaderboards).
create table training_sessions (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  mode           text not null,
  counting_system text not null,
  started_at     timestamptz not null,
  duration_seconds integer not null,
  total_questions integer not null,
  correct_answers integer not null,
  accuracy       real not null,
  best_streak    integer not null,
  details        jsonb not null,                 -- mode-specific SessionDetails (varied shape → stays JSONB)
  created_at     timestamptz not null default now()
);
create index on training_sessions (user_id, started_at desc);

-- Which achievements a user has unlocked (union-mergeable across devices).
create table user_achievements (
  user_id        uuid not null references auth.users(id) on delete cascade,
  achievement_id text not null,
  unlocked_at    timestamptz not null default now(),
  primary key (user_id, achievement_id)
);

-- Real-money casino log (the Bankroll Tracker). Own table → history/analytics.
create table bankroll_sessions (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  played_on      date not null,
  casino         text,
  hours_played   real not null default 0,
  result         numeric not null default 0,     -- profit/loss
  starting_bankroll numeric,
  final_bankroll numeric,
  meta           jsonb not null default '{}',     -- accuracies, grade, config, etc.
  created_at     timestamptz not null default now()
);
create index on bankroll_sessions (user_id, played_on desc);
```

**Why `details`/`settings`/`meta` stay JSONB:** session details are a
discriminated union with a different shape per mode; preferences are never
queried server-side. Normalizing those would add tables and migrations for zero
query benefit — the wrong kind of "thorough."

### Row-Level Security (mandatory, default-deny)

```sql
alter table profiles            enable row level security;
alter table training_sessions   enable row level security;
alter table user_achievements   enable row level security;
alter table bankroll_sessions   enable row level security;

-- profiles: a user sees/edits only their own row
create policy "own profile" on profiles
  for all using (id = auth.uid()) with check (id = auth.uid());

-- the rest: rows are owned via user_id
create policy "own rows" on training_sessions
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own rows" on user_achievements
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own rows" on bankroll_sessions
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
```

A trigger (or client upsert on first login) creates the `profiles` row.

## Sync Strategy (local-first + auth)

- Keep the `StorageService` seam. Add `SupabaseStorageService` implementing it,
  plus a thin **local write-through cache** so the UI stays instant and works offline.
- **Reads:** hydrate Zustand stores from Supabase on login into a local cache;
  serve from cache thereafter.
- **Writes:** optimistic local update + async Supabase upsert. If offline, queue
  and flush on reconnect.
- **Conflicts:** minimal (single user). `training_sessions`/`user_achievements`
  are append/union → no conflict. `profiles` fields (xp, streak) use
  last-write-wins with `updated_at`; `level_xp`/`best_streak` merge as `max`.
- **First login migration (one-time):** push existing `localStorage` `bjt_*`
  data up, then mark migrated. Never silently discard local progress.

## Options Considered

### Option A — Supabase Auth + normalized + local-first (proposed)
| Dimension | Assessment |
|---|---|
| Complexity | Med–High (sync layer is the cost) |
| Cost | Supabase free tier ample at this scale |
| Scalability | Good (indexed, RLS, room for leaderboards) |
| Security | Strong (managed auth, RLS default-deny) |
| Familiarity | Supabase is in the plan / learning material |

**Pros:** correct long-term shape; queryable data; keeps offline; no hand-rolled auth.
**Cons:** sync/merge + migration logic is real work; more moving parts.

### Option B — Supabase Auth + single JSONB progress blob
**Pros:** fastest to ship; trivial sync (whole-state upsert).
**Cons:** no server-side queries (no leaderboards/analytics without unpacking);
whole-blob writes get heavy as sessions grow. Rejected given "want the best."

### Option C — Own auth module
**Pros:** full control.
**Cons:** you own session security, hashing, token rotation, OAuth, email flows —
more attack surface + maintenance, right before handling money. Rejected.

## Trade-off Analysis

The one real tension is **"login required" vs. the current instant/offline UX.**
Local-first-with-auth resolves it (accounts *and* offline) at the cost of a sync
layer. Given time is available and this is the foundation payments sit on,
paying that cost once is the right call. To de-risk, **build it in two phases**
(online-only cloud first, then add the offline cache/queue) rather than big-bang.

## Consequences

- **Easier:** cross-device progress; a real user to attach Stripe `role=premium`
  to; server-side analytics/leaderboards later.
- **Harder:** every store that persists now has a cloud path; testing needs an
  auth context; a login gate + migration are new surfaces.
- **Revisit:** if leaderboards/social land, `training_sessions` may need
  aggregate/materialized views; `challenge_state` may graduate out of JSONB.

## Security Checklist (non-negotiable)

- RLS enabled + default-deny on **every** table (verify: no table without a policy).
- `anon` key is public (safe behind RLS); **`service_role` key never in client code**.
- Secrets in `.env.local` (git-ignored); only `VITE_`-prefixed public vars reach the client.
- Email confirmation on signup; Supabase auth rate-limiting on.
- Migration must **merge, never overwrite/discard** existing local progress.

## Action Items

**Phase 1 — Auth + cloud (online-only first):**
1. [ ] Darius: create Supabase project; add `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` to `.env.local` (git-ignored).
2. [ ] SQL migrations: 4 tables + RLS policies + `profiles` auto-insert trigger.
3. [ ] `src/services/supabase/client.ts`, `auth.ts`.
4. [ ] `auth-store.ts` (session/user, signUp/signIn/signOut, `onAuthStateChange`).
5. [ ] Login/Signup screen; gate the app on auth.
6. [ ] `SupabaseStorageService implements StorageService`; hydrate Zustand stores from Supabase on login.
7. [ ] One-time local→cloud migration (merge).

**Phase 2 — Local-first hardening:**
8. [ ] Local write-through cache + offline write queue + reconnect flush.
9. [ ] Merge rules (max for xp/streak; union for achievements; append for sessions).

**Then:** ADR-002 — Stripe premium (webhook verification, idempotency/outbox, `role=premium`).
