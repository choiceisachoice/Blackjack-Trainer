-- Close a hole that let any signed-in user grant themselves Pro.
--
-- ── The hole ──
-- `20260709120000_init_auth_schema.sql` created:
--     create policy "own profile" on public.profiles
--       for all using (id = auth.uid()) with check (id = auth.uid());
-- `for all` covers SELECT, INSERT, UPDATE **and DELETE**.
--
-- `20260710120000_stripe_entitlements.sql` then protected the entitlement
-- columns with a trigger — but only:
--     create trigger protect_entitlement_columns
--       before update on public.profiles
--
-- So the guard covered UPDATE while the policy allowed four operations. With
-- the public anon key and a normal session, a user could:
--     delete from profiles where id = auth.uid();
--     insert into profiles (id, subscription_status) values (auth.uid(), 'active');
-- and hold Pro permanently, across devices, with no payment. The INSERT never
-- met the trigger because the trigger only fired on UPDATE.
--
-- Secondary damage from the same move: `stripe_customer_id` is wiped, so the
-- `invoice.payment_failed` downgrade (which matches on that column) can never
-- find the row again, and the next checkout creates a duplicate Stripe customer.
--
-- ── The fix, in two independent layers ──
-- 1. Least privilege at the policy: a client may read and update its own row.
--    It may not create or destroy one. Profile rows are created solely by
--    `handle_new_user` (SECURITY DEFINER, bypasses RLS) on signup, and nothing
--    in the app deletes a profile — verified before writing this.
-- 2. Defence in depth at the trigger: it now fires on INSERT as well, and a
--    non-service_role INSERT is forced to the entitlement defaults. Even if a
--    future policy change re-opens INSERT, the row still arrives as 'free'.
--
-- Account deletion, when it is built, belongs in a service_role function that
-- removes the auth user and cascades — not in a client-issued DELETE that would
-- leave an orphaned `auth.users` row behind.

-- ── 1. Split the blanket policy ──
drop policy if exists "own profile" on public.profiles;

create policy "profiles: read own"
  on public.profiles for select
  using (id = auth.uid());

create policy "profiles: update own"
  on public.profiles for update
  using (id = auth.uid())
  with check (id = auth.uid());

-- Deliberately no INSERT and no DELETE policy. RLS is default-deny, so the
-- absence of a policy is the denial — nothing further is needed.

-- ── 2. Extend the entitlement guard to INSERT ──
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
    -- A newly created profile has never paid for anything. Forcing the
    -- defaults here is a no-op for `handle_new_user` (which sets only id and
    -- username) and neutralises any INSERT that reaches this table by another
    -- route.
    new.stripe_customer_id    := null;
    new.subscription_status   := 'free';
    new.subscription_price_id := null;
    new.current_period_end    := null;
  else
    -- UPDATE: keep whatever the webhook last wrote, whatever the client sent.
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
  before insert or update on public.profiles
  for each row execute function public.protect_entitlement_columns();
