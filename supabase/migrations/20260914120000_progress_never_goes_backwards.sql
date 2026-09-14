-- Progress written by a client can only go up.
--
-- ── What was wrong ──
-- The progress sync wrote `profiles` with an upsert. Migration 20260724120000
-- removed the client's INSERT policy on purpose — a client may read and update
-- its own row, never create one — and Postgres checks the INSERT policy for
-- `INSERT … ON CONFLICT DO UPDATE` before it considers the conflict. From the
-- day that migration went live, every progress write answered 403. Nothing
-- surfaced: the sign-in merge logged to the console and carried on, the push
-- after each XP award was fire-and-forget. Level, XP, the simulation counters
-- and the paid curriculum stages lived only in one browser's localStorage,
-- and the first sign-out wiped them. Level 3 became level 1.
--
-- The client now writes with `update`, which the existing policy allows.
--
-- ── Why a trigger as well ──
-- The same loss has a second road. The push after an XP award writes the local
-- total as it is, without the max-merge the sign-in does; a device whose local
-- copy is empty — a fresh browser, a cleared site, a failed hydration — writes
-- a small number over a large one, and the sign-in merge on every other device
-- then agrees with it. Reconciling by max in one place and trusting the client
-- in the other is a rule with a gap; this closes it where every write passes.
--
-- The rule: for a client write, each progress column keeps the greater of the
-- two values, and the dismissal flag stays dismissed. `service_role` bypasses
-- it, so a support correction can still set a value deliberately. There is no
-- product feature that lowers XP — resets are local-only — so nothing
-- legitimate is refused.
--
-- `settings` is left alone: the claimed-stage list is merged as a union by the
-- client, and a jsonb merge in the trigger would have to know its shape.

create or replace function public.protect_progress_columns()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if coalesce(auth.role(), '') = 'service_role' then
    return new;
  end if;

  new.level_xp        := greatest(old.level_xp, new.level_xp);
  new.sim_count       := greatest(old.sim_count, new.sim_count);
  new.sim_best_edge   := greatest(old.sim_best_edge, new.sim_best_edge);
  new.onboarding_seen := old.onboarding_seen or new.onboarding_seen;

  return new;
end;
$$;

drop trigger if exists protect_progress_columns on public.profiles;
create trigger protect_progress_columns
  before update on public.profiles
  for each row execute function public.protect_progress_columns();
