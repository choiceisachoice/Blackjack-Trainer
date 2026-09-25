import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PGlite } from '@electric-sql/pglite'

/**
 * A real Postgres for the migrations, in-process.
 *
 * Docker is not available on the development machine, so `supabase start` is
 * not either — and pushing SQL to the production database on the strength of
 * having read it carefully is how the upsert-vs-INSERT-policy loss happened.
 * PGlite is Postgres compiled to WebAssembly: roles, RLS, triggers, plpgsql,
 * advisory locks and time zones all behave as they do on the server, so a
 * test here exercises the migration file that will be pushed, not a model
 * of it.
 *
 * What it stubs, and only that: the `auth` schema Supabase provides —
 * `auth.users` with the columns `handle_new_user` reads, and `auth.uid()` /
 * `auth.role()` reading the JWT claims the way PostgREST sets them. The
 * grants mirror Supabase's defaults for the `public` schema, where every new
 * table is readable by `anon` and `authenticated` and RLS is the guard.
 */

const MIGRATIONS_DIR = join(__dirname, '..', 'migrations')

/** The Postgres role a request runs as, after PostgREST verified its JWT. */
export type JwtRole = 'anon' | 'authenticated' | 'service_role'

export interface Caller {
  role: JwtRole
  /** The user id in the JWT (`sub`), for `authenticated` and `service_role`. */
  sub?: string
}

/** Every migration file, oldest first — the order `supabase db push` uses. */
export function migrationFiles(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql'))
    .sort()
    .map(f => join(MIGRATIONS_DIR, f))
}

/** Boot a database with the Supabase stubs and every migration applied. */
export async function migratedDb(): Promise<PGlite> {
  const db = new PGlite()
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin bypassrls;

    create schema auth;
    grant usage on schema auth to anon, authenticated, service_role;
    create table auth.users (
      id                 uuid primary key default gen_random_uuid(),
      email              text,
      raw_user_meta_data jsonb not null default '{}'::jsonb,
      created_at         timestamptz not null default now()
    );

    -- Supabase's own definitions, verbatim in effect: the claim settings
    -- PostgREST writes per request, read back as uuid and text.
    create function auth.uid() returns uuid language sql stable as $$
      select coalesce(
        nullif(current_setting('request.jwt.claim.sub', true), ''),
        nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
      )::uuid
    $$;
    create function auth.role() returns text language sql stable as $$
      select coalesce(
        nullif(current_setting('request.jwt.claim.role', true), ''),
        nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'
      )::text
    $$;

    grant all on auth.users to service_role;

    grant usage on schema public to anon, authenticated, service_role;
    alter default privileges in schema public
      grant all on tables to anon, authenticated, service_role;
    alter default privileges in schema public
      grant all on sequences to anon, authenticated, service_role;
    alter default privileges in schema public
      grant execute on functions to anon, authenticated, service_role;
  `)
  for (const file of migrationFiles()) {
    await db.exec(readFileSync(file, 'utf8'))
  }
  return db
}

/**
 * Run `fn` the way PostgREST would run a request from `caller`: as that
 * role, with the JWT claims set. Always resets afterwards, so a failing
 * assertion cannot leave the next test running as somebody.
 */
export async function asCaller<T>(db: PGlite, caller: Caller, fn: () => Promise<T>): Promise<T> {
  await db.exec(`
    select set_config('request.jwt.claim.role', '${caller.role}', false);
    select set_config('request.jwt.claim.sub', '${caller.sub ?? ''}', false);
    set role ${caller.role};
  `)
  try {
    return await fn()
  } finally {
    await db.exec(`
      reset role;
      select set_config('request.jwt.claim.role', '', false);
      select set_config('request.jwt.claim.sub', '', false);
    `)
  }
}

/** Create an auth user (the signup trigger creates the profile). */
export async function createUser(db: PGlite, email: string, createdAt?: string): Promise<string> {
  const r = await db.query<{ id: string }>(
    `insert into auth.users (email, created_at) values ($1, coalesce($2::timestamptz, now())) returning id`,
    [email, createdAt ?? null],
  )
  return r.rows[0].id
}

/** One scalar from a query, typed by the caller. */
export async function scalar<T>(db: PGlite, sql: string, params: unknown[] = []): Promise<T> {
  const r = await db.query<Record<string, T>>(sql, params)
  const row = r.rows[0]
  return row[Object.keys(row)[0]]
}
