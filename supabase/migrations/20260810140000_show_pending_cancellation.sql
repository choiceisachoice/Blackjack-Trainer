-- Let the app know that a subscription has been cancelled.
--
-- ── What was wrong ──
-- The Stripe Customer Portal cancels at period end, which is correct: the
-- customer paid for the period and keeps it. Stripe expresses that as a
-- subscription whose `status` is still `active` and whose
-- `cancel_at_period_end` is now true.
--
-- The webhook only ever wrote `sub.status`, and there was no column for the
-- flag. So after cancelling, the profile row was byte-for-byte what it had been
-- before, and the account page went on saying "Pro — active. Renews on <date>".
--
-- The access was right. The sentence was a lie. Someone who cancels and is then
-- told their subscription will renew concludes the cancellation did not work,
-- and the next thing they contact is their bank, not support.
--
-- ── The column ──
-- Not null with a default, so every existing row becomes `false` — which is the
-- truth for all of them: a row cannot have been cancelled while no cancellation
-- was ever recorded. The webhook corrects any that were, on their next event.

alter table public.profiles
  add column if not exists cancel_at_period_end boolean not null default false;

-- ── The guard has to cover it too ──
--
-- Not because this flag grants anything — it is display only — but because the
-- guard's rule is "entitlement columns are the webhook's alone", and a column
-- left out of that list is an exception nobody remembers making. A client that
-- could set it would only be able to lie to itself, and today that is harmless;
-- the danger is the next person who reads this list, sees the pattern, and adds
-- a column that is *not* harmless in the same unprotected way.
--
-- Recreated in full rather than patched: this function has been redefined once
-- already (20260724120000), and a reader needs to see the whole rule in one
-- place rather than assemble it from three migrations.
create or replace function public.protect_entitlement_columns()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  -- The webhook (service_role) is the only writer allowed to set entitlements.
  if coalesce(auth.role(), '') = 'service_role' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- A newly created profile has never paid for anything.
    new.stripe_customer_id    := null;
    new.subscription_status   := 'free';
    new.subscription_price_id := null;
    new.current_period_end    := null;
    new.cancel_at_period_end  := false;
  else
    -- UPDATE: keep whatever the webhook last wrote, whatever the client sent.
    new.stripe_customer_id    := old.stripe_customer_id;
    new.subscription_status   := old.subscription_status;
    new.subscription_price_id := old.subscription_price_id;
    new.current_period_end    := old.current_period_end;
    new.cancel_at_period_end  := old.cancel_at_period_end;
  end if;

  return new;
end;
$$;

drop trigger if exists protect_entitlement_columns on public.profiles;
create trigger protect_entitlement_columns
  before insert or update on public.profiles
  for each row execute function public.protect_entitlement_columns();
