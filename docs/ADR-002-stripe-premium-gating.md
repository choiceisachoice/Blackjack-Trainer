# ADR-002: Stripe Subscriptions & Premium Gating

**Status:** Accepted
**Date:** 2026-07-10
**Deciders:** Darius (owner). Archon advisory.
**Supersedes/extends:** [ADR-001](./ADR-001-auth-and-cloud-sync.md) (auth + cloud sync)

---

## Context

The trainer now has Supabase Auth with a required login, RLS-protected per-user data,
and full cloud sync (sessions, achievements, level/XP, bankroll). The next step is
monetisation: a **Pro tier** that unlocks the advanced training modes and the full
analytics picture.

Three forces shape the decision:

1. **The app has no server.** It is a pure client-side Vite SPA. Stripe *cannot* be
   integrated securely from the client: creating a Checkout Session needs the secret
   key, and granting an entitlement must be driven by a **signature-verified webhook**,
   never by a client callback (`success_url` is trivially forgeable).
2. **Real money.** Webhook signature verification and idempotency are non-negotiable
   from day one, not a later hardening pass.
3. **The product goal** (Darius): free must genuinely teach — the user should think
   *"this trainer is actually making me better"* — while the full self-assessment
   picture (advanced analytics) is what creates the pull to upgrade.

---

## Decision

### 1. Server side: **Supabase Edge Functions** (Deno)

Two functions:

| Function | Auth | Job |
|---|---|---|
| `create-checkout-session` | Requires user JWT | Look up/create the Stripe customer, create a Checkout Session for the chosen price, return the URL |
| `stripe-webhook` | **No JWT** (public, verified by signature) | Verify signature, dedupe by event id, update the user's entitlement with `service_role` |

The webhook function must be deployed with `--no-verify-jwt` (Stripe does not send a
Supabase JWT) — its authentication *is* the Stripe signature.

### 2. Billing model: **Subscription, monthly + yearly**

Two Stripe Prices on one Product. Stripe **Customer Portal** handles cancel / payment
method / invoice history, so we do not build billing UI.

### 3. Entitlement storage: on `profiles` (extends ADR-001's table)

```sql
alter table public.profiles
  add column stripe_customer_id     text unique,
  add column subscription_status    text not null default 'free',
    -- 'free' | 'active' | 'trialing' | 'past_due' | 'canceled'
  add column subscription_price_id  text,
  add column current_period_end      timestamptz;
```

Plus an idempotency ledger:

```sql
create table public.stripe_events (
  id          text primary key,          -- Stripe event id (evt_…)
  type        text        not null,
  received_at timestamptz not null default now()
);
alter table public.stripe_events enable row level security;
-- no policy at all → only service_role (which bypasses RLS) can touch it
```

**Write path is service_role only.** The client may *read* its own entitlement columns
via the existing `own profile` RLS policy, but must never be able to write them. Because
the ADR-001 policy is `for all using (id = auth.uid()) with check (id = auth.uid())`, a
signed-in user could otherwise `update profiles set subscription_status='active'`. This
must be closed — see Consequences.

### 4. Gating

**Free** — enough to genuinely learn:
- Speed Drill, Flashcards (full basic-strategy drill)
- Strategy Chart *without* the Illustrious-18 deviations overlay
- **Basic analytics only:** lifetime accuracy, total sessions, training time, last 7 days

**Pro** — the complete picture and the advanced tools:
- Casino Session, Bet Spread, Deck Estimation
- Illustrious 18 / Fab 4 deviations overlay on the Strategy Chart
- Bankroll Tracker + Bankroll Simulator
- **Full analytics:** accuracy trend, practice heatmap, skill radar, weakest hands,
  simulated edge, all time ranges (30d / 90d / all)

Locked surfaces render a **teaser**, not a blank: the Pro analytics tiles show blurred/
placeholder shapes with an upgrade CTA. The point is that the free user can *see* that a
sharper picture of themselves exists.

---

## Options Considered

### Server: Supabase Edge Functions vs. Node on the Dokploy VPS

| Dimension | Edge Functions | Node/Express on VPS |
|---|---|---|
| Complexity | Low — one platform | Medium — new service + deploy |
| Infra cost | None (included) | A container, a domain, TLS |
| Secrets | `supabase secrets set` | Dokploy env |
| DB access | `service_role` in-process | Must reach Postgres from outside |
| CORS | Same origin family | Must configure |
| Familiarity | Deno (new) | Node (known), Dokploy `solid` |

**Chosen: Edge Functions.** Auth, DB and RLS already live there; the entitlement write is
one hop from the webhook with no network boundary to secure. The Deno runtime is the only
new thing, and the surface is two small files. The Node option is defensible but buys
control we do not need at the price of a second deployment target for secret material.

### Billing: subscription vs. one-time

One-time (lifetime) is simpler — one event, one boolean. Subscription was chosen for
recurring revenue; the cost is real: `past_due`, `canceled`, renewal and dunning states
must all be handled, and the entitlement becomes time-bounded rather than a flag.

---

## Security requirements (non-negotiable)

1. **Signature verification.** Use `stripe.webhooks.constructEventAsync` — the sync
   `constructEvent` does not work in Deno (Web Crypto is async). Read the **raw body**;
   never `JSON.parse` before verifying.
2. **Idempotency.** Stripe retries. Insert `event.id` into `stripe_events` first; on a
   unique-violation, return `200` and do nothing. Every handler must additionally be
   safe to run twice.
3. **Never trust the client.** The price id is chosen server-side from an allowlist keyed
   by a plan name (`monthly` | `yearly`); the client never sends a price id or an amount.
   The user id comes from the verified JWT, never from the request body.
4. **Never trust `success_url`.** It only navigates the UI; entitlement is granted solely
   by the webhook.
5. **Secrets.** `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`
   live in Edge Function secrets. None of them may ever appear in a `VITE_*` variable —
   Vite inlines those into the client bundle.
6. **Test mode first.** Build and verify against `sk_test_` + Stripe CLI
   (`stripe listen --forward-to`) before touching live keys.

### Events handled

| Event | Action |
|---|---|
| `checkout.session.completed` | Store `stripe_customer_id`; set status from the subscription |
| `customer.subscription.created` / `.updated` | Sync `subscription_status`, `price_id`, `current_period_end` |
| `customer.subscription.deleted` | `subscription_status = 'canceled'` |
| `invoice.payment_failed` | `subscription_status = 'past_due'` |

`is_pro` is **derived**, not stored: `status in ('active','trialing') && current_period_end > now()`.
A single source of truth avoids the classic drift between a boolean and the real state.

---

## Consequences

**Easier**
- One platform for auth, data and billing; no new infrastructure to operate.
- Customer Portal removes all billing UI work (cancel, card change, invoices).
- Derived `is_pro` cannot drift out of sync with Stripe.

**Harder / accepted trade-offs**
- **Client-side gating is soft, and we should be honest about it.** The premium *modes*
  are JavaScript shipped to every browser; a determined user can unlock them by editing
  the bundle. The only *hard* boundary is data the server holds. We accept this: it is
  the industry norm for a trainer app, the paying customer is not the adversary, and the
  cost of moving the training engine server-side is out of proportion to the risk.
  Where it is cheap, we enforce for real (premium data behind RLS).
- **The ADR-001 profile policy must be tightened.** Today a user can update *any* column
  on their own profile row. Entitlement columns must become non-writable by the user —
  either by splitting them into a separate `subscriptions` table with no user-write
  policy, or by a `BEFORE UPDATE` trigger that rejects client changes to those columns.
  *This is a prerequisite, not a follow-up.*
- Subscription lifecycle adds states the UI must handle (`past_due` should warn, not
  instantly lock out).
- Deno is a new runtime in the stack.

---

## Action Items

1. [ ] Migration: entitlement columns + `stripe_events` + **lock entitlement columns
       against client writes** (trigger or separate table).
2. [ ] Stripe: Product + monthly/yearly Prices (test mode), Customer Portal configured.
3. [ ] Edge Function `create-checkout-session` (JWT-authed, price allowlist).
4. [ ] Edge Function `stripe-webhook` (`--no-verify-jwt`, `constructEventAsync`,
       idempotency ledger, the four events above).
5. [ ] Client: `useEntitlement()` derived from the profile row; `<ProGate>` component;
       teaser states for locked analytics; upgrade + manage-subscription buttons.
6. [ ] Tests: gating logic, `is_pro` derivation, webhook handler unit tests
       (signature failure, replay, each event).
7. [ ] Verify end-to-end with Stripe CLI + a test card, incl. **replaying an event twice**.
