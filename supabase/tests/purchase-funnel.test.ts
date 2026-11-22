// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import type { PGlite } from '@electric-sql/pglite'
import { migratedDb, migrationFiles, asCaller, createUser, scalar, type Caller } from './pg-harness'

/**
 * The purchase-funnel migration, run for real.
 *
 * As in the two test files beside it: every test calls the functions the
 * browser will call, as the role the browser will have, and reads the table
 * back as the database owner to check what landed.
 */

const FILE = '20261121120000_purchase_funnel.sql'

interface Funnel {
  visitors: number
  signup_views: number
  registrations: number
  first_sessions: number
  paywall_views: number
  checkout_starts: number
  paying_customers: number
  events_since: string | null
}

let db: PGlite
let adminId: string
let userId: string

const ANON: Caller = { role: 'anon' }
const user = (): Caller => ({ role: 'authenticated', sub: userId })
const admin = (): Caller => ({ role: 'authenticated', sub: adminId })
const as = (sub: string): Caller => ({ role: 'authenticated', sub })

/** A visitor id that is a valid UUID and easy to read in a failure. */
const visitor = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const V1 = visitor(1)
const V2 = visitor(2)
const V3 = visitor(3)

/** Record a step as `caller`, the way the client's rpc call does. */
async function event(caller: Caller, visitorId: string | null, name: string | null) {
  await asCaller(db, caller, () => db.query('select public.analytics_event($1, $2)', [visitorId, name]))
}

async function funnel(caller: Caller, from: string, to: string): Promise<Funnel> {
  return asCaller(db, caller, () => scalar<Funnel>(db, 'select public.analytics_funnel($1, $2)', [from, to]))
}

const count = () => scalar<number>(db, 'select count(*)::int from public.analytics_events')
const names = async () =>
  (await db.query<{ name: string }>('select name from public.analytics_events order by id')).rows.map(r => r.name)

const sql = () => readFileSync(migrationFiles().find(f => f.endsWith(FILE))!, 'utf8')

beforeAll(async () => {
  db = await migratedDb()
  adminId = await createUser(db, 'owner@example.com', '2026-01-01T00:00:00Z')
  userId = await createUser(db, 'member@example.com', '2026-01-01T00:00:00Z')
  await db.query('insert into public.app_admins (user_id) values ($1)', [adminId])
})

afterAll(async () => {
  await db.close()
})

beforeEach(async () => {
  await db.exec('delete from public.analytics_events;')
})

describe('the migration', () => {
  it('applies where pg_cron does not exist, and creates the table', async () => {
    expect(await scalar<boolean>(db, `select to_regclass('public.analytics_events') is not null`)).toBe(true)
    expect(await scalar<boolean>(db, `select exists (select 1 from pg_namespace where nspname = 'cron')`)).toBe(false)
  })

  it('can be applied a second time without failing — it is pasted into the SQL editor', async () => {
    await expect(db.exec(sql())).resolves.toBeDefined()
    await expect(db.exec(sql())).resolves.toBeDefined()
  })

  it('contains no statement that cannot be repeated', () => {
    const text = sql().replace(/--.*$/gm, '')
    expect(text).not.toMatch(/create\s+policy/i)
    expect(text).not.toMatch(/create\s+table\s+(?!if not exists)/i)
    expect(text).not.toMatch(/create\s+(unique\s+)?index\s+(?!if not exists)/i)
    expect(text).not.toMatch(/create\s+function/i)
    expect(text).not.toMatch(/alter\s+table\s+\S+\s+add\b/i)
  })

  it('leaves the table with RLS on and no policy at all', async () => {
    expect(await scalar<boolean>(db, `select relrowsecurity from pg_class where oid = 'public.analytics_events'::regclass`)).toBe(true)
    expect(await scalar<number>(db, `select count(*)::int from pg_policies where schemaname = 'public' and tablename = 'analytics_events'`)).toBe(0)
  })

  it('makes every function SECURITY DEFINER with an empty search_path', async () => {
    const r = await db.query<{ proname: string; prosecdef: boolean; config: string[] | null }>(
      `select proname, prosecdef, proconfig as config from pg_proc
       where pronamespace = 'public'::regnamespace
         and proname in ('analytics_event', 'analytics_funnel', 'analytics_events_purge') order by proname`,
    )
    expect(r.rows).toEqual([
      { proname: 'analytics_event', prosecdef: true, config: ['search_path=""'] },
      { proname: 'analytics_events_purge', prosecdef: true, config: ['search_path=""'] },
      { proname: 'analytics_funnel', prosecdef: true, config: ['search_path=""'] },
    ])
  })

  it('changes nothing about the existing analytics functions', async () => {
    // `analytics_purge` keeps its three result columns: this migration adds a
    // purge of its own instead of replacing that one.
    const r = await db.query<{ args: string; result: string }>(
      `select pg_get_function_arguments(oid) as args, pg_get_function_result(oid) as result
       from pg_proc where pronamespace = 'public'::regnamespace and proname = 'analytics_purge'`,
    )
    expect(r.rows).toEqual([{
      args: `p_keep interval DEFAULT '1 year 1 mon'::interval`,
      result: 'TABLE(page_views bigint, sessions bigint, visitors bigint)',
    }])
  })

  it('schedules the purge weekly with the function’s own default, replacing a job of the same name', async () => {
    const text = sql()
    expect(text).toMatch(/cron\.schedule\('analytics-events-purge', '20 3 \* \* 1',\s*'select public\.analytics_events_purge\(\)'\)/)
    expect(text).toMatch(/pg_available_extensions where name = 'pg_cron'/)

    // The dynamic statements, lifted from the file as written, against a
    // stand-in with pg_cron's signatures. Proves they parse and that a second
    // run replaces the job; proves nothing about the real extension.
    const statements = [...text.matchAll(/execute \$sql\$([\s\S]*?)\$sql\$;/g)].map(m => m[1])
    expect(statements).toHaveLength(2)
    await db.exec(`
      create schema cron;
      create table cron.job (jobid bigint generated always as identity primary key, jobname text unique, schedule text, command text);
      create function cron.schedule(job_name text, schedule text, command text) returns bigint language sql as $f$
        insert into cron.job (jobname, schedule, command) values (job_name, schedule, command) returning jobid $f$;
      create function cron.unschedule(job_id bigint) returns boolean language sql as $f$
        with gone as (delete from cron.job where jobid = job_id returning 1) select exists (select 1 from gone) $f$;
      insert into cron.job (jobname, schedule, command) values ('analytics-purge', '15 3 * * 1', 'select public.analytics_purge()');
    `)
    try {
      for (let run = 0; run < 2; run++) {
        for (const s of statements) await db.exec(s)
      }
      const jobs = await db.query<{ jobname: string; schedule: string; command: string }>(
        'select jobname, schedule, command from cron.job order by jobname')
      expect(jobs.rows).toEqual([
        { jobname: 'analytics-events-purge', schedule: '20 3 * * 1', command: 'select public.analytics_events_purge()' },
        // Somebody else's job is left alone.
        { jobname: 'analytics-purge', schedule: '15 3 * * 1', command: 'select public.analytics_purge()' },
      ])
      await expect(db.exec(jobs.rows[0].command)).resolves.toBeDefined()
    } finally {
      await db.exec('drop schema cron cascade;')
    }
  })
})

describe('analytics_event — the allow-list', () => {
  it('stores each of the five steps', async () => {
    for (const n of ['signup_view', 'signup_done', 'paywall_view', 'checkout_start']) await event(ANON, V1, n)
    await event(user(), V1, 'first_session')
    expect(await names()).toEqual(['signup_view', 'signup_done', 'paywall_view', 'checkout_start', 'first_session'])
  })

  it('ignores every other name without raising', async () => {
    for (const n of ['page_view', 'SIGNUP_VIEW', ' signup_view', 'signup_view ', '', 'purchase', `signup_view'; drop table public.profiles; --`, 'a'.repeat(5000)]) {
      await expect(event(ANON, V1, n)).resolves.toBeUndefined()
    }
    expect(await count()).toBe(0)
  })

  it('ignores a null name and a null visitor id', async () => {
    await event(ANON, V1, null)
    await event(ANON, null, 'signup_view')
    expect(await count()).toBe(0)
  })

  it('keeps the same list in the table’s own check, so no other writer can widen it', async () => {
    await expect(db.query(`insert into public.analytics_events (visitor_id, name) values ($1, 'anything')`, [V1]))
      .rejects.toThrow(/check constraint/)
  })

  it('has two arguments and no room for text or a user: uuid and the name', async () => {
    const sig = await db.query<{ args: string }>(
      `select pg_get_function_identity_arguments(oid) as args from pg_proc where proname = 'analytics_event' and pronamespace = 'public'::regnamespace`,
    )
    expect(sig.rows).toEqual([{ args: 'p_visitor_id uuid, p_name text' }])
    const cols = await db.query<{ column_name: string }>(
      `select column_name from information_schema.columns where table_schema = 'public' and table_name = 'analytics_events' order by ordinal_position`,
    )
    expect(cols.rows.map(c => c.column_name)).toEqual(['id', 'occurred_at', 'visitor_id', 'name', 'user_id'])
  })
})

describe('analytics_event — who', () => {
  it('stores an anonymous step with no user', async () => {
    await event(ANON, V1, 'signup_view')
    const r = await db.query<{ visitor_id: string; user_id: string | null; age: number }>(
      `select visitor_id, user_id, extract(epoch from now() - occurred_at)::int as age from public.analytics_events`)
    expect(r.rows).toEqual([{ visitor_id: V1, user_id: null, age: 0 }])
  })

  it('takes the user from the JWT', async () => {
    await event(user(), V1, 'paywall_view')
    expect(await scalar<string>(db, 'select user_id from public.analytics_events')).toBe(userId)
  })

  it('cannot be told to be someone else: another account’s id as the visitor id is only a visitor id', async () => {
    await event(user(), adminId, 'checkout_start')
    const r = await db.query<{ visitor_id: string; user_id: string }>('select visitor_id, user_id from public.analytics_events')
    expect(r.rows).toEqual([{ visitor_id: adminId, user_id: userId }])
    await db.exec('delete from public.analytics_events;')
    await event(ANON, adminId, 'checkout_start')
    expect(await scalar<string | null>(db, 'select user_id from public.analytics_events')).toBeNull()
  })

  it('keeps the row, unlinked, when the account is deleted', async () => {
    const gone = await createUser(db, 'leaving@example.com', '2026-01-01T00:00:00Z')
    await event(as(gone), V1, 'first_session')
    await event(as(gone), V1, 'paywall_view')
    await db.query('delete from auth.users where id = $1', [gone])
    const r = await db.query<{ user_id: string | null }>('select user_id from public.analytics_events')
    expect(r.rows).toEqual([{ user_id: null }, { user_id: null }])
  })
})

describe('analytics_event — first_session is once per account', () => {
  it('ignores an anonymous first session: there is no account to count', async () => {
    await event(ANON, V1, 'first_session')
    expect(await count()).toBe(0)
  })

  it('stores one, whatever device it comes from and however much later', async () => {
    await event(user(), V1, 'first_session')
    await db.query(`update public.analytics_events set occurred_at = now() - interval '40 days'`)
    await event(user(), V1, 'first_session')
    await event(user(), V2, 'first_session')
    expect(await count()).toBe(1)
  })

  it('lets every account have its own', async () => {
    await event(user(), V1, 'first_session')
    await event(admin(), V1, 'first_session')
    expect(await count()).toBe(2)
  })

  it('is backed by a unique index, so a concurrent second insert cannot land', async () => {
    await event(user(), V1, 'first_session')
    await expect(db.query(
      `insert into public.analytics_events (visitor_id, name, user_id) values ($1, 'first_session', $2)`, [V2, userId]))
      .rejects.toThrow(/unique|duplicate/)
  })
})

describe('analytics_event — the repeat guard', () => {
  it('stores the same step from the same visitor once within 30 minutes', async () => {
    for (let i = 0; i < 5; i++) await event(user(), V1, 'paywall_view')
    expect(await count()).toBe(1)
  })

  it('stores it again after the 30 minutes', async () => {
    await event(user(), V1, 'paywall_view')
    await db.query(`update public.analytics_events set occurred_at = now() - interval '31 minutes'`)
    await event(user(), V1, 'paywall_view')
    expect(await count()).toBe(2)
  })

  it('does not confuse steps, visitors or accounts with each other', async () => {
    await event(ANON, V1, 'signup_view')
    await event(ANON, V1, 'signup_done')
    await event(ANON, V2, 'signup_view')
    await event(user(), V1, 'signup_view')
    expect(await count()).toBe(4)
  })
})

describe('analytics_event — the flood guard', () => {
  it('stops at 120 rows a minute, whoever is calling', async () => {
    for (let i = 0; i < 70; i++) await event(ANON, visitor(1000 + i), 'signup_view')
    for (let i = 70; i < 140; i++) await event(user(), visitor(1000 + i), 'paywall_view')
    expect(await count()).toBe(120)
  })

  it('drops silently, and opens again once the minute has passed', async () => {
    await db.query(`
      insert into public.analytics_events (visitor_id, name)
      select gen_random_uuid(), 'signup_view' from generate_series(1, 120)`)
    await expect(event(ANON, V1, 'signup_view')).resolves.toBeUndefined()
    expect(await count()).toBe(120)
    await db.query(`update public.analytics_events set occurred_at = now() - interval '61 seconds'`)
    await event(ANON, V1, 'signup_view')
    expect(await count()).toBe(121)
  })
})

describe('direct access to the table', () => {
  beforeEach(async () => {
    await event(ANON, V1, 'signup_view')
  })

  it.each([
    ['anon', (): Caller => ANON],
    ['a signed-in user', user],
    ['an admin', admin],
  ])('%s cannot select it', async (_label, who) => {
    await expect(asCaller(db, who(), () => db.query('select * from public.analytics_events')))
      .rejects.toThrow(/permission denied/)
  })

  it.each([
    ['anon', (): Caller => ANON],
    ['a signed-in user', user],
    ['an admin', admin],
  ])('%s cannot insert, update or delete', async (_label, who) => {
    await expect(asCaller(db, who(), () =>
      db.query(`insert into public.analytics_events (visitor_id, name) values ($1, 'checkout_start')`, [V2])))
      .rejects.toThrow(/permission denied|policy/)
    await expect(asCaller(db, who(), () =>
      db.query(`update public.analytics_events set name = 'checkout_start'`)))
      .rejects.toThrow(/permission denied|policy/)
    await expect(asCaller(db, who(), () =>
      db.query('delete from public.analytics_events')))
      .rejects.toThrow(/permission denied|policy/)
    expect(await names()).toEqual(['signup_view'])
  })

  it('would still show a client nothing if the SELECT grant came back: RLS has no policy', async () => {
    await db.exec('grant select on public.analytics_events to authenticated;')
    try {
      const seen = await asCaller(db, admin(), () => scalar<number>(db, 'select count(*)::int from public.analytics_events'))
      expect(seen).toBe(0)
    } finally {
      await db.exec('revoke select on public.analytics_events from authenticated;')
    }
  })
})

describe('analytics_funnel — who may ask', () => {
  const FROM = '2026-11-01T00:00:00Z'
  const TO = '2026-12-01T00:00:00Z'

  it('refuses a signed-in user who is not an admin, like analytics_report', async () => {
    await expect(funnel(user(), FROM, TO)).rejects.toThrow(/forbidden/)
  })

  it('refuses anonymous callers before the function runs', async () => {
    await expect(funnel(ANON, FROM, TO)).rejects.toThrow(/permission denied/)
  })

  it('refuses a missing, empty, backwards or over-long range', async () => {
    await expect(asCaller(db, admin(), () => db.query('select public.analytics_funnel(null, $1)', [TO]))).rejects.toThrow(/invalid range/)
    await expect(funnel(admin(), TO, TO)).rejects.toThrow(/invalid range/)
    await expect(funnel(admin(), TO, FROM)).rejects.toThrow(/invalid range/)
    await expect(funnel(admin(), '2025-01-01T00:00:00Z', TO)).rejects.toThrow(/range too long/)
  })
})

describe('analytics_funnel — the definitions, on a small fixture', () => {
  const FROM = '2026-11-01T00:00:00Z'
  const TO = '2026-11-08T00:00:00Z'
  const IN = '2026-11-03T10:00:00Z'
  const BEFORE = '2026-10-20T10:00:00Z'
  const AFTER = '2026-11-08T00:00:00Z' // the end of the range is exclusive
  let payer: string
  let fresh1: string
  let fresh2: string
  let oldTimer: string

  /** Written as the owner, with a time: the function always stamps `now()`. */
  async function at(time: string, visitorId: string, name: string, uid: string | null = null) {
    await db.query(
      'insert into public.analytics_events (occurred_at, visitor_id, name, user_id) values ($1, $2, $3, $4)',
      [time, visitorId, name, uid])
  }
  async function view(time: string, visitorId: string) {
    await db.query('insert into public.analytics_visitors (id) values ($1) on conflict do nothing', [visitorId])
    const sid = await scalar<string>(db,
      `insert into public.analytics_sessions (visitor_id, started_at, last_activity_at, landing_page, exit_page)
       values ($1, $2, $2, '/', '/') returning id`, [visitorId, time])
    await db.query('insert into public.analytics_page_views (session_id, visitor_id, pathname, viewed_at) values ($1, $2, $3, $4)',
      [sid, visitorId, '/', time])
  }

  beforeAll(async () => {
    fresh1 = await createUser(db, 'new-one@example.com', IN)
    fresh2 = await createUser(db, 'new-two@example.com', IN)
    oldTimer = await createUser(db, 'old-timer@example.com', BEFORE)
    payer = await createUser(db, 'payer@example.com', BEFORE)
    // The signup trigger stamps the profile with now(); in production that is
    // the same instant as the auth row. Here the dates are moved by hand.
    await db.exec('update public.profiles p set created_at = u.created_at from auth.users u where u.id = p.id;')
    // The entitlement can only be written by service_role, as the webhook does.
    await asCaller(db, { role: 'service_role' }, () =>
      db.query(`update public.profiles set subscription_status = 'active' where id = $1`, [payer]))
    await asCaller(db, { role: 'service_role' }, () =>
      db.query(`update public.profiles set subscription_status = 'past_due' where id = $1`, [oldTimer]))
  })

  beforeEach(async () => {
    await db.exec('delete from public.analytics_page_views; delete from public.analytics_sessions; delete from public.analytics_visitors;')
    // Visitors: five in the range (one of them twice), one before, one at the
    // exclusive end.
    for (const n of [1, 2, 3, 4, 5]) await view(IN, visitor(n))
    await view('2026-11-04T09:00:00Z', V1)
    await view(BEFORE, visitor(6))
    await view(AFTER, visitor(7))

    // Sign-up form: three visitors in the range, one of them twice.
    await at(IN, V1, 'signup_view')
    await at('2026-11-05T10:00:00Z', V1, 'signup_view')
    await at(IN, V2, 'signup_view')
    await at(IN, V3, 'signup_view')
    await at(BEFORE, visitor(6), 'signup_view')
    // `signup_done` is recorded but is not what the report counts.
    await at(IN, V1, 'signup_done', fresh1)

    // First sessions: one new account, and one account from before the range.
    await at(IN, V1, 'first_session', fresh1)
    await at(IN, visitor(8), 'first_session', oldTimer)
    await at(AFTER, V2, 'first_session', fresh2)

    // Paywall: the same account on two devices is one person; an anonymous
    // visitor is another; one more view lies outside the range.
    await at(IN, V1, 'paywall_view', fresh1)
    await at(IN, visitor(9), 'paywall_view', fresh1)
    await at(IN, V3, 'paywall_view')
    await at(BEFORE, V2, 'paywall_view', oldTimer)

    // Checkout: one account, twice.
    await at(IN, V1, 'checkout_start', fresh1)
    await at('2026-11-06T10:00:00Z', V1, 'checkout_start', fresh1)
  })

  it('counts each step by its definition', async () => {
    const f = await funnel(admin(), FROM, TO)
    expect(f).toEqual({
      visitors: 5,          // distinct visitor ids with a page view in the range
      signup_views: 3,      // distinct visitors shown the sign-up form
      registrations: 2,     // profiles created in the range
      first_sessions: 2,    // accounts whose first session fell in the range
      paywall_views: 2,     // one account (two devices) + one anonymous visitor
      checkout_starts: 1,   // one account, however often
      paying_customers: 1,  // active now; `past_due` is not paying
      events_since: expect.any(String),
    })
    expect(new Date(f.events_since!).toISOString()).toBe('2026-10-20T10:00:00.000Z')
  })

  it('agrees with analytics_report on the three numbers they share', async () => {
    const f = await funnel(admin(), FROM, TO)
    const r = await asCaller(db, admin(), () =>
      scalar<{ visitors: number; registrations: number; paying_customers: number }>(
        db, 'select public.analytics_report($1, $2)', [FROM, TO]))
    expect([f.visitors, f.registrations, f.paying_customers]).toEqual([r.visitors, r.registrations, r.paying_customers])
  })

  it('follows the range for every step but paying customers', async () => {
    const f = await funnel(admin(), '2026-10-01T00:00:00Z', '2026-11-01T00:00:00Z')
    expect(f).toMatchObject({
      visitors: 1, signup_views: 1, registrations: 2, first_sessions: 0,
      paywall_views: 1, checkout_starts: 0, paying_customers: 1,
    })
  })

  it('returns zeros and no start date when nothing was ever recorded', async () => {
    await db.exec('delete from public.analytics_events; delete from public.analytics_page_views;')
    const f = await funnel(admin(), '2027-03-01T00:00:00Z', '2027-03-02T00:00:00Z')
    expect(f).toEqual({
      visitors: 0, signup_views: 0, registrations: 0, first_sessions: 0,
      paywall_views: 0, checkout_starts: 0, paying_customers: 1, events_since: null,
    })
  })

  it('returns counts only — no visitor id and no account id', async () => {
    const f = await funnel(admin(), FROM, TO)
    expect(JSON.stringify(f)).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/)
  })
})

describe('retention', () => {
  it('purges steps older than 13 months — the period the privacy policy states — and keeps the rest', async () => {
    await db.query(`
      insert into public.analytics_events (visitor_id, name, occurred_at) values
        ($1, 'signup_view',  now() - interval '13 months 1 day'),
        ($1, 'paywall_view', now() - interval '12 months 29 days'),
        ($1, 'signup_done',  now() - interval '1 day')`, [V1])
    expect(await scalar<number>(db, 'select public.analytics_events_purge()::int')).toBe(1)
    expect(await names()).toEqual(['paywall_view', 'signup_done'])

    const args = await scalar<string>(db,
      `select pg_get_function_arguments(oid) from pg_proc where pronamespace = 'public'::regnamespace and proname = 'analytics_events_purge'`)
    expect(args).toBe(`p_keep interval DEFAULT '1 year 1 mon'::interval`)
    const policy = readFileSync(new URL('../../src/pages/legal/privacy-content.ts', import.meta.url), 'utf8')
    expect(policy).toMatch(/statistics are kept for 13 months/i)
  })

  it('does not let any client call the purge, admin or not', async () => {
    for (const who of [ANON, user(), admin()]) {
      await expect(asCaller(db, who, () => db.query('select public.analytics_events_purge()')))
        .rejects.toThrow(/permission denied/)
    }
  })
})
