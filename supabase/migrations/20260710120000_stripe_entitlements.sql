-- ADR-002: Stripe subscriptions & premium gating.
-- Entitlement columns on profiles, a webhook idempotency ledger, and a trigger
-- that stops a signed-in user from writing their own entitlement (they may read
-- it, but only the webhook — service_role — may change it).

-- ── Entitlement columns on profiles ──
alter table public.profiles
  add column if not exists stripe_customer_id    text unique,
  add column if not exists subscription_status   text        not null default 'free',
    -- 'free' | 'active' | 'trialing' | 'past_due' | 'canceled'
  add column if not exists subscription_price_id text,
  add column if not exists current_period_end    timestamptz;

-- ── Webhook idempotency ledger ──
-- Stripe retries deliveries; the handler inserts the event id first and treats a
-- unique-violation as "already processed". No RLS policy at all → only
-- service_role (which bypasses RLS) can touch it.
create table if not exists public.stripe_events (
  id          text primary key,       -- Stripe event id (evt_…)
  type        text        not null,
  received_at timestamptz not null default now()
);
alter table public.stripe_events enable row level security;

-- ── Lock entitlement columns against client writes ──
-- The "own profile" policy lets a user update their own row (settings, level_xp,
-- …). Without this, they could also set subscription_status = 'active' and get
-- Pro for free. A normal (authenticated) update silently keeps the old
-- entitlement values; only a service_role update (the webhook) may change them.
create or replace function public.protect_entitlement_columns()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    new.stripe_customer_id    := old.stripe_customer_id;
    new.subscription_status   := old.subscription_status;
    new.subscription_price_id := old.subscription_price_id;
    new.current_period_end    := old.current_period_end;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_entitlement_columns on public.profiles;
create trigger protect_entitlement_columns
  before update on public.profiles
  for each row execute function public.protect_entitlement_columns();
