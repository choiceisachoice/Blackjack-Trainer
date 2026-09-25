# ADR-003: Privacy-preserving website analytics on the existing Supabase

**Status:** Accepted
**Date:** 2026-09-25
**Deciders:** Darius (owner). Archon advisory.
**Extends:** [ADR-001](./ADR-001-auth-and-cloud-sync.md) (schema, RLS), [ADR-002](./ADR-002-stripe-premium-gating.md) (entitlements)

---

## Context

The operator wants to see, in a protected page, how many people visit
`black-jack-training.com`, how many pages they read, how long they stay, how
many register and how many pay — without a third-party analytics script and
without collecting more than those five numbers need.

What exists, read before anything was written:

| Question | Finding |
|---|---|
| Frontend | React 19 + Vite 7 SPA, `react-router-dom` 7, public pages prerendered in seven languages (`/de/learn` …), the app under `/app` with modes held in Zustand state, not routes. |
| Supabase client | `src/services/supabase/client.ts`; `null` when the env is missing (offline mode, tests, the demo recorder). Components never touch Supabase directly (rule 9). |
| Auth | Supabase Auth, `auth-store.ts`; `ProtectedRoute` gates `/app` and `/account`. |
| RBAC | **None.** Roles are Postgres' `anon` / `authenticated` / `service_role`; every table has per-user RLS (`id = auth.uid()`). There is no admin or owner flag anywhere — not on `profiles`, not in `app_metadata`. |
| Users | `public.profiles` (one row per `auth.users`, created by `handle_new_user`), `created_at` set at signup. |
| Stripe | `profiles.subscription_status` (`free`/`active`/`trialing`/`past_due`/`canceled`), written only by the signature-verified webhook (`protect_entitlement_columns`). `stripe_events` is the delivery ledger. |
| Analytics / tracking | Only the learner's own training analytics (`components/analytics/`). No page-view tracking, no event log, no third-party script. The privacy policy says so. |
| Deployment | Dokploy / Nixpacks on a Hetzner VPS, Caddy serving `dist`; migrations pushed by hand with `supabase db push`. |

Two constraints follow directly. The tables must be closed to the browser by
default like every other table here, and an anonymous visitor — who holds only
the public anon key — must still be able to record a page view.

## Decision

### Data model (one migration, `20260925120000_website_analytics.sql`)

- `analytics_visitors (id uuid, first_seen_at, last_seen_at)` — one row per random visitor id.
- `analytics_sessions (id, visitor_id, user_id?, started_at, last_activity_at, landing_page, exit_page, referrer_host?, device?, page_views)`.
- `analytics_page_views (id, session_id, visitor_id, user_id?, pathname, viewed_at)`.
- `app_admins (user_id)` — **the admin role this project did not have.** A row is added by the operator in the SQL editor; no client can insert one (no INSERT policy). A user may read their own row, so the client can decide whether to show the link.

`user_id` is `on delete set null`: deleting an account unlinks its sessions
rather than deleting the counts.

### The narrow door: two SECURITY DEFINER functions

`analytics_track(visitor_id, pathname, referrer_host, device)` and
`analytics_ping(visitor_id)` are the only way a browser writes analytics.
They run as their owner, so the tables need **no INSERT or UPDATE policy at
all** — the anon role cannot touch them except through these two functions,
which validate every argument, derive `user_id` from `auth.uid()` (never from
the client) and hold the session rule in one place.

Why DEFINER here, against Supabase's general advice to prefer INVOKER: an
INVOKER function would need the anon role to hold INSERT on three tables and
UPDATE on sessions. An UPDATE policy for `anon` on a table it can read nothing
from is a hole waiting for a WHERE clause; a definer function with
`search_path = ''`, schema-qualified names, `revoke … from public` and an
explicit `grant execute to anon, authenticated` is the smaller surface. Same
reasoning for `analytics_report(from, to, tz)`: the admin must count rows in
`profiles` they are not allowed to read, and a broad SELECT policy on
`profiles` for admins would put every user's email, Stripe id and progress in
the browser. The report function checks `is_app_admin()` first and returns
only aggregates.

### Session rule (documented in the SQL, enforced by the server)

A session is the visitor's most recent one **if its last activity is within
30 minutes**; otherwise the next page view starts a new session. The client
sends only its visitor id — the server decides. Duration is
`last_activity_at − started_at`; a session with one page view and no
heartbeat is 0 s, which is the honest number. The browser sends a heartbeat
once a minute while the tab is visible and one last ping when it is hidden, so
the last page counts.

### What the browser stores and sends

- `localStorage.bjt_visitor_id`: one random UUID. It matches the `bjt_*`
  prefix on purpose, so the sign-out wipe rotates it — the same person after
  sign-out is a new visitor, which errs toward under-counting, not tracking.
- Per page view: pathname (locale prefix included, so `/de/learn` and
  `/learn` are two pages), and on the first view of a session the referrer's
  **host** only and a device class (`mobile` / `tablet` / `desktop`).
- No IP address is stored anywhere. No user agent string. No screen size.

Tracking is off when Supabase is not configured, when the browser is driven
by automation (`navigator.webdriver` — the demo recorder), and when the
visitor sends Global Privacy Control or Do Not Track.

### Dashboard

`/admin/analytics`, behind `ProtectedRoute` and an `AdminRoute` that checks
`app_admins`. The route guard is a courtesy; the report function refuses
non-admins on its own. Ranges: today, yesterday, 7 days, 30 days, custom.
The account page shows an "Analytics" link to admins only.

### Registrations and paying customers

Registrations = `profiles` rows with `created_at` in the range. Paying
customers = rows with `subscription_status = 'active'`, counted **now** —
there is no history of when a subscription began, so this number does not
follow the range and the card says so. `trialing` and `past_due` are not
paying; `cancel_at_period_end` still is until the period ends.

### Retention

`analytics_purge(keep interval default '13 months')` exists and is **not
scheduled**. Scheduling it is a `cron.schedule` line documented in the
migration; the retention period is the operator's decision.

## Consequences

- Nothing existing changes: no table altered, no policy touched, no trigger
  redefined. The one new privilege concept (`app_admins`) is a table nobody
  can write from the browser.
- The anon key can call `analytics_track`; anyone can, as with any analytics
  endpoint. Inputs are validated and typed, but there is no per-IP rate limit
  — PostgREST has none. If abuse ever shows up, the same two functions can be
  fronted by an Edge Function without changing the schema.
- Consent: a random id in `localStorage` is disclosed in the privacy policy
  (updated with this change). Under Swiss law that is sufficient; a strict
  reading of the EU ePrivacy rules would want consent for any stored
  identifier that is not strictly necessary. The tracker has one gate,
  `services/analytics/consent.ts` → `analyticsAllowed()`; if a banner is ever
  required, it sets that flag and nothing else moves.
- The SQL is covered by tests that run the real migrations in PGlite (Postgres
  in WebAssembly) under `supabase/tests/`, because Docker is not available on
  the development machine and pushing untested SQL to the production database
  is not acceptable.
