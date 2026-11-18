// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import type { PGlite } from '@electric-sql/pglite'
import { migratedDb, migrationFiles, asCaller, createUser, scalar, type Caller } from './pg-harness'

/**
 * The client-failures migration, run for real.
 *
 * As in `website-analytics.test.ts`: every test calls the functions the
 * browser will call, as the role the browser will have, and reads the table
 * back as the database owner to check what landed.
 */

interface FailureRow {
  id: number
  occurred_at: Date
  place: string
  message: string
  path: string | null
  signed_in: boolean
  app_build: string | null
}

let db: PGlite
let adminId: string
let userId: string

const ANON: Caller = { role: 'anon' }
const user = (): Caller => ({ role: 'authenticated', sub: userId })
const admin = (): Caller => ({ role: 'authenticated', sub: adminId })

/** Report a failure as `caller`, the way the client's rpc call does. */
async function reportAs(caller: Caller, place: string | null, message: string | null, path: string | null = '/app', build: string | null = 'index-abc.js') {
  await asCaller(db, caller, () =>
    db.query('select public.report_client_failure($1, $2, $3, $4)', [place, message, path, build]))
}

async function recent(caller: Caller, limit?: number): Promise<FailureRow[]> {
  return asCaller(db, caller, async () => {
    const r = limit === undefined
      ? await db.query<FailureRow>('select * from public.client_failures_recent()')
      : await db.query<FailureRow>('select * from public.client_failures_recent($1)', [limit])
    return r.rows
  })
}

const count = () => scalar<number>(db, 'select count(*)::int from public.client_failures')

beforeAll(async () => {
  db = await migratedDb()
  adminId = await createUser(db, 'owner@example.com')
  userId = await createUser(db, 'member@example.com')
  await db.query('insert into public.app_admins (user_id) values ($1)', [adminId])
})

afterAll(async () => {
  await db.close()
})

beforeEach(async () => {
  await db.exec('delete from public.client_failures;')
})

describe('the migration', () => {
  it('applies where pg_cron does not exist, and schedules nothing there', async () => {
    // `migratedDb()` in beforeAll already ran the file; reaching this line is
    // the first half of the assertion. The second: the cron block took its
    // early exit instead of installing or half-installing anything.
    const available = await scalar<boolean>(db, `select exists (select 1 from pg_available_extensions where name = 'pg_cron')`)
    const installed = await scalar<boolean>(db, `select exists (select 1 from pg_extension where extname = 'pg_cron')`)
    const cronSchema = await scalar<boolean>(db, `select exists (select 1 from pg_namespace where nspname = 'cron')`)
    expect(available).toBe(false)
    expect(installed).toBe(false)
    expect(cronSchema).toBe(false)
    expect(await scalar<boolean>(db, `select to_regclass('public.client_failures') is not null`)).toBe(true)
  })

  it('can be applied a second time without failing', async () => {
    // `create … if not exists`, `create or replace`, and a cron block that
    // unschedules before it schedules: a re-run must be a no-op, not an error.
    const file = migrationFiles().find(f => f.endsWith('20261118120000_client_failures.sql'))
    expect(file).toBeDefined()
    await expect(db.exec(readFileSync(file!, 'utf8'))).resolves.toBeDefined()
  })

  it('schedules both purges, weekly, with the functions’ own defaults', () => {
    // pg_cron cannot run here, so what is checked is the text that will run
    // on Supabase: both jobs, idempotent, and no interval argument that could
    // drift from the period the privacy policy states.
    const sql = readFileSync(migrationFiles().find(f => f.endsWith('20261118120000_client_failures.sql'))!, 'utf8')
    expect(sql).toMatch(/cron\.schedule\('analytics-purge', '15 3 \* \* 1',\s*'select public\.analytics_purge\(\)'\)/)
    expect(sql).toMatch(/cron\.schedule\('client-failures-purge', '25 3 \* \* 1',\s*'select public\.client_failures_purge\(\)'\)/)
    expect(sql).toMatch(/cron\.unschedule\(jobid\)/)
    expect(sql).toMatch(/pg_available_extensions where name = 'pg_cron'/)
  })

  it('the scheduling statements run, and run twice, against a stand-in for pg_cron', async () => {
    // The nearest thing to running the cron block without pg_cron: the three
    // dynamic statements, lifted from the file as written, executed against a
    // `cron` schema with the same function signatures pg_cron has. It proves
    // the statements parse and that a second run replaces the jobs instead of
    // doubling them. It does not prove anything about the real extension.
    const sql = readFileSync(migrationFiles().find(f => f.endsWith('20261118120000_client_failures.sql'))!, 'utf8')
    const statements = [...sql.matchAll(/execute \$sql\$([\s\S]*?)\$sql\$;/g)].map(m => m[1])
    expect(statements).toHaveLength(3)

    await db.exec(`
      create schema cron;
      create table cron.job (jobid bigint generated always as identity primary key, jobname text unique, schedule text, command text);
      create function cron.schedule(job_name text, schedule text, command text) returns bigint language sql as $f$
        insert into cron.job (jobname, schedule, command) values (job_name, schedule, command) returning jobid $f$;
      create function cron.unschedule(job_id bigint) returns boolean language sql as $f$
        with gone as (delete from cron.job where jobid = job_id returning 1) select exists (select 1 from gone) $f$;
    `)
    try {
      for (let run = 0; run < 2; run++) {
        for (const s of statements) await db.exec(s)
      }
      const jobs = await db.query<{ jobname: string; schedule: string; command: string }>(
        'select jobname, schedule, command from cron.job order by jobname')
      expect(jobs.rows).toEqual([
        { jobname: 'analytics-purge', schedule: '15 3 * * 1', command: 'select public.analytics_purge()' },
        { jobname: 'client-failures-purge', schedule: '25 3 * * 1', command: 'select public.client_failures_purge()' },
      ])
      // And the commands are real: each runs as the owner, as the job would.
      for (const j of jobs.rows) await expect(db.exec(j.command)).resolves.toBeDefined()
    } finally {
      await db.exec('drop schema cron cascade;')
    }
  })

  it('leaves the table with RLS on and no policy at all', async () => {
    expect(await scalar<boolean>(db, `select relrowsecurity from pg_class where oid = 'public.client_failures'::regclass`)).toBe(true)
    expect(await scalar<number>(db, `select count(*)::int from pg_policies where schemaname = 'public' and tablename = 'client_failures'`)).toBe(0)
  })

  it('changes nothing about the analytics tables or their policies', async () => {
    const r = await db.query<{ tablename: string; cmd: string }>(
      `select tablename, cmd from pg_policies where schemaname = 'public' and tablename like 'analytics_%' order by tablename`,
    )
    expect(r.rows).toEqual([
      { tablename: 'analytics_page_views', cmd: 'SELECT' },
      { tablename: 'analytics_sessions', cmd: 'SELECT' },
      { tablename: 'analytics_visitors', cmd: 'SELECT' },
    ])
  })
})

describe('reporting', () => {
  it('records a report from an anonymous visitor, with no user', async () => {
    await reportAs(ANON, 'checkout-landing', 'TypeError: Failed to fetch', '/de', 'index-B4x9Kq.js')
    const r = await db.query<{ place: string; message: string; path: string; user_id: string | null; app_build: string; age: number }>(
      `select place, message, path, user_id, app_build, extract(epoch from now() - occurred_at)::int as age from public.client_failures`,
    )
    expect(r.rows).toEqual([{
      place: 'checkout-landing', message: 'TypeError: Failed to fetch', path: '/de', user_id: null, app_build: 'index-B4x9Kq.js', age: 0,
    }])
  })

  it('records a report from a signed-in user under the id in their JWT', async () => {
    await reportAs(user(), 'checkout', 'FunctionsHttpError: Edge Function returned a non-2xx status code')
    expect(await scalar<string>(db, 'select user_id from public.client_failures')).toBe(userId)
  })

  it('offers no way to name a different user: four text arguments and nothing else', async () => {
    const sig = await db.query<{ args: string }>(
      `select pg_get_function_identity_arguments(oid) as args from pg_proc where proname = 'report_client_failure' and pronamespace = 'public'::regnamespace`,
    )
    expect(sig.rows).toEqual([{ args: 'p_place text, p_message text, p_path text, p_build text' }])
    // And a caller who puts somebody's id where text goes is still themselves.
    await reportAs(user(), 'checkout', adminId, adminId, adminId)
    expect(await scalar<string>(db, 'select user_id from public.client_failures')).toBe(userId)
    // An anonymous caller with a forged-looking payload is still nobody.
    await db.exec('delete from public.client_failures;')
    await reportAs(ANON, 'checkout', `user_id=${adminId}`)
    expect(await scalar<string | null>(db, 'select user_id from public.client_failures')).toBeNull()
  })

  it('ignores a null, empty or blank place without raising', async () => {
    await reportAs(ANON, null, 'x')
    await reportAs(ANON, '', 'x')
    await reportAs(ANON, '   ', 'x')
    expect(await count()).toBe(0)
  })

  it('truncates place to 60, message to 500, path to 200 and build to 40', async () => {
    await reportAs(ANON, 'p'.repeat(100), 'm'.repeat(5000), '/' + 'a'.repeat(999), 'b'.repeat(99))
    const r = await db.query<{ place: number; message: number; path: number; build: number }>(
      `select length(place) as place, length(message) as message, length(path) as path, length(app_build) as build from public.client_failures`,
    )
    expect(r.rows).toEqual([{ place: 60, message: 500, path: 200, build: 40 }])
  })

  it('stores a missing message as empty and a missing path or build as null', async () => {
    await reportAs(ANON, 'checkout', null, null, null)
    await reportAs(ANON, 'checkout', 'x', '', '')
    const r = await db.query<{ message: string; path: string | null; app_build: string | null }>(
      'select message, path, app_build from public.client_failures order by id',
    )
    expect(r.rows).toEqual([
      { message: '', path: null, app_build: null },
      { message: 'x', path: null, app_build: null },
    ])
  })

  it('can be called with place and message alone', async () => {
    await asCaller(db, ANON, () => db.query(`select public.report_client_failure('checkout', 'boom')`))
    expect(await count()).toBe(1)
  })

  it('keeps the row, unlinked, when the account is deleted', async () => {
    const gone = await createUser(db, 'leaving@example.com')
    await reportAs({ role: 'authenticated', sub: gone }, 'data-export', 'Error: boom')
    await db.query('delete from auth.users where id = $1', [gone])
    const r = await db.query<{ user_id: string | null }>('select user_id from public.client_failures')
    expect(r.rows).toEqual([{ user_id: null }])
  })
})

describe('the flood guard', () => {
  it('stops at 30 rows a minute, whoever is calling', async () => {
    for (let i = 0; i < 20; i++) await reportAs(ANON, 'checkout', `n${i}`)
    for (let i = 20; i < 40; i++) await reportAs(user(), 'checkout', `n${i}`)
    expect(await count()).toBe(30)
    // The ones that got in are the first thirty, not a sample.
    expect(await scalar<string>(db, 'select message from public.client_failures order by id desc limit 1')).toBe('n29')
  })

  it('drops silently: the caller cannot tell a dropped report from a stored one', async () => {
    for (let i = 0; i < 30; i++) await reportAs(ANON, 'checkout', 'x')
    await expect(reportAs(ANON, 'checkout', 'one too many')).resolves.toBeUndefined()
    expect(await count()).toBe(30)
  })

  it('opens again once the minute has passed', async () => {
    for (let i = 0; i < 30; i++) await reportAs(ANON, 'checkout', 'x')
    await db.query(`update public.client_failures set occurred_at = now() - interval '61 seconds'`)
    await reportAs(ANON, 'checkout', 'after the flood')
    expect(await count()).toBe(31)
  })

  it('counts only the last minute, so old rows never block a new report', async () => {
    for (let i = 0; i < 30; i++) await reportAs(ANON, 'checkout', 'x')
    await db.query(`update public.client_failures set occurred_at = now() - interval '2 days'`)
    for (let i = 0; i < 5; i++) await reportAs(ANON, 'billing-portal', 'y')
    expect(await count()).toBe(35)
  })
})

describe('direct access to the table', () => {
  beforeEach(async () => {
    await reportAs(ANON, 'checkout', 'Error: boom')
  })

  it.each([
    ['anon', (): Caller => ANON],
    ['a signed-in user', user],
    ['an admin', admin],
  ])('%s cannot select it', async (_label, who) => {
    await expect(asCaller(db, who(), () => db.query('select * from public.client_failures')))
      .rejects.toThrow(/permission denied/)
  })

  it.each([
    ['anon', (): Caller => ANON],
    ['a signed-in user', user],
    ['an admin', admin],
  ])('%s cannot insert, update or delete', async (_label, who) => {
    await expect(asCaller(db, who(), () =>
      db.query(`insert into public.client_failures (place, message) values ('checkout', 'forged')`)))
      .rejects.toThrow(/permission denied|policy/)
    await expect(asCaller(db, who(), () =>
      db.query(`update public.client_failures set message = 'edited'`)))
      .rejects.toThrow(/permission denied|policy/)
    await expect(asCaller(db, who(), () =>
      db.query('delete from public.client_failures')))
      .rejects.toThrow(/permission denied|policy/)
    expect(await scalar<string>(db, 'select message from public.client_failures')).toBe('Error: boom')
    expect(await count()).toBe(1)
  })

  it('would still show a client nothing if the SELECT grant came back: RLS has no policy', async () => {
    // The revoke is the first lock; this is the second. Someone re-running
    // Supabase's default grants must not open the table.
    await db.exec('grant select on public.client_failures to authenticated;')
    try {
      const seen = await asCaller(db, admin(), () => scalar<number>(db, 'select count(*)::int from public.client_failures'))
      expect(seen).toBe(0)
    } finally {
      await db.exec('revoke select on public.client_failures from authenticated;')
    }
  })
})

describe('client_failures_recent', () => {
  it('refuses a signed-in user who is not an admin, like analytics_report', async () => {
    await expect(recent(user())).rejects.toThrow(/forbidden/)
  })

  it('refuses anonymous callers before the function runs', async () => {
    await expect(recent(ANON)).rejects.toThrow(/permission denied/)
  })

  it('returns the rows newest first for an admin, with signed-in as yes/no and no user id', async () => {
    await reportAs(ANON, 'checkout-landing', 'oldest', '/')
    await reportAs(user(), 'checkout', 'middle', '/app')
    await reportAs(ANON, 'billing-portal', 'newest', '/account')
    await db.query(`update public.client_failures set occurred_at = now() - interval '2 hours' where message = 'oldest'`)
    await db.query(`update public.client_failures set occurred_at = now() - interval '1 hour' where message = 'middle'`)

    const rows = await recent(admin())
    expect(rows.map(r => [r.place, r.message, r.path, r.signed_in])).toEqual([
      ['billing-portal', 'newest', '/account', false],
      ['checkout', 'middle', '/app', true],
      ['checkout-landing', 'oldest', '/', false],
    ])
    expect(Object.keys(rows[0]).sort()).toEqual(['app_build', 'id', 'message', 'occurred_at', 'path', 'place', 'signed_in'])
  })

  it('breaks a tie in time by the later insert', async () => {
    await reportAs(ANON, 'checkout', 'first')
    await reportAs(ANON, 'checkout', 'second')
    await db.query(`update public.client_failures set occurred_at = '2026-11-01T10:00:00Z'`)
    expect((await recent(admin())).map(r => r.message)).toEqual(['second', 'first'])
  })

  it('returns 50 by default and clamps the limit to 1..200', async () => {
    // Written as the owner: 230 rows through the function would need eight
    // minutes of flood guard.
    await db.query(`
      insert into public.client_failures (place, message, occurred_at)
      select 'checkout', 'n' || g, now() - make_interval(secs => g) from generate_series(1, 230) g`)
    expect(await recent(admin())).toHaveLength(50)
    expect(await recent(admin(), 10)).toHaveLength(10)
    expect(await recent(admin(), 0)).toHaveLength(1)
    expect(await recent(admin(), -5)).toHaveLength(1)
    expect(await recent(admin(), 100000)).toHaveLength(200)
    const viaNull = await asCaller(db, admin(), () => db.query('select * from public.client_failures_recent(null)'))
    expect(viaNull.rows).toHaveLength(50)
  })

  it('returns an empty list, not an error, when nothing was reported', async () => {
    expect(await recent(admin())).toEqual([])
  })
})

describe('retention', () => {
  it('purges failures older than 90 days and keeps the rest', async () => {
    await db.query(`
      insert into public.client_failures (place, message, occurred_at) values
        ('checkout', 'ancient',   now() - interval '400 days'),
        ('checkout', 'day 91',    now() - interval '91 days'),
        ('checkout', 'day 89',    now() - interval '89 days'),
        ('checkout', 'yesterday', now() - interval '1 day')`)
    await reportAs(ANON, 'checkout', 'now')

    expect(await scalar<number>(db, 'select public.client_failures_purge()::int')).toBe(2)
    const left = await db.query<{ message: string }>('select message from public.client_failures order by occurred_at')
    expect(left.rows.map(r => r.message)).toEqual(['day 89', 'yesterday', 'now'])
  })

  it('takes another period when given one', async () => {
    await db.query(`
      insert into public.client_failures (place, message, occurred_at) values
        ('checkout', 'eight days', now() - interval '8 days'),
        ('checkout', 'six days',   now() - interval '6 days')`)
    expect(await scalar<number>(db, `select public.client_failures_purge(interval '7 days')::int`)).toBe(1)
    expect(await scalar<string>(db, 'select message from public.client_failures')).toBe('six days')
  })

  it('does not let any client call the purge, admin or not', async () => {
    for (const who of [ANON, user(), admin()]) {
      await expect(asCaller(db, who, () => db.query('select public.client_failures_purge()')))
        .rejects.toThrow(/permission denied/)
    }
  })

  it('analytics_purge deletes only what is older than 13 months — the period the privacy policy states', async () => {
    const OLD = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
    const EDGE = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
    const FRESH = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
    await db.exec('delete from public.analytics_page_views; delete from public.analytics_sessions; delete from public.analytics_visitors;')
    for (const v of [OLD, EDGE, FRESH]) {
      await asCaller(db, ANON, () => db.query('select public.analytics_track($1, $2)', [v, '/']))
    }
    // 13 months and a day is out; 12 months and 29 days is still in.
    for (const [v, age] of [[OLD, `interval '13 months 1 day'`], [EDGE, `interval '12 months 29 days'`]] as const) {
      await db.query(`update public.analytics_sessions set started_at = now() - ${age}, last_activity_at = now() - ${age} where visitor_id = $1`, [v])
      await db.query(`update public.analytics_page_views set viewed_at = now() - ${age} where visitor_id = $1`, [v])
      await db.query(`update public.analytics_visitors set last_seen_at = now() - ${age} where id = $1`, [v])
    }

    // Called exactly as the cron job calls it: no argument.
    const r = await db.query<{ page_views: number; sessions: number; visitors: number }>('select * from public.analytics_purge()')
    expect(r.rows[0]).toEqual({ page_views: 1, sessions: 1, visitors: 1 })
    const left = await db.query<{ id: string }>('select id from public.analytics_visitors order by id')
    expect(left.rows.map(x => x.id)).toEqual([EDGE, FRESH])
    expect(await scalar<number>(db, 'select count(*)::int from public.analytics_page_views')).toBe(2)

    await db.exec('delete from public.analytics_page_views; delete from public.analytics_sessions; delete from public.analytics_visitors;')
  })

  it('states the same periods in the privacy policy as the functions default to', async () => {
    const defaults = await db.query<{ proname: string; args: string }>(
      `select proname, pg_get_function_arguments(oid) as args from pg_proc
       where pronamespace = 'public'::regnamespace and proname in ('analytics_purge', 'client_failures_purge') order by proname`,
    )
    expect(defaults.rows).toEqual([
      { proname: 'analytics_purge', args: `p_keep interval DEFAULT '1 year 1 mon'::interval` },
      { proname: 'client_failures_purge', args: `p_older_than interval DEFAULT '90 days'::interval` },
    ])
    const policy = readFileSync(new URL('../../src/pages/legal/privacy-content.ts', import.meta.url), 'utf8')
    expect(policy).toMatch(/statistics are kept for 13 months/i)
    expect(policy).toMatch(/90 days/)
  })
})
