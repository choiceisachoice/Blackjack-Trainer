-- A flood guard for `analytics_track`, like the other two public writers have.
--
-- `report_client_failure` stops at 30 a minute and `analytics_event` at 120.
-- `analytics_track` had no limit: it is granted to `anon`, and every call
-- inserts a page view and may insert a visitor and a session. Anyone holding
-- the public anon key (it ships in the page) could grow three tables without
-- bound until the 13-month purge.
--
-- The cap is global, not per visitor: the visitor id is chosen by the caller,
-- so a per-visitor limit is one line of code away from being useless. 300 page
-- views a minute is about 25 times the busiest minute so far; past it the
-- visit is simply not counted, and the caller gets `null` instead of an error
-- (the tracker ignores the result either way).
--
-- Only the function body changes. Same signature, so the existing grants
-- (`anon`, `authenticated`) and the `revoke … from public` stay as they are.
-- Safe to run more than once.

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
  v_recent     integer;
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

  -- Checked before the lock and before any write: a flood should cost one
  -- index range count per call, nothing more. Served by
  -- analytics_page_views_viewed_idx.
  select count(*) into v_recent
  from public.analytics_page_views
  where viewed_at > now() - interval '1 minute';
  if v_recent >= 300 then
    return null;
  end if;

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
