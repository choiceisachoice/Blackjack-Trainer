-- Client failures: a failed checkout must leave a trace the operator can read.
-- And: the visit statistics get the retention schedule they were promised.
--
-- One new table, two functions the browser may call (one of them admins
-- only), one purge function, and the weekly schedule for both purges. Nothing
-- that already exists is altered: no column, no policy, no trigger, no
-- function body. `analytics_purge` is scheduled as migration 20260925120000
-- defined it.
--
-- ── Why this exists ──
--
-- "Known gaps" item 1: a checkout that fails in the browser produced nothing
-- anyone could see. It is not a webhook, so Stripe does not notice; the Edge
-- Function may never have been reached, so its log is empty; and the cause
-- went to `console.error` on a customer's device. The only report was the
-- customer choosing to write in.
--
-- This is the smallest thing that turns that into a row: the client calls
-- `report_client_failure` with where it happened and what was thrown, and the
-- admin page lists the latest rows.
--
-- What it does NOT do, so nobody reads more into it than is there:
--   * A failure on a device that is offline and never returns is never
--     reported. The client queues it (sessionStorage) and sends it on the next
--     visit in that tab — if there is one.
--   * Nothing notifies anyone. The operator has to open `/admin/analytics`.
--
-- ── The shape of the access ──
--
-- Same as the analytics tables, one notch tighter. RLS is on and there is NO
-- policy at all — not even an admin SELECT policy — and every privilege is
-- revoked from `anon` and `authenticated`. An error message is free text
-- written by code we do not control (a library, a browser); the client scrubs
-- e-mail addresses and tokens before sending, but "scrubbed by the sender" is
-- not a reason to make the table readable from a browser. Rows go in through
-- one SECURITY DEFINER function and come out through another that checks
-- `app_admins` first. Every definer function sets `search_path = ''`,
-- qualifies every name, and is revoked from `public` before being granted to
-- exactly the roles that need it.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. The table
-- ═══════════════════════════════════════════════════════════════════════════

-- One row per reported failure.
--   place      which call site: 'checkout', 'billing-portal', … The client
--              sends only an allowlist; the server does not repeat the list,
--              because a new place should not need a migration.
--   message    `Error.name: Error.message`, scrubbed and truncated. Never a
--              stack: a stack is long, changes with every build, and can carry
--              URLs with query strings.
--   path       the pathname the visitor was on (no query, no fragment).
--   user_id    from the JWT, or null for an anonymous visitor. Unlinked, not
--              deleted, when the account goes — the fault was still a fault.
--   app_build  the hashed entry file name, so "fixed in the next deploy" can
--              be told from "still happening".
create table if not exists public.client_failures (
  id          bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  place       text        not null,
  message     text        not null,
  path        text,
  user_id     uuid        references auth.users (id) on delete set null,
  app_build   text
);

-- The admin list reads newest first, the flood guard counts the last minute,
-- and the purge deletes the oldest: all three are this one index.
create index if not exists client_failures_occurred_idx
  on public.client_failures (occurred_at desc);
-- `on delete set null` has to find the rows of a deleted account.
create index if not exists client_failures_user_idx
  on public.client_failures (user_id) where user_id is not null;

alter table public.client_failures enable row level security;

-- No policy of any kind: default-deny for every command, SELECT included.
-- The revoke goes further than the analytics tables (which keep SELECT for
-- the admin policy) because nothing reads this table from a browser: the
-- admin page calls `client_failures_recent`. `revoke all` also covers
-- Supabase's default grants on new tables, which name `anon` and
-- `authenticated` directly.
revoke all on public.client_failures from anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. What the browser calls
-- ═══════════════════════════════════════════════════════════════════════════

-- Record one failure. Returns nothing: the client has no use for an answer,
-- and an answer would tell a prober whether the flood guard had tripped.
--
-- The anon key is public and so is this function, so it is written for a
-- caller who is not our client:
--   * It never raises on bad input. A null or empty place is ignored; over-
--     long values are cut, not refused. A failure report that fails is noise
--     in the one place that is supposed to reduce it.
--   * Lengths are capped here as well as in the client: place 60, message
--     500, path 200, build 40. The client's cap is a courtesy; this one is
--     the rule.
--   * `user_id` comes from `auth.uid()`, i.e. the JWT PostgREST verified.
--     There is no parameter for it, so there is nothing to forge.
--   * The flood guard: once 30 rows have been written in the last minute —
--     by anyone — further reports are dropped until the minute has passed.
--     Global on purpose. There is no IP address here to limit by (and none
--     is wanted), and a per-user limit does nothing against anonymous
--     callers. Thirty a minute is far above any real incident's useful
--     detail and caps what a script with the anon key can write at about
--     43,000 rows a day of at most ~800 bytes each. The cost is honest:
--     during a flood, genuine reports are dropped too.
--     The count and the insert are not serialised, so a burst of concurrent
--     calls can overshoot by a few rows. That is accepted — it is a brake,
--     not a quota, and an advisory lock here would put every failing
--     checkout in one queue.
create or replace function public.report_client_failure(
  p_place   text,
  p_message text,
  p_path    text default null,
  p_build   text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_place  text := nullif(left(trim(coalesce(p_place, '')), 60), '');
  v_recent integer;
begin
  if v_place is null then
    return;
  end if;

  select count(*) into v_recent
  from public.client_failures
  where occurred_at > now() - interval '1 minute';
  if v_recent >= 30 then
    return;
  end if;

  insert into public.client_failures (place, message, path, user_id, app_build)
  values (
    v_place,
    left(coalesce(p_message, ''), 500),
    nullif(left(coalesce(p_path, ''), 200), ''),
    auth.uid(),
    nullif(left(coalesce(p_build, ''), 40), '')
  );
end;
$$;

revoke all on function public.report_client_failure(text, text, text, text) from public;
grant execute on function public.report_client_failure(text, text, text, text) to anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. What the admin page calls
-- ═══════════════════════════════════════════════════════════════════════════

-- The latest failures, newest first.
--
-- SECURITY DEFINER because the table is closed to every client role; the
-- function is the only reader and refuses anyone not in `app_admins` before
-- touching it — the same error, with the same code, as `analytics_report`.
--
-- Returns `signed_in` rather than `user_id`: the page shows yes or no, and a
-- user id the browser never needed is one it cannot leak. Whoever has to know
-- *which* account reads the table in the SQL editor.
--
-- `p_limit` is clamped to 1..200 instead of refused: null becomes 50, zero
-- or less becomes 1, anything larger becomes 200.
create or replace function public.client_failures_recent(p_limit integer default 50)
returns table (
  id          bigint,
  occurred_at timestamptz,
  place       text,
  message     text,
  path        text,
  signed_in   boolean,
  app_build   text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_app_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return query
    select f.id, f.occurred_at, f.place, f.message, f.path,
           (f.user_id is not null) as signed_in, f.app_build
    from public.client_failures f
    order by f.occurred_at desc, f.id desc
    limit greatest(1, least(coalesce(p_limit, 50), 200));
end;
$$;

-- `anon` is named for the reason given in the analytics migration: Supabase's
-- default privileges grant EXECUTE to it directly, not only via `public`.
revoke all on function public.client_failures_recent(integer) from public, anon;
grant execute on function public.client_failures_recent(integer) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. Retention
-- ═══════════════════════════════════════════════════════════════════════════

-- Deletes failures older than `p_older_than` and returns how many. Ninety
-- days is what the privacy policy states: long enough to see whether a fault
-- recurs across a few deploys, short enough that an error message is not kept
-- for no reason. Callable only by the database owner and the cron role — not
-- by any client, admin or not.
create or replace function public.client_failures_purge(p_older_than interval default interval '90 days')
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted bigint;
begin
  delete from public.client_failures where occurred_at < now() - p_older_than;
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke all on function public.client_failures_purge(interval) from public, anon, authenticated;

-- ── The schedule, for both purges ──
--
-- Migration 20260925120000 left `analytics_purge` unscheduled "until the
-- retention period is decided". It has been: the privacy policy says visit
-- statistics are kept for 13 months, which is the function's own default, so
-- the job calls it without an argument and the two cannot drift apart. The
-- same goes for the 90 days above.
--
-- Weekly, Monday night UTC, a few minutes apart. Weekly means a row can live
-- up to seven days past its period; a daily job would buy nothing a visitor
-- could notice.
--
-- Written so that it is safe everywhere this file runs:
--   * Only where pg_cron can be installed at all. Supabase offers it; the
--     PGlite database the tests use does not, and there this block does
--     nothing (a test asserts that the migration still applies).
--   * Dynamic SQL (`execute`), so nothing in the `cron` schema is looked up
--     on a database that has no such schema.
--   * Idempotent: a job of the same name is unscheduled first, so running
--     the block again replaces the schedule instead of failing on it.
--   * A failure in here — pg_cron present but not permitted, say — is turned
--     into a WARNING rather than failing the migration. The table and the
--     functions above are worth having without the schedule; the reverse is
--     not true. The price is that a missing schedule is quiet, so it has to
--     be checked once after the push:
--
--         select jobname, schedule, command from cron.job order by jobname;
--
--     Two rows are expected: `analytics-purge` and `client-failures-purge`.
--
-- The jobs run as the role that scheduled them (the migration's role, which
-- owns the functions), which is why no EXECUTE grant is needed above.
do $cron$
begin
  if not exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    raise notice 'pg_cron is not available here: purge jobs not scheduled';
    return;
  end if;

  begin
    execute 'create extension if not exists pg_cron';

    execute $sql$
      select cron.unschedule(jobid) from cron.job
      where jobname in ('analytics-purge', 'client-failures-purge')
    $sql$;

    execute $sql$
      select cron.schedule('analytics-purge', '15 3 * * 1',
                           'select public.analytics_purge()')
    $sql$;
    execute $sql$
      select cron.schedule('client-failures-purge', '25 3 * * 1',
                           'select public.client_failures_purge()')
    $sql$;
  exception when others then
    raise warning 'purge jobs NOT scheduled (%). Schedule them by hand: see the end of migration 20261118120000.', sqlerrm;
  end;
end;
$cron$;
