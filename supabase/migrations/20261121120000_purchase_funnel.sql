-- The path to purchase: where visitors drop out between arriving and paying.
--
-- One new table, one function the browser may call, one report function for
-- admins, one purge function and its weekly schedule. Nothing that already
-- exists is altered: no column, no policy, no trigger, no function body.
--
-- ── Why this exists ──
--
-- The analytics tables answer "how many came" and `profiles` answers "how
-- many registered" and "how many pay". Nothing answered what lies between:
-- did a visitor ever look at the sign-up form, did a new account ever train,
-- did anyone see the paywall, did anyone press the button on it. Five named
-- steps close that gap.
--
-- What it does NOT do, so nobody reads more into it than is there:
--   * It only sees visitors who accepted the cookie bar. The client sends
--     nothing before that (`services/analytics/consent.ts`), so every count
--     taken from this table is a count of consenting visitors.
--   * It starts on the day this file is applied. There is no history.
--   * It carries no payload. A step is its name, a time, the random visitor
--     id and — when the caller is signed in — the account. No path, no plan,
--     no amount, no text of any kind, so there is nothing personal to leak
--     and nothing to scrub.
--
-- ── The shape of the access ──
--
-- As `client_failures`: RLS on, NO policy at all, every privilege revoked
-- from `anon` and `authenticated`. Rows go in through one SECURITY DEFINER
-- function and come out, as seven numbers, through another that checks
-- `app_admins` first. Every definer function sets `search_path = ''`,
-- qualifies every name, and is revoked from `public` before being granted to
-- exactly the roles that need it.
--
-- Safe to run twice (it is applied by pasting it into the SQL editor):
-- `create … if not exists`, `create or replace`, and a cron block that
-- unschedules its job before scheduling it.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. The table
-- ═══════════════════════════════════════════════════════════════════════════

-- One row per step reached.
--   visitor_id  the random id from the browser (`bjt_visitor_id`), the same
--               one the page views carry. Not a foreign key: a step may
--               arrive a moment before the visitor's first page view does.
--   name        one of five words. The function below is the allow-list; the
--               check constraint is the same list a second time, so a row
--               written by any other route cannot carry anything else.
--   user_id     from the JWT, or null for an anonymous visitor. Unlinked, not
--               deleted, when the account goes.
create table if not exists public.analytics_events (
  id          bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  visitor_id  uuid        not null,
  name        text        not null
              check (name in ('signup_view', 'signup_done', 'first_session', 'paywall_view', 'checkout_start')),
  user_id     uuid        references auth.users (id) on delete set null
);

-- The report filters by time, the flood guard counts the last minute and the
-- purge deletes the oldest.
create index if not exists analytics_events_occurred_idx
  on public.analytics_events (occurred_at desc);
-- "Did this visitor reach this step a moment ago" — the repeat guard.
create index if not exists analytics_events_visitor_name_idx
  on public.analytics_events (visitor_id, name, occurred_at desc);
-- `on delete set null` has to find the rows of a deleted account.
create index if not exists analytics_events_user_idx
  on public.analytics_events (user_id) where user_id is not null;
-- An account has one first session. The function checks before it inserts;
-- this makes two tabs finishing at the same instant unable to disagree.
create unique index if not exists analytics_events_first_session_once_idx
  on public.analytics_events (user_id) where name = 'first_session';

alter table public.analytics_events enable row level security;

-- No policy of any kind: default-deny for every command, SELECT included.
-- `revoke all` also covers Supabase's default grants on new tables, which
-- name `anon` and `authenticated` directly.
revoke all on public.analytics_events from anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. What the browser calls
-- ═══════════════════════════════════════════════════════════════════════════

-- Record that a step was reached. Returns nothing: the client has no use for
-- an answer, and an answer would tell a prober which guard had tripped.
--
-- The anon key is public and so is this function, so it is written for a
-- caller who is not our client:
--   * The allow-list is HERE. A name that is not one of the five is ignored,
--     as is a null name or a null visitor id. It never raises: a step that
--     is not counted is not worth an error anyone sees.
--   * There is no free-text argument and no argument for the user. `user_id`
--     comes from `auth.uid()`, i.e. the JWT PostgREST verified.
--   * `first_session` belongs to an account, so it needs one (an anonymous
--     call is ignored) and is stored once per account, ever.
--   * The repeat guard: the same step from the same visitor and the same
--     account within the session timeout (30 minutes) is not stored again.
--     Opening the paywall five times in a row is one view of the paywall;
--     the report counts distinct people anyway, this keeps the table small.
--   * The flood guard, as on `client_failures`: once 120 rows have been
--     written in the last minute — by anyone — further steps are dropped
--     until the minute has passed. Global on purpose; there is no IP address
--     here to limit by, and a per-visitor limit does nothing against a
--     script that invents visitor ids. 120 a minute is far above this site's
--     real traffic and caps what a script with the anon key can write at
--     about 170,000 rows a day of under 100 bytes each. The cost is honest:
--     during a flood, genuine steps are dropped too, and a flood of invented
--     visitor ids inflates the step counts until the purge — which is why
--     the report's first and last numbers do not come from this table.
--     The count and the insert are not serialised, so a burst can overshoot
--     by a few rows. It is a brake, not a quota.
create or replace function public.analytics_event(
  p_visitor_id uuid,
  p_name       text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := auth.uid();
  v_recent integer;
begin
  if p_visitor_id is null or p_name is null
     or p_name not in ('signup_view', 'signup_done', 'first_session', 'paywall_view', 'checkout_start') then
    return;
  end if;

  if p_name = 'first_session' then
    if v_uid is null then
      return;
    end if;
    if exists (
      select 1 from public.analytics_events e
      where e.user_id = v_uid and e.name = 'first_session'
    ) then
      return;
    end if;
  end if;

  if exists (
    select 1 from public.analytics_events e
    where e.visitor_id = p_visitor_id
      and e.name = p_name
      and e.user_id is not distinct from v_uid
      and e.occurred_at > now() - public.analytics_session_timeout()
  ) then
    return;
  end if;

  select count(*) into v_recent
  from public.analytics_events
  where occurred_at > now() - interval '1 minute';
  if v_recent >= 120 then
    return;
  end if;

  insert into public.analytics_events (visitor_id, name, user_id)
  values (p_visitor_id, p_name, v_uid);
exception
  -- Two tabs recording the same account's first session at once: the unique
  -- index refused the second. That is the intended outcome, not an error.
  when unique_violation then
    return;
end;
$$;

revoke all on function public.analytics_event(uuid, text) from public;
grant execute on function public.analytics_event(uuid, text) to anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. What the admin page calls
-- ═══════════════════════════════════════════════════════════════════════════

-- The seven steps from arriving to paying, for one range, as one JSON
-- document.
--
-- SECURITY DEFINER for the reason `analytics_report` is: two of the numbers
-- are counted on `profiles`, and the events table is closed to every client
-- role. It refuses anyone not in `app_admins` before touching a table, with
-- the same error and code as `analytics_report`.
--
-- Definitions. "In the range" is `p_from <= t < p_to` throughout.
--   visitors          distinct visitor ids with a page view in the range —
--                     the same number `analytics_report` calls `visitors`.
--   signup_views      distinct visitor ids that were shown the sign-up form
--                     in the range (`signup_view`).
--   registrations     profiles created in the range — the same definition as
--                     `analytics_report`. Counted on `profiles`, so it
--                     includes people who declined the cookie bar; it can
--                     therefore be LARGER than `signup_views`.
--   first_sessions    accounts whose first recorded training session fell in
--                     the range (`first_session`, stored once per account).
--                     The account may have been created before the range.
--   paywall_views     distinct people who were shown the upgrade panel in the
--                     range (`paywall_view`): the account when signed in,
--                     the visitor id otherwise.
--   checkout_starts   distinct people who started a checkout in the range
--                     (`checkout_start`), counted the same way. Started, not
--                     completed: the event is written before the redirect to
--                     Stripe.
--   paying_customers  profiles with subscription_status = 'active', counted
--                     NOW — the same definition as `analytics_report`. There
--                     is no record of when a subscription began, so this one
--                     does not follow the range.
--   events_since      when the oldest stored step was recorded, or null when
--                     there is none: the four numbers taken from events say
--                     nothing about the time before it.
--
-- The four event numbers count only visitors who accepted the cookie bar;
-- `registrations` and `paying_customers` count everyone. The steps are
-- counted independently for the range — it is not a cohort: someone who
-- registered last month and paid today is in this range's later steps and
-- not in its earlier ones.
create or replace function public.analytics_funnel(
  p_from timestamptz,
  p_to   timestamptz
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if not public.is_app_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_to <= p_from then
    raise exception 'invalid range' using errcode = '22023';
  end if;
  if p_to - p_from > interval '400 days' then
    raise exception 'range too long' using errcode = '22023';
  end if;

  with ev as (
    select e.name, e.visitor_id, e.user_id
    from public.analytics_events e
    where e.occurred_at >= p_from and e.occurred_at < p_to
  )
  select jsonb_build_object(
    'visitors',         (select count(distinct pv.visitor_id) from public.analytics_page_views pv
                         where pv.viewed_at >= p_from and pv.viewed_at < p_to),
    'signup_views',     (select count(distinct ev.visitor_id) from ev where ev.name = 'signup_view'),
    'registrations',    (select count(*) from public.profiles p
                         where p.created_at >= p_from and p.created_at < p_to),
    'first_sessions',   (select count(*) from ev where ev.name = 'first_session'),
    'paywall_views',    (select count(distinct coalesce(ev.user_id, ev.visitor_id)) from ev where ev.name = 'paywall_view'),
    'checkout_starts',  (select count(distinct coalesce(ev.user_id, ev.visitor_id)) from ev where ev.name = 'checkout_start'),
    'paying_customers', (select count(*) from public.profiles p where p.subscription_status = 'active'),
    'events_since',     (select min(e.occurred_at) from public.analytics_events e)
  ) into v_result;

  return v_result;
end;
$$;

-- `anon` is named for the reason given in the analytics migration: Supabase's
-- default privileges grant EXECUTE to it directly, not only via `public`.
revoke all on function public.analytics_funnel(timestamptz, timestamptz) from public, anon;
grant execute on function public.analytics_funnel(timestamptz, timestamptz) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. Retention
-- ═══════════════════════════════════════════════════════════════════════════

-- Deletes steps older than `p_keep` and returns how many. Thirteen months,
-- because these rows are visit statistics and that is the period the privacy
-- policy states for them — the same default as `analytics_purge`, which this
-- migration leaves exactly as it is. Callable only by the database owner and
-- the cron role — not by any client, admin or not.
create or replace function public.analytics_events_purge(p_keep interval default interval '13 months')
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted bigint;
begin
  delete from public.analytics_events where occurred_at < now() - p_keep;
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke all on function public.analytics_events_purge(interval) from public, anon, authenticated;

-- ── The schedule ──
--
-- Weekly, Monday night UTC, between the two purges migration 20261118120000
-- scheduled (03:15 and 03:25). Written the same way and for the same
-- reasons: only where pg_cron exists (not in the PGlite database the tests
-- use), dynamic SQL so nothing in the `cron` schema is looked up where there
-- is none, a job of the same name unscheduled first so a second run replaces
-- it, and a failure turned into a WARNING rather than failing the migration.
-- Check once after applying:
--
--     select jobname, schedule, command from cron.job order by jobname;
--
-- Three rows are expected: `analytics-events-purge`, `analytics-purge` and
-- `client-failures-purge`.
do $cron$
begin
  if not exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    raise notice 'pg_cron is not available here: analytics-events-purge not scheduled';
    return;
  end if;

  begin
    execute 'create extension if not exists pg_cron';

    execute $sql$
      select cron.unschedule(jobid) from cron.job
      where jobname = 'analytics-events-purge'
    $sql$;

    execute $sql$
      select cron.schedule('analytics-events-purge', '20 3 * * 1',
                           'select public.analytics_events_purge()')
    $sql$;
  exception when others then
    raise warning 'analytics-events-purge NOT scheduled (%). Schedule it by hand: see the end of migration 20261121120000.', sqlerrm;
  end;
end;
$cron$;
