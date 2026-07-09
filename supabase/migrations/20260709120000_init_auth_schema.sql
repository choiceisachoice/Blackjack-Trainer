-- ADR-001: Authentication & cloud sync — initial schema.
-- 4 tables + RLS (default-deny, per-user) + a profiles row auto-created on signup.

-- ── profiles: one row per user (singular state + preferences) ──
create table if not exists public.profiles (
  id              uuid primary key references auth.users (id) on delete cascade,
  username        text,
  level_xp        integer     not null default 0,
  best_streak     integer     not null default 0,
  onboarding_seen boolean     not null default false,
  selected_system text        not null default 'hi-lo',
  sim_count       integer     not null default 0,
  sim_best_edge   integer     not null default 0,
  settings        jsonb       not null default '{}'::jsonb, -- theme, sound, ambient_volume, dealing_speed
  challenge_state jsonb       not null default '{}'::jsonb, -- daily/weekly progress (small, transient)
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ── training_sessions: append-only training record (queryable) ──
create table if not exists public.training_sessions (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid        not null references auth.users (id) on delete cascade,
  mode             text        not null,
  counting_system  text        not null,
  started_at       timestamptz not null,
  duration_seconds integer     not null,
  total_questions  integer     not null,
  correct_answers  integer     not null,
  accuracy         real        not null,
  best_streak      integer     not null,
  details          jsonb       not null, -- mode-specific SessionDetails (varied shape → JSONB)
  created_at       timestamptz not null default now()
);
create index if not exists training_sessions_user_started_idx
  on public.training_sessions (user_id, started_at desc);

-- ── user_achievements: unlock set (union-mergeable) ──
create table if not exists public.user_achievements (
  user_id        uuid        not null references auth.users (id) on delete cascade,
  achievement_id text        not null,
  unlocked_at    timestamptz not null default now(),
  primary key (user_id, achievement_id)
);

-- ── bankroll_sessions: real-money casino log ──
create table if not exists public.bankroll_sessions (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid        not null references auth.users (id) on delete cascade,
  played_on         date        not null,
  casino            text,
  hours_played      real        not null default 0,
  result            numeric     not null default 0, -- profit/loss
  starting_bankroll numeric,
  final_bankroll    numeric,
  meta              jsonb       not null default '{}'::jsonb, -- accuracies, grade, config
  created_at        timestamptz not null default now()
);
create index if not exists bankroll_sessions_user_date_idx
  on public.bankroll_sessions (user_id, played_on desc);

-- ── Row-Level Security: default-deny, each user sees only their own rows ──
alter table public.profiles          enable row level security;
alter table public.training_sessions enable row level security;
alter table public.user_achievements enable row level security;
alter table public.bankroll_sessions enable row level security;

create policy "own profile" on public.profiles
  for all using (id = auth.uid()) with check (id = auth.uid());

create policy "own training_sessions" on public.training_sessions
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "own user_achievements" on public.user_achievements
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "own bankroll_sessions" on public.bankroll_sessions
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ── Auto-create a profiles row when a new auth user signs up ──
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, username)
  values (new.id, coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── Keep profiles.updated_at fresh ──
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function public.touch_updated_at();
