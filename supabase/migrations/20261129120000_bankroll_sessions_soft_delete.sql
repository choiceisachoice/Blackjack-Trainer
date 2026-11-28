-- ── bankroll_sessions: soft delete + a server clock ──
--
-- The real-money bankroll log merged on every page load with "this device
-- wins" and deleted rows outright. A session deleted on one device was
-- restored by the next page load of any other device still holding it, a
-- delete that failed offline was pulled back by the next merge, and an old
-- edit on one device overwrote a newer one from another.
--
-- Now:
--   * `deleted_at` — a delete is a tombstone. The row stays (with its figures
--     blanked by the client) so every device learns it is gone.
--   * `updated_at` — set by the server on every insert and update, never
--     taken from the client. The client merge keeps the newer copy per id.
--   * A tombstone cannot be lifted by a client: an update that clears
--     `deleted_at` keeps it. Only `service_role` may undo a delete.
--
-- Safe to run more than once (pasted into the SQL editor): every statement is
-- `if not exists`, `create or replace`, or drops before it creates.
-- RLS is untouched: the existing "own bankroll_sessions" policy
-- (`user_id = auth.uid()` for all commands) still decides who sees and
-- writes which rows.
--
-- Existing rows get `updated_at = now()` at the moment this runs, so their
-- cloud copy counts as newer than any device copy that predates the client
-- change (those count as of their `created_at`).

alter table public.bankroll_sessions
  add column if not exists deleted_at timestamptz;

alter table public.bankroll_sessions
  add column if not exists updated_at timestamptz not null default now();

create or replace function public.bankroll_sessions_touch()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- The server's clock, not the client's: a device with a wrong clock must
  -- not be able to make its copy "newest".
  new.updated_at := now();
  -- A tombstone stays a tombstone, except for a deliberate correction.
  if tg_op = 'UPDATE'
     and old.deleted_at is not null
     and new.deleted_at is null
     and coalesce(auth.role(), '') <> 'service_role' then
    new.deleted_at := old.deleted_at;
  end if;
  return new;
end;
$$;

drop trigger if exists bankroll_sessions_touch on public.bankroll_sessions;
create trigger bankroll_sessions_touch
  before insert or update on public.bankroll_sessions
  for each row execute function public.bankroll_sessions_touch();

-- No new index: the client reads all of a user's rows, tombstones included,
-- and `bankroll_sessions_user_date_idx` (user_id, played_on) already serves
-- `where user_id = …`.
