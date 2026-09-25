-- ADR-003: Privacy-preserving website analytics.
--
-- Four new tables, three functions the browser may call, one report function
-- for admins, one purge function for a cron job that is not scheduled yet.
-- Nothing that already exists is altered: no column on `profiles`, no change
-- to a policy or a trigger. The registrations and paying-customer counts are
-- read from `profiles` as it is.
--
-- ── The shape of the access ──
--
-- Every table here has RLS on and no INSERT/UPDATE/DELETE policy. A browser —
-- anonymous or signed in — writes only through `analytics_track` and
-- `analytics_ping`, which are SECURITY DEFINER: they run as their owner, so
-- the caller needs no privilege on the tables themselves. That is deliberate
-- and is the one place this schema departs from "prefer SECURITY INVOKER":
-- an INVOKER function would need `anon` to hold INSERT on three tables and
-- UPDATE on one, and an UPDATE grant to the anonymous role on a table it may
-- not read is a wider door than a function that validates four arguments.
-- Every definer function here sets `search_path = ''`, qualifies every name,
-- and is revoked from `public` before being granted to exactly the roles that
-- need it.
--
-- ── Who is an admin ──
--
-- This project had no admin concept: RLS is per user, and nothing on
-- `profiles` says "owner". `app_admins` is that concept, as small as it can
-- be: a row means "may read the analytics". No client can create one (no
-- INSERT policy — RLS denies by default), so membership is granted only from
-- the SQL editor or a migration:
--
--     insert into public.app_admins (user_id)
--     select id from auth.users where email = 'owner@example.com';
--
-- A user may read their own row, so the app can show or hide the link.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. Admin membership
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.app_admins (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.app_admins enable row level security;

create policy "app_admins: read own"
  on public.app_admins for select
  using (user_id = auth.uid());

-- No INSERT, UPDATE or DELETE policy: default-deny is the rule.
revoke insert, update, delete on public.app_admins from anon, authenticated;

-- INVOKER on purpose: called inside RLS policies and by the report function,
-- it only ever asks "is the *caller* listed", and the caller can read their
-- own row. `stable` so the planner may cache it within a statement.
create or replace function public.is_app_admin()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select exists (
    select 1 from public.app_admins where user_id = auth.uid()
  );
$$;

-- `anon` too: the analytics policies call it, and an anonymous SELECT should
-- answer with no rows, not with "permission denied for function".
revoke all on function public.is_app_admin() from public;
grant execute on function public.is_app_admin() to anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. Tables
-- ═══════════════════════════════════════════════════════════════════════════

-- One row per random visitor id. The id is generated in the browser and kept
-- in localStorage; it identifies a browser profile, not a person, and the
-- sign-out wipe rotates it.
create table if not exists public.analytics_visitors (
  id            uuid primary key,
  first_seen_at timestamptz not null default now(),
  last_seen_at  timestamptz not null default now()
);

-- A visit. `user_id` is filled from the JWT when the visitor is signed in and
-- unlinked (not deleted) when the account goes.
create table if not exists public.analytics_sessions (
  id               uuid primary key default gen_random_uuid(),
  visitor_id       uuid        not null references public.analytics_visitors (id) on delete cascade,
  user_id          uuid        references auth.users (id) on delete set null,
  started_at       timestamptz not null default now(),
  last_activity_at timestamptz not null default now(),
  landing_page     text        not null,
  exit_page        text        not null,
  referrer_host    text,                       -- host only, null when direct or same site
  device           text        check (device in ('mobile', 'tablet', 'desktop')),
  page_views       integer     not null default 0
);

-- One row per page view. Kept separately from the session counter so "top
-- pages" and "views per day" can be answered without parsing anything.
create table if not exists public.analytics_page_views (
  id         bigint generated always as identity primary key,
  session_id uuid        not null references public.analytics_sessions (id) on delete cascade,
  visitor_id uuid        not null,
  user_id    uuid        references auth.users (id) on delete set null,
  pathname   text        not null,
  viewed_at  timestamptz not null default now()
);

-- ── Indexes: every column the report filters or groups by ──
create index if not exists analytics_sessions_started_idx
  on public.analytics_sessions (started_at);
create index if not exists analytics_sessions_visitor_activity_idx
  on public.analytics_sessions (visitor_id, last_activity_at desc);
create index if not exists analytics_sessions_user_idx
  on public.analytics_sessions (user_id) where user_id is not null;
create index if not exists analytics_page_views_viewed_idx
  on public.analytics_page_views (viewed_at);
create index if not exists analytics_page_views_session_idx
  on public.analytics_page_views (session_id);
create index if not exists analytics_page_views_visitor_idx
  on public.analytics_page_views (visitor_id);
create index if not exists analytics_page_views_user_idx
  on public.analytics_page_views (user_id) where user_id is not null;
create index if not exists analytics_page_views_path_viewed_idx
  on public.analytics_page_views (pathname, viewed_at);
-- Registrations per day are counted on `profiles.created_at`, which had no
-- index; the table is small, but the report runs it for every range.
create index if not exists profiles_created_at_idx
  on public.profiles (created_at);

-- ── RLS: closed to everyone but admins, and admins may only read ──
alter table public.analytics_visitors   enable row level security;
alter table public.analytics_sessions   enable row level security;
alter table public.analytics_page_views enable row level security;

create policy "analytics_visitors: admin read"
  on public.analytics_visitors for select using (public.is_app_admin());
create policy "analytics_sessions: admin read"
  on public.analytics_sessions for select using (public.is_app_admin());
create policy "analytics_page_views: admin read"
  on public.analytics_page_views for select using (public.is_app_admin());

-- Default-deny already refuses writes without a policy; the revoke makes the
-- intent visible in `\dp` and survives a policy someone adds later.
revoke insert, update, delete on public.analytics_visitors   from anon, authenticated;
revoke insert, update, delete on public.analytics_sessions   from anon, authenticated;
revoke insert, update, delete on public.analytics_page_views from anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. The session rule
-- ═══════════════════════════════════════════════════════════════════════════

-- A session ends after this much inactivity. The next page view from the
-- same visitor starts a new one. Thirty minutes is the convention every
-- analytics product shares, so the numbers here compare with numbers
-- elsewhere. Held in a function so the report and the tracker cannot
-- disagree about it.
create or replace function public.analytics_session_timeout()
returns interval
language sql
immutable
set search_path = ''
as $$ select interval '30 minutes' $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. What the browser calls
-- ═══════════════════════════════════════════════════════════════════════════

-- Record one page view. Returns the session id (the client does not need it;
-- it is returned for tests and debugging).
--
-- Validation, because the anon key is public and so is this function:
--   * pathname: an absolute path, no whitespace, at most 200 characters
--   * referrer_host: at most 100 characters, lower-cased, or null
--   * device: one of three words, or null
-- Anything else raises, and the client swallows the error — a page view is
-- never worth an error a person can see.
--
-- `user_id` comes from `auth.uid()`, i.e. the JWT PostgREST verified. The
-- client cannot claim to be somebody.
create or replace function public.analytics_track(
  p_visitor_id    uuid,
  p_pathname      text,
  p_referrer_host text default null,
  p_device        text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid        uuid := auth.uid();
  v_session_id uuid;
  v_referrer   text;
begin
  if p_visitor_id is null then
    raise exception 'visitor id required' using errcode = '22023';
  end if;
  if p_pathname is null or p_pathname !~ '^/[^[:space:]]{0,199}$' then
    raise exception 'invalid pathname' using errcode = '22023';
  end if;
  if p_device is not null and p_device not in ('mobile', 'tablet', 'desktop') then
    raise exception 'invalid device' using errcode = '22023';
  end if;
  v_referrer := nullif(lower(left(trim(p_referrer_host), 100)), '');

  -- Two tabs opening at once must not create two sessions for one visitor.
  perform pg_advisory_xact_lock(hashtext(p_visitor_id::text));

  insert into public.analytics_visitors (id)
  values (p_visitor_id)
  on conflict (id) do update set last_seen_at = now();

  select s.id into v_session_id
  from public.analytics_sessions s
  where s.visitor_id = p_visitor_id
    and s.last_activity_at >= now() - public.analytics_session_timeout()
  order by s.last_activity_at desc
  limit 1;

  if v_session_id is null then
    insert into public.analytics_sessions
      (visitor_id, user_id, landing_page, exit_page, referrer_host, device, page_views)
    values
      (p_visitor_id, v_uid, p_pathname, p_pathname, v_referrer, p_device, 1)
    returning id into v_session_id;
  else
    update public.analytics_sessions
    set last_activity_at = now(),
        exit_page        = p_pathname,
        page_views       = page_views + 1,
        -- A visitor who signs in mid-session becomes that user from here on;
        -- a user who signs out stays attributed, since the visit was theirs.
        user_id          = coalesce(user_id, v_uid)
    where id = v_session_id;
  end if;

  insert into public.analytics_page_views (session_id, visitor_id, user_id, pathname)
  values (v_session_id, p_visitor_id, v_uid, p_pathname);

  return v_session_id;
end;
$$;

-- Heartbeat: the tab is still open. Extends the current session's last
-- activity so the time on the final page is counted. Does nothing when there
-- is no session within the timeout — a ping never starts one.
create or replace function public.analytics_ping(p_visitor_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_visitor_id is null then
    return;
  end if;
  update public.analytics_sessions s
  set last_activity_at = now()
  where s.id = (
    select id from public.analytics_sessions
    where visitor_id = p_visitor_id
      and last_activity_at >= now() - public.analytics_session_timeout()
    order by last_activity_at desc
    limit 1
  );
end;
$$;

revoke all on function public.analytics_track(uuid, text, text, text) from public;
revoke all on function public.analytics_ping(uuid) from public;
grant execute on function public.analytics_track(uuid, text, text, text) to anon, authenticated;
grant execute on function public.analytics_ping(uuid) to anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. What the dashboard calls
-- ═══════════════════════════════════════════════════════════════════════════

-- Everything the admin page shows, for one range, as one JSON document.
--
-- SECURITY DEFINER, and here is why: registrations and paying customers are
-- counted on `profiles`, which the caller may read one row of — their own.
-- The alternative is a SELECT policy letting admins read every profile from
-- the browser, which hands the client every email, Stripe id and progress
-- figure to compute five numbers. This function returns the five numbers.
-- It refuses anyone not in `app_admins` before touching a table.
--
-- Definitions:
--   visitors            distinct visitor ids with a page view in the range
--   page_views          page views in the range
--   sessions            sessions started in the range
--   avg_session_seconds mean of (last_activity_at − started_at) over those
--                       sessions; a one-page visit without a heartbeat is 0
--   registrations       profiles created in the range
--   paying_customers    profiles with subscription_status = 'active', counted
--                       NOW — there is no record of when a subscription began,
--                       so this one does not follow the range. `trialing` and
--                       `past_due` are not paying; a subscription cancelled at
--                       period end still is until then.
--   daily               the same per calendar day in `p_tz`
--
-- `p_tz` is the browser's IANA zone, so "today" is the admin's today. An
-- unknown zone falls back to UTC rather than failing the page.
create or replace function public.analytics_report(
  p_from timestamptz,
  p_to   timestamptz,
  p_tz   text default 'UTC'
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_tz     text := coalesce(p_tz, 'UTC');
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

  begin
    perform now() at time zone v_tz;
  exception when others then
    v_tz := 'UTC';
  end;

  with pv as (
    select visitor_id, pathname, viewed_at from public.analytics_page_views
    where viewed_at >= p_from and viewed_at < p_to
  ),
  se as (
    select started_at, last_activity_at, referrer_host, device from public.analytics_sessions
    where started_at >= p_from and started_at < p_to
  ),
  reg as (
    select created_at from public.profiles
    where created_at >= p_from and created_at < p_to
  ),
  days as (
    select d::date as day
    from generate_series(
      (p_from at time zone v_tz)::date,
      ((p_to - interval '1 microsecond') at time zone v_tz)::date,
      interval '1 day') as d
  ),
  pv_day as (
    select (viewed_at at time zone v_tz)::date as day,
           count(*) as page_views,
           count(distinct visitor_id) as visitors
    from pv group by 1
  ),
  se_day as (
    select (started_at at time zone v_tz)::date as day, count(*) as sessions
    from se group by 1
  ),
  reg_day as (
    select (created_at at time zone v_tz)::date as day, count(*) as registrations
    from reg group by 1
  ),
  daily as (
    select days.day,
           coalesce(pv_day.visitors, 0)       as visitors,
           coalesce(se_day.sessions, 0)       as sessions,
           coalesce(pv_day.page_views, 0)     as page_views,
           coalesce(reg_day.registrations, 0) as registrations
    from days
    left join pv_day  on pv_day.day  = days.day
    left join se_day  on se_day.day  = days.day
    left join reg_day on reg_day.day = days.day
  ),
  top_pages as (
    select pathname, count(*) as views, count(distinct visitor_id) as visitors
    from pv group by pathname
    order by views desc, pathname
    limit 20
  ),
  referrers as (
    select referrer_host as host, count(*) as sessions
    from se group by referrer_host
    order by sessions desc, host
    limit 20
  ),
  devices as (
    select device, count(*) as sessions
    from se group by device
  )
  select jsonb_build_object(
    'visitors',            (select count(distinct visitor_id) from pv),
    'page_views',          (select count(*) from pv),
    'sessions',            (select count(*) from se),
    'avg_session_seconds', (select round(avg(extract(epoch from (last_activity_at - started_at))))::int from se),
    'registrations',       (select count(*) from reg),
    'paying_customers',    (select count(*) from public.profiles where subscription_status = 'active'),
    'daily',               (select coalesce(jsonb_agg(jsonb_build_object(
                              'day', to_char(day, 'YYYY-MM-DD'),
                              'visitors', visitors,
                              'sessions', sessions,
                              'page_views', page_views,
                              'registrations', registrations) order by day), '[]'::jsonb)
                            from daily),
    'top_pages',           (select coalesce(jsonb_agg(jsonb_build_object(
                              'pathname', pathname,
                              'views', views,
                              'visitors', visitors) order by views desc, pathname), '[]'::jsonb)
                            from top_pages),
    'referrers',           (select coalesce(jsonb_agg(jsonb_build_object(
                              'host', host,
                              'sessions', sessions) order by sessions desc, host), '[]'::jsonb)
                            from referrers),
    'devices',             (select coalesce(jsonb_agg(jsonb_build_object(
                              'device', device,
                              'sessions', sessions) order by sessions desc, device), '[]'::jsonb)
                            from devices)
  ) into v_result;

  return v_result;
end;
$$;

-- Supabase's default privileges grant EXECUTE on every new function to
-- `anon` directly, not only via `public` — so `anon` is named here, or the
-- function stays callable (the admin check would still refuse, but a door
-- that is closed is better than a door with a guard).
revoke all on function public.analytics_report(timestamptz, timestamptz, text) from public, anon;
grant execute on function public.analytics_report(timestamptz, timestamptz, text) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. Retention — a function, not yet a schedule
-- ═══════════════════════════════════════════════════════════════════════════

-- Deletes page views and sessions older than `p_keep`, and visitors not seen
-- since. Thirteen months is the default because a year-over-year comparison
-- needs a little more than a year. NOT scheduled by this migration: the
-- retention period is the operator's call. To schedule weekly, once decided:
--
--     create extension if not exists pg_cron;
--     select cron.schedule('analytics-purge', '15 3 * * 1',
--                          $$select public.analytics_purge()$$);
--
-- Callable only by the database owner and the cron role — not by any client.
create or replace function public.analytics_purge(p_keep interval default interval '13 months')
returns table (page_views bigint, sessions bigint, visitors bigint)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cutoff timestamptz := now() - p_keep;
  v_pv bigint; v_se bigint; v_vi bigint;
begin
  delete from public.analytics_page_views where viewed_at < v_cutoff;
  get diagnostics v_pv = row_count;
  delete from public.analytics_sessions where last_activity_at < v_cutoff;
  get diagnostics v_se = row_count;
  delete from public.analytics_visitors where last_seen_at < v_cutoff;
  get diagnostics v_vi = row_count;
  return query select v_pv, v_se, v_vi;
end;
$$;

revoke all on function public.analytics_purge(interval) from public, anon, authenticated;
