// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import { migratedDb, asCaller, createUser, scalar } from './pg-harness'

/**
 * The analytics migration, run for real.
 *
 * Every test here calls the functions the browser will call, as the role the
 * browser will have, and reads the tables back as the database owner to check
 * what landed. The report is asserted as the admin page will read it.
 */

const V1 = '11111111-1111-1111-1111-111111111111'
const V2 = '22222222-2222-2222-2222-222222222222'

interface Report {
  visitors: number
  page_views: number
  sessions: number
  avg_session_seconds: number | null
  registrations: number
  paying_customers: number
  daily: { day: string; visitors: number; sessions: number; page_views: number; registrations: number }[]
  top_pages: { pathname: string; views: number; visitors: number }[]
  referrers: { host: string | null; sessions: number }[]
  devices: { device: string | null; sessions: number }[]
}

let db: PGlite
let adminId: string
let userId: string

/** Track a page view as `caller`; returns the session id. */
async function track(caller: Parameters<typeof asCaller>[1], visitor: string, path: string, referrer: string | null = null, device: string | null = null) {
  return asCaller(db, caller, () =>
    scalar<string>(db, 'select public.analytics_track($1, $2, $3, $4)', [visitor, path, referrer, device]),
  )
}

async function report(caller: Parameters<typeof asCaller>[1], from: string, to: string, tz = 'UTC'): Promise<Report> {
  return asCaller(db, caller, () =>
    scalar<Report>(db, 'select public.analytics_report($1, $2, $3)', [from, to, tz]),
  )
}

/** A range around now, for tests that do not care about the boundaries. */
const FROM = new Date(Date.now() - 30 * 86_400_000).toISOString()
const TO = new Date(Date.now() + 86_400_000).toISOString()

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
  await db.exec('delete from public.analytics_page_views; delete from public.analytics_sessions; delete from public.analytics_visitors;')
})

describe('migration is additive', () => {
  it('leaves the profiles policies exactly as migration 20260724120000 set them', async () => {
    const r = await db.query<{ policyname: string; cmd: string }>(
      `select policyname, cmd from pg_policies where schemaname = 'public' and tablename = 'profiles' order by policyname`,
    )
    expect(r.rows).toEqual([
      { policyname: 'profiles: read own', cmd: 'SELECT' },
      { policyname: 'profiles: update own', cmd: 'UPDATE' },
    ])
  })

  it('gives the analytics tables read-only admin policies and nothing else', async () => {
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

describe('anonymous visitors', () => {
  it('records a visitor, a session and a page view with no user attached', async () => {
    const sid = await track({ role: 'anon' }, V1, '/')
    expect(sid).toMatch(/^[0-9a-f-]{36}$/)
    expect(await scalar<number>(db, 'select count(*)::int from public.analytics_visitors')).toBe(1)
    const s = await db.query<{ visitor_id: string; user_id: string | null; landing_page: string; exit_page: string; page_views: number }>(
      'select visitor_id, user_id, landing_page, exit_page, page_views from public.analytics_sessions',
    )
    expect(s.rows).toEqual([{ visitor_id: V1, user_id: null, landing_page: '/', exit_page: '/', page_views: 1 }])
    expect(await scalar<number>(db, 'select count(*)::int from public.analytics_page_views')).toBe(1)
  })

  it('counts five pages from one visitor as five views, one session, one visitor', async () => {
    const paths = ['/', '/learn', '/learn/hi-lo-system', '/strategy-chart', '/login']
    const ids = new Set<string>()
    for (const p of paths) ids.add(await track({ role: 'anon' }, V1, p))
    expect(ids.size).toBe(1)

    const r = await report({ role: 'authenticated', sub: adminId }, FROM, TO)
    expect(r.page_views).toBe(5)
    expect(r.sessions).toBe(1)
    expect(r.visitors).toBe(1)
    const s = await db.query<{ landing_page: string; exit_page: string; page_views: number }>(
      'select landing_page, exit_page, page_views from public.analytics_sessions',
    )
    expect(s.rows[0]).toEqual({ landing_page: '/', exit_page: '/login', page_views: 5 })
  })

  it('counts two visitors as two', async () => {
    await track({ role: 'anon' }, V1, '/')
    await track({ role: 'anon' }, V2, '/')
    await track({ role: 'anon' }, V2, '/learn')
    const r = await report({ role: 'authenticated', sub: adminId }, FROM, TO)
    expect(r.visitors).toBe(2)
    expect(r.sessions).toBe(2)
    expect(r.page_views).toBe(3)
  })

  it('keeps the referrer host and device from the first page view of the session only', async () => {
    await track({ role: 'anon' }, V1, '/', '  WWW.Google.com ', 'mobile')
    await track({ role: 'anon' }, V1, '/learn', 'bing.com', 'desktop')
    const s = await db.query<{ referrer_host: string; device: string }>(
      'select referrer_host, device from public.analytics_sessions',
    )
    expect(s.rows).toEqual([{ referrer_host: 'www.google.com', device: 'mobile' }])
  })
})

describe('sessions', () => {
  it('starts a new session after 30 minutes of inactivity', async () => {
    const first = await track({ role: 'anon' }, V1, '/')
    await db.query(`update public.analytics_sessions set last_activity_at = now() - interval '31 minutes'`)
    const second = await track({ role: 'anon' }, V1, '/learn')
    expect(second).not.toBe(first)
    expect(await scalar<number>(db, 'select count(*)::int from public.analytics_sessions')).toBe(2)
  })

  it('continues the session at 29 minutes of inactivity', async () => {
    const first = await track({ role: 'anon' }, V1, '/')
    await db.query(`update public.analytics_sessions set last_activity_at = now() - interval '29 minutes'`)
    const second = await track({ role: 'anon' }, V1, '/learn')
    expect(second).toBe(first)
  })

  it('a ping extends the current session and never starts one', async () => {
    await asCaller(db, { role: 'anon' }, () => db.query('select public.analytics_ping($1)', [V2]))
    expect(await scalar<number>(db, 'select count(*)::int from public.analytics_sessions')).toBe(0)

    await track({ role: 'anon' }, V1, '/')
    await db.query(`update public.analytics_sessions set last_activity_at = now() - interval '5 minutes'`)
    await asCaller(db, { role: 'anon' }, () => db.query('select public.analytics_ping($1)', [V1]))
    const age = await scalar<number>(db, 'select extract(epoch from now() - last_activity_at)::int from public.analytics_sessions')
    expect(age).toBeLessThan(5)
  })

  it('averages the duration over the sessions in the range', async () => {
    // Three visitors: 1:30, 2:00, 3:24 → mean 138 s
    await track({ role: 'anon' }, V1, '/')
    await track({ role: 'anon' }, V2, '/')
    await track({ role: 'anon' }, '33333333-3333-3333-3333-333333333333', '/')
    await db.query(`update public.analytics_sessions set started_at = last_activity_at - interval '90 seconds' where visitor_id = $1`, [V1])
    await db.query(`update public.analytics_sessions set started_at = last_activity_at - interval '120 seconds' where visitor_id = $1`, [V2])
    await db.query(`update public.analytics_sessions set started_at = last_activity_at - interval '204 seconds' where visitor_id = $1`, ['33333333-3333-3333-3333-333333333333'])
    const r = await report({ role: 'authenticated', sub: adminId }, FROM, TO)
    expect(r.avg_session_seconds).toBe(138)
  })

  it('reports null, not zero, for the average when there are no sessions', async () => {
    const r = await report({ role: 'authenticated', sub: adminId }, FROM, TO)
    expect(r.avg_session_seconds).toBeNull()
    expect(r.visitors).toBe(0)
    expect(r.page_views).toBe(0)
  })
})

describe('signed-in visitors', () => {
  it('attaches the user from the JWT, never from the client', async () => {
    await track({ role: 'authenticated', sub: userId }, V1, '/app')
    const s = await db.query<{ user_id: string }>('select user_id from public.analytics_sessions')
    expect(s.rows[0].user_id).toBe(userId)
    const pv = await db.query<{ user_id: string }>('select user_id from public.analytics_page_views')
    expect(pv.rows[0].user_id).toBe(userId)
  })

  it('links an anonymous session to the user who signs in during it', async () => {
    const sid = await track({ role: 'anon' }, V1, '/login')
    const same = await track({ role: 'authenticated', sub: userId }, V1, '/app')
    expect(same).toBe(sid)
    const s = await db.query<{ user_id: string }>('select user_id from public.analytics_sessions')
    expect(s.rows[0].user_id).toBe(userId)
  })

  it('unlinks, rather than deletes, the sessions of a deleted account', async () => {
    const gone = await createUser(db, 'leaving@example.com')
    await track({ role: 'authenticated', sub: gone }, V1, '/app')
    await db.query('delete from auth.users where id = $1', [gone])
    const s = await db.query<{ user_id: string | null }>('select user_id from public.analytics_sessions')
    expect(s.rows).toEqual([{ user_id: null }])
    expect(await scalar<number>(db, 'select count(*)::int from public.analytics_page_views')).toBe(1)
  })
})

describe('registrations and paying customers', () => {
  it('counts profiles created in the range and active subscriptions now', async () => {
    // The signup trigger stamps the profile with now(); in production that is
    // the same instant as the auth row. Here the dates are moved by hand.
    for (const [email, at] of [['a@example.com', '2026-03-10T10:00:00Z'], ['b@example.com', '2026-03-12T10:00:00Z'], ['c@example.com', '2026-04-01T10:00:00Z']]) {
      const id = await createUser(db, email, at)
      await db.query('update public.profiles set created_at = $2 where id = $1', [id, at])
    }
    // Profiles are created by the signup trigger; the entitlement can only be
    // written by service_role, exactly as the webhook does it.
    await asCaller(db, { role: 'service_role' }, () =>
      db.query(`update public.profiles set subscription_status = 'active' where id in (select id from auth.users where email in ('a@example.com', 'c@example.com'))`),
    )
    await asCaller(db, { role: 'service_role' }, () =>
      db.query(`update public.profiles set subscription_status = 'past_due' where id = (select id from auth.users where email = 'b@example.com')`),
    )

    const march = await report({ role: 'authenticated', sub: adminId }, '2026-03-01T00:00:00Z', '2026-04-01T00:00:00Z')
    expect(march.registrations).toBe(2)
    expect(march.paying_customers).toBe(2)

    const april = await report({ role: 'authenticated', sub: adminId }, '2026-04-01T00:00:00Z', '2026-05-01T00:00:00Z')
    expect(april.registrations).toBe(1)
    expect(april.paying_customers).toBe(2)

    // Clean up so later counts are not shifted.
    await db.query(`delete from auth.users where email in ('a@example.com', 'b@example.com', 'c@example.com')`)
  })
})

describe('access control', () => {
  it('refuses the report to a signed-in user who is not an admin', async () => {
    await expect(report({ role: 'authenticated', sub: userId }, FROM, TO)).rejects.toThrow(/forbidden/)
  })

  it('refuses the report to anonymous callers before the function runs', async () => {
    await expect(report({ role: 'anon' }, FROM, TO)).rejects.toThrow(/permission denied/)
  })

  it('shows a normal user no analytics rows, and the admin all of them', async () => {
    await track({ role: 'anon' }, V1, '/')
    await track({ role: 'anon' }, V2, '/')
    const asUser = await asCaller(db, { role: 'authenticated', sub: userId }, () =>
      scalar<number>(db, 'select count(*)::int from public.analytics_sessions'))
    const asAnon = await asCaller(db, { role: 'anon' }, () =>
      scalar<number>(db, 'select count(*)::int from public.analytics_page_views'))
    const asAdmin = await asCaller(db, { role: 'authenticated', sub: adminId }, () =>
      scalar<number>(db, 'select count(*)::int from public.analytics_sessions'))
    expect(asUser).toBe(0)
    expect(asAnon).toBe(0)
    expect(asAdmin).toBe(2)
  })

  it('lets nobody write the tables or the admin list directly', async () => {
    await expect(asCaller(db, { role: 'authenticated', sub: userId }, () =>
      db.query('insert into public.app_admins (user_id) values ($1)', [userId]))).rejects.toThrow(/permission denied|policy/)
    await expect(asCaller(db, { role: 'anon' }, () =>
      db.query(`insert into public.analytics_visitors (id) values ($1)`, [V1]))).rejects.toThrow(/permission denied|policy/)
    await expect(asCaller(db, { role: 'authenticated', sub: adminId }, () =>
      db.query(`delete from public.analytics_sessions`))).rejects.toThrow(/permission denied|policy/)
  })

  it('a user can read only their own admin row', async () => {
    const mine = await asCaller(db, { role: 'authenticated', sub: adminId }, () =>
      scalar<number>(db, 'select count(*)::int from public.app_admins'))
    const theirs = await asCaller(db, { role: 'authenticated', sub: userId }, () =>
      scalar<number>(db, 'select count(*)::int from public.app_admins'))
    expect(mine).toBe(1)
    expect(theirs).toBe(0)
  })

  it('does not let a client call the purge', async () => {
    await expect(asCaller(db, { role: 'authenticated', sub: adminId }, () =>
      db.query('select public.analytics_purge()'))).rejects.toThrow(/permission denied/)
  })
})

describe('input validation', () => {
  it('rejects a pathname that is not an absolute path', async () => {
    await expect(track({ role: 'anon' }, V1, 'learn')).rejects.toThrow(/invalid pathname/)
    await expect(track({ role: 'anon' }, V1, '/a b')).rejects.toThrow(/invalid pathname/)
    await expect(track({ role: 'anon' }, V1, '/' + 'x'.repeat(200))).rejects.toThrow(/invalid pathname/)
  })

  it('rejects an unknown device word', async () => {
    await expect(track({ role: 'anon' }, V1, '/', null, 'phone')).rejects.toThrow(/invalid device/)
  })

  it('truncates the referrer host to 100 characters', async () => {
    await track({ role: 'anon' }, V1, '/', 'h'.repeat(150))
    const len = await scalar<number>(db, 'select length(referrer_host) from public.analytics_sessions')
    expect(len).toBe(100)
  })

  it('rejects an empty or inverted range and one longer than 400 days', async () => {
    await expect(report({ role: 'authenticated', sub: adminId }, TO, FROM)).rejects.toThrow(/invalid range/)
    await expect(report({ role: 'authenticated', sub: adminId }, FROM, TO)).resolves.toBeTruthy()
    await expect(report({ role: 'authenticated', sub: adminId }, '2026-01-01T00:00:00Z', '2027-06-01T00:00:00Z')).rejects.toThrow(/range too long/)
  })
})

describe('the report', () => {
  it('buckets days in the caller’s time zone', async () => {
    await track({ role: 'anon' }, V1, '/')
    // 23:30 UTC on 10 March is already 11 March in Zurich.
    await db.query(`update public.analytics_page_views set viewed_at = '2026-03-10T23:30:00Z'`)
    await db.query(`update public.analytics_sessions set started_at = '2026-03-10T23:30:00Z', last_activity_at = '2026-03-10T23:30:00Z'`)

    const utc = await report({ role: 'authenticated', sub: adminId }, '2026-03-10T00:00:00Z', '2026-03-12T00:00:00Z', 'UTC')
    expect(utc.daily.map(d => [d.day, d.page_views])).toEqual([['2026-03-10', 1], ['2026-03-11', 0]])

    const zurich = await report({ role: 'authenticated', sub: adminId }, '2026-03-09T23:00:00Z', '2026-03-11T23:00:00Z', 'Europe/Zurich')
    expect(zurich.daily.map(d => [d.day, d.page_views, d.sessions])).toEqual([['2026-03-10', 0, 0], ['2026-03-11', 1, 1]])
  })

  it('falls back to UTC for a time zone it does not know', async () => {
    const r = await report({ role: 'authenticated', sub: adminId }, '2026-03-10T00:00:00Z', '2026-03-11T00:00:00Z', 'Mars/Olympus')
    expect(r.daily.map(d => d.day)).toEqual(['2026-03-10'])
  })

  it('lists top pages, referrers and devices', async () => {
    await track({ role: 'anon' }, V1, '/', 'google.com', 'mobile')
    await track({ role: 'anon' }, V1, '/learn')
    await track({ role: 'anon' }, V2, '/learn', null, 'desktop')
    const r = await report({ role: 'authenticated', sub: adminId }, FROM, TO)
    expect(r.top_pages).toEqual([
      { pathname: '/learn', views: 2, visitors: 2 },
      { pathname: '/', views: 1, visitors: 1 },
    ])
    // Ties break on host; a direct visit (null) sorts last.
    expect(r.referrers).toEqual([
      { host: 'google.com', sessions: 1 },
      { host: null, sessions: 1 },
    ])
    expect(r.devices).toEqual([
      { device: 'desktop', sessions: 1 },
      { device: 'mobile', sessions: 1 },
    ])
  })
})

describe('retention', () => {
  it('purges rows older than the retention period and keeps the rest', async () => {
    await track({ role: 'anon' }, V1, '/')
    await track({ role: 'anon' }, V2, '/')
    await db.query(`update public.analytics_sessions set started_at = now() - interval '14 months', last_activity_at = now() - interval '14 months' where visitor_id = $1`, [V1])
    await db.query(`update public.analytics_page_views set viewed_at = now() - interval '14 months' where visitor_id = $1`, [V1])
    await db.query(`update public.analytics_visitors set last_seen_at = now() - interval '14 months' where id = $1`, [V1])

    const r = await db.query<{ page_views: number; sessions: number; visitors: number }>('select * from public.analytics_purge()')
    expect(r.rows[0]).toEqual({ page_views: 1, sessions: 1, visitors: 1 })
    expect(await scalar<number>(db, 'select count(*)::int from public.analytics_sessions')).toBe(1)
    expect(await scalar<number>(db, 'select count(*)::int from public.analytics_visitors')).toBe(1)
  })

  it('is not scheduled by the migration', async () => {
    const cron = await scalar<boolean>(db, `select exists (select 1 from pg_extension where extname = 'pg_cron')`)
    expect(cron).toBe(false)
  })
})
