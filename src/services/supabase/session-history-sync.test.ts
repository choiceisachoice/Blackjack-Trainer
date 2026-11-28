import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

/**
 * How the training history travels between this device and the cloud once it
 * is large, or changed somewhere else.
 *
 *  - The push sends what the cloud has not confirmed, not the whole device
 *    copy on every page load.
 *  - The history is read in pages: PostgREST cuts an answer at `max_rows`
 *    (1000) without saying so.
 *  - `loadStats` reads it once.
 *  - A reset on another device sticks: a confirmed session the cloud no
 *    longer has is dropped here, never one still waiting.
 *
 * The stats store, the storage facade, the Supabase storage service, the
 * pending list and the push run for real. The Supabase client is a stand-in:
 * a table in a Map that answers a ranged, ordered read the way PostgREST does
 * — and an unranged one cut at 1000 rows, as the real server would.
 */

type Row = { id: string; user_id: string; started_at: string } & Record<string, unknown>

const cloud = vi.hoisted(() => ({
  rows: new Map<string, { id: string; user_id: string; started_at: string } & Record<string, unknown>>(),
  mode: 'ok' as 'ok' | 'error',
  /** 'hold': a read answers later, with what the table held when it was asked. */
  readMode: 'ok' as 'ok' | 'hold',
  heldReads: [] as Array<() => void>,
  /** Every page requested, as [from, to]; an unranged read is [0, -1]. */
  reads: [] as Array<[number, number]>,
  upserts: [] as string[][],
  userId: 'user-1',
  /** Whether supabase-js has a session (the auth store may still say signed in). */
  hasSession: true,
}))

vi.mock('./client', () => {
  /** What PostgREST answers without a range: the first `max_rows`. */
  const MAX_ROWS = 1000
  const sorted = () => [...cloud.rows.values()]
    .filter(r => r.user_id === cloud.userId)
    .sort((a, b) => (a.started_at === b.started_at
      ? (a.id < b.id ? 1 : -1)
      : (a.started_at < b.started_at ? 1 : -1)))
  const answer = (from: number, to: number) => {
    cloud.reads.push([from, to])
    const snapshot = sorted().slice(from, Math.min(to + 1, from + MAX_ROWS))
    if (cloud.readMode === 'hold') {
      return new Promise(resolve => { cloud.heldReads.push(() => resolve({ data: snapshot, error: null })) })
    }
    return Promise.resolve({ data: snapshot, error: null })
  }
  const upsert = (payload: Row | Row[]) => {
    const rows = Array.isArray(payload) ? payload : [payload]
    cloud.upserts.push(rows.map(r => r.id))
    if (cloud.mode === 'error') return Promise.resolve({ error: { message: 'FetchError: 503' } })
    rows.forEach(r => cloud.rows.set(r.id, r))
    return Promise.resolve({ error: null })
  }
  const anything = (): unknown => new Proxy(() => {}, {
    get: (_t, key) => key === 'then'
      ? (res: (v: unknown) => unknown) => Promise.resolve({ data: null, error: null }).then(res)
      : () => anything(),
  })
  const select = () => {
    const q = {
      eq: () => q,
      order: () => q,
      range: (from: number, to: number) => answer(from, to),
      // Awaited without a range: cut at max_rows, as the real server does.
      then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
        answer(0, MAX_ROWS - 1).then(res, rej),
    }
    return q
  }
  const from = (table: string) => table === 'training_sessions'
    ? { upsert, select, delete: () => ({ eq: async () => { cloud.rows.clear(); return { error: null } } }) }
    : anything()
  return {
    isSupabaseConfigured: true,
    supabase: null,
    requireSupabase: () => ({
      from,
      auth: { getSession: async () => ({ data: { session: cloud.hasSession ? { user: { id: cloud.userId } } : null } }) },
    }),
  }
})

vi.mock('../../store/auth-store', () => ({
  useAuthStore: Object.assign(
    () => 'signedIn',
    { getState: () => ({ status: 'signedIn', user: { id: cloud.userId } }), setState: vi.fn() },
  ),
  isSupabaseConfigured: true,
}))

vi.mock('./profiles-sync', () => ({
  pushProfileScalars: vi.fn(),
  pushProfileScalarsNow: vi.fn(async () => {}),
  syncProfileOnSignIn: vi.fn(async () => {}),
  resetProfileSync: vi.fn(),
}))
vi.mock('./achievements-sync', () => ({
  syncAchievementsOnSignIn: vi.fn(async () => {}),
  pushNewUnlocks: vi.fn(),
  clearCloudAchievements: vi.fn(async () => {}),
}))

import { useStatsStore } from '../../store/stats-store'
import { localStorageService, getSyncedSessionIds } from '../storage/storage-service'
import { markSessionPending, resetPendingSessions, getPendingSessionIds } from '../storage/pending-sessions'
import { setLocalOwner } from '../storage/local-owner'
import { handleSignedIn, pushLocalSessions } from './cloud-sync'
import type { TrainingSessionResult } from '../stats-types'
import { CountingSystemId } from '../../engine/counting/types'

async function settle() {
  for (let i = 0; i < 12; i++) await Promise.resolve()
}

function session(id: string = crypto.randomUUID(), timestamp = '2026-11-20T10:00:00.000Z'): TrainingSessionResult {
  return {
    id,
    mode: 'speedDrill',
    timestamp,
    countingSystem: CountingSystemId.HiLo,
    durationSeconds: 90,
    totalQuestions: 20,
    correctAnswers: 18,
    accuracy: 0.9,
    bestStreak: 9,
    details: { type: 'speedDrill', cardsPerRound: 20, speedMs: 900, rcErrors: [0] },
  }
}

/** A row the cloud holds for user-1, `i` minutes after a fixed start. */
function cloudRow(i: number): Row {
  const id = crypto.randomUUID()
  return {
    id, user_id: 'user-1', started_at: new Date(Date.UTC(2026, 0, 1) + i * 60_000).toISOString(),
    mode: 'speedDrill', counting_system: 'hi-lo', duration_seconds: 60, total_questions: 10,
    correct_answers: 9, accuracy: 0.9, best_streak: 4, details: { type: 'speedDrill' },
  }
}

async function keepOnDevice(...sessions: TrainingSessionResult[]) {
  for (const s of sessions) await localStorageService.saveSessionResult(s)
}

const localIds = async () => (await localStorageService.getAllSessionResults()).map(s => s.id).sort()
const lastUpsert = () => cloud.upserts[cloud.upserts.length - 1]

beforeEach(() => {
  localStorage.clear()
  resetPendingSessions()
  useStatsStore.setState({ sessions: [], lifetimeStats: null, isLoading: false })
  cloud.rows.clear()
  cloud.upserts.length = 0
  cloud.reads.length = 0
  cloud.heldReads.length = 0
  cloud.mode = 'ok'
  cloud.readMode = 'ok'
  cloud.userId = 'user-1'
  cloud.hasSession = true
  setLocalOwner('user-1')
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('the push sends only what the cloud has not confirmed', () => {
  it('sends the device history once, and nothing on the next page load', async () => {
    const held = [session(), session(), session()]
    await keepOnDevice(...held)

    await handleSignedIn()
    expect(cloud.upserts).toHaveLength(1)
    expect([...lastUpsert()].sort()).toEqual(held.map(s => s.id).sort())

    // A reload: the same device, the same sessions, all of them confirmed.
    useStatsStore.setState({ sessions: [], lifetimeStats: null })
    await handleSignedIn()
    expect(cloud.upserts).toHaveLength(1)
    expect(useStatsStore.getState().sessions).toHaveLength(3)
  })

  it('sends a new session on its own, not with the history', async () => {
    const old = [session(), session()]
    await keepOnDevice(...old)
    await pushLocalSessions()

    const fresh = session()
    await keepOnDevice(fresh)
    markSessionPending(fresh.id)
    await expect(pushLocalSessions()).resolves.toBe(1)
    expect(lastUpsert()).toEqual([fresh.id])
    expect(getPendingSessionIds()).toEqual([])
  })

  it('loses nothing to a failed push: everything unconfirmed goes on the next one', async () => {
    const held = [session(), session()]
    await keepOnDevice(...held)
    cloud.mode = 'error'
    await expect(pushLocalSessions()).rejects.toBeTruthy()
    expect(getSyncedSessionIds().size).toBe(0)

    cloud.mode = 'ok'
    await expect(pushLocalSessions()).resolves.toBe(2)
    expect([...cloud.rows.keys()].sort()).toEqual(held.map(s => s.id).sort())
  })

  it('still sends a legacy session once, under a uuid', async () => {
    await keepOnDevice(session('a0'))
    await expect(pushLocalSessions()).resolves.toBe(1)
    const [stored] = await localIds()
    expect(stored).not.toBe('a0')
    expect(cloud.rows.has(stored)).toBe(true)
    await expect(pushLocalSessions()).resolves.toBe(0)
    expect(cloud.upserts).toHaveLength(1)
  })
})

describe('reading the history', () => {
  it('loadStats reads the history once', async () => {
    for (let i = 0; i < 5; i++) { const r = cloudRow(i); cloud.rows.set(r.id, r) }
    await useStatsStore.getState().loadStats()
    expect(useStatsStore.getState().lifetimeStats?.totalSessions).toBe(5)
    expect(cloud.reads).toHaveLength(1)
  })

  it('reads past the first 1000 sessions, in pages', async () => {
    for (let i = 0; i < 2500; i++) { const r = cloudRow(i); cloud.rows.set(r.id, r) }
    await useStatsStore.getState().loadStats()

    const { sessions, lifetimeStats } = useStatsStore.getState()
    expect(sessions).toHaveLength(2500)
    expect(new Set(sessions.map(s => s.id)).size).toBe(2500)
    expect(lifetimeStats?.totalSessions).toBe(2500)
    expect(cloud.reads).toEqual([[0, 999], [1000, 1999], [2000, 2999]])
    // Newest first, the oldest one included.
    expect(sessions[0].timestamp > sessions[2499].timestamp).toBe(true)
  })
})

describe('a history reset on another device', () => {
  it('sticks here: confirmed sessions the cloud no longer has are dropped, not uploaded again', async () => {
    const confirmed = [session(), session()]
    await keepOnDevice(...confirmed)
    await pushLocalSessions()
    // Recorded here and not uploaded yet.
    const waiting = session()
    await keepOnDevice(waiting)
    markSessionPending(waiting.id)

    cloud.rows.clear() // the reset, on device A

    await useStatsStore.getState().loadStats()
    expect(useStatsStore.getState().sessions.map(s => s.id)).toEqual([waiting.id])
    expect(await localIds()).toEqual([waiting.id])

    await expect(pushLocalSessions()).resolves.toBe(1)
    expect(lastUpsert()).toEqual([waiting.id])
  })

  it('never drops a session the cloud has not confirmed', async () => {
    // A guest's session whose first push failed: not waiting, not confirmed.
    const unconfirmed = session()
    await keepOnDevice(unconfirmed)

    await useStatsStore.getState().loadStats()
    expect(await localIds()).toEqual([unconfirmed.id])
    expect(useStatsStore.getState().sessions.map(s => s.id)).toEqual([unconfirmed.id])
  })

  it('does not drop a session confirmed while the read was out', async () => {
    cloud.readMode = 'hold'
    const loading = useStatsStore.getState().loadStats()
    await settle()

    // Finished and uploaded after the read left: its answer cannot list it.
    const late = session()
    await keepOnDevice(late)
    markSessionPending(late.id)
    await pushLocalSessions()
    expect(getSyncedSessionIds().has(late.id)).toBe(true)

    cloud.heldReads.forEach(answer => answer())
    await loading
    expect(await localIds()).toEqual([late.id])
    expect(useStatsStore.getState().sessions.map(s => s.id)).toEqual([late.id])
  })

  it('drops nothing when the answer was not for this account (no session to read as)', async () => {
    const confirmed = session()
    await keepOnDevice(confirmed)
    await pushLocalSessions()

    cloud.hasSession = false // the read comes back empty for want of a user
    await useStatsStore.getState().loadStats()
    expect(await localIds()).toEqual([confirmed.id])
  })
})
