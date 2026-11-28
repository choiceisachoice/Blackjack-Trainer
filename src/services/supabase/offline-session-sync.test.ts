import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

/**
 * What happens to a finished session when the network is not there.
 *
 * The whole path runs for real — the stats store, the storage facade, the
 * Supabase storage service, the pending list and the reconnect sync. Only the
 * Supabase client is a stand-in: a table held in a Map, keyed by id the way the
 * real one is (`upsert … on conflict (id)`), that can be told to answer with an
 * error, to throw, or never to answer at all.
 *
 * What this cannot show: that the real Supabase behaves like the stand-in.
 */

type Row = { id: string; user_id: string; started_at: string } & Record<string, unknown>
type CloudMode = 'ok' | 'error' | 'throw' | 'hang'
/** A read can also be held: answered later, with what the table held when it was asked. */
type ReadMode = CloudMode | 'hold'

const cloud = vi.hoisted(() => ({
  rows: new Map<string, { id: string } & Record<string, unknown>>(),
  mode: 'ok' as 'ok' | 'error' | 'throw' | 'hang',
  readMode: 'ok' as 'ok' | 'error' | 'throw' | 'hang' | 'hold',
  /** Reads being held; calling one lets it answer with its old snapshot. */
  heldReads: [] as Array<() => void>,
  /** Who is signed in — in the auth store and in the Supabase session alike. */
  userId: 'user-1',
  /** Every upsert that reached "the network", as the list of ids it carried. */
  upserts: [] as string[][],
  /** Requests left hanging; a test can let them arrive late. */
  hanging: [] as Array<() => void>,
  signedIn: true,
  status: 'signedIn' as string,
}))

vi.mock('./client', () => {
  const upsert = (payload: Row | Row[]) => {
    const rows = Array.isArray(payload) ? payload : [payload]
    cloud.upserts.push(rows.map(r => r.id))
    const land = () => { rows.forEach(r => cloud.rows.set(r.id, r)); return { error: null } }
    const mode: CloudMode = cloud.mode
    if (mode === 'hang') return new Promise(resolve => { cloud.hanging.push(() => resolve(land())) })
    if (mode === 'throw') return Promise.reject(new TypeError('Failed to fetch'))
    if (mode === 'error') return Promise.resolve({ error: { message: 'FetchError: 503' } })
    return Promise.resolve(land())
  }
  const read = () => {
    const mode: ReadMode = cloud.readMode
    if (mode === 'hang') return new Promise(() => {})
    if (mode === 'hold') {
      const snapshot = [...cloud.rows.values()]
      return new Promise(resolve => { cloud.heldReads.push(() => resolve({ data: snapshot, error: null })) })
    }
    if (mode === 'throw') return Promise.reject(new TypeError('Failed to fetch'))
    if (mode === 'error') return Promise.resolve({ data: null, error: { message: 'FetchError: 503' } })
    return Promise.resolve({ data: [...cloud.rows.values()], error: null })
  }
  // Any other table, any other chain: answers "nothing there", so the parts of
  // the sign-in merge this file is not about run through without a fake each.
  const anything = (): unknown => new Proxy(() => {}, {
    get: (_t, key) => key === 'then'
      ? (res: (v: unknown) => unknown) => Promise.resolve({ data: null, error: null }).then(res)
      : () => anything(),
  })
  const from = (table: string) => table === 'training_sessions'
    ? {
        upsert,
        // The paged read: `.eq().order().order().range(from, to)`.
        select: () => {
          const q = {
            eq: () => q,
            order: () => q,
            range: (from: number, to: number) => (read() as Promise<{ data: unknown[] | null; error: unknown }>)
              .then(r => (r.data ? { ...r, data: r.data.slice(from, to + 1) } : r)),
          }
          return q
        },
        delete: () => ({ eq: async () => { cloud.rows.clear(); return { error: null } } }),
      }
    : anything()
  return {
    isSupabaseConfigured: true,
    supabase: null,
    requireSupabase: () => ({
      from,
      auth: { getSession: async () => ({ data: { session: cloud.signedIn ? { user: { id: cloud.userId } } : null } }) },
    }),
  }
})

vi.mock('../../store/auth-store', () => ({
  useAuthStore: Object.assign(
    () => cloud.status,
    { getState: () => ({ status: cloud.status, user: { id: cloud.userId } }), setState: vi.fn() },
  ),
  isSupabaseConfigured: true,
}))

// The level and the achievements have their own cloud writes and their own
// tests; here they only have to be called.
const pushProfileScalars = vi.hoisted(() => vi.fn())
const syncProfileOnSignIn = vi.hoisted(() => vi.fn(async () => {}))
const syncAchievementsOnSignIn = vi.hoisted(() => vi.fn(async () => {}))
vi.mock('./profiles-sync', () => ({
  pushProfileScalars,
  pushProfileScalarsNow: vi.fn(async () => {}),
  syncProfileOnSignIn,
  resetProfileSync: vi.fn(),
}))
vi.mock('./achievements-sync', () => ({
  syncAchievementsOnSignIn,
  pushNewUnlocks: vi.fn(),
  clearCloudAchievements: vi.fn(async () => {}),
}))

import { useStatsStore } from '../../store/stats-store'
import { useLevelStore } from '../../store/level-store'
import { levelSystem } from '../level-system'
import {
  storage, localStorageService, CLOUD_SAVE_TIMEOUT_MS, CLOUD_READ_TIMEOUT_MS,
} from '../storage/storage-service'
import {
  getPendingSessionIds, getPendingSnapshot, markSessionPending, resetPendingSessions,
} from '../storage/pending-sessions'
import { setLocalOwner, getLocalOwner, LOCAL_OWNER_KEY } from '../storage/local-owner'
import { SupabaseStorageService } from './supabase-storage'
import {
  handleSignedIn, pushLocalSessions, signOutAndClearLocal, UPLOAD_RETRY_MIN_MS, SIGN_IN_STEP_TIMEOUT_MS,
} from './cloud-sync'
import { useCloudSyncStore } from '../../store/cloud-sync-store'
import type { TrainingSessionResult } from '../stats-types'
import { CountingSystemId } from '../../engine/counting/types'

function setBrowserOnline(online: boolean, announce = true) {
  Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => online })
  if (announce) window.dispatchEvent(new Event(online ? 'online' : 'offline'))
}

/** Let every promise that is already resolvable run to its end. */
async function settle() {
  for (let i = 0; i < 12; i++) await Promise.resolve()
}

function finishDrill() {
  return useStatsStore.getState().recordSession({
    mode: 'speedDrill',
    startTime: Date.now() - 90_000,
    totalQuestions: 20,
    correctAnswers: 18,
    bestStreak: 9,
    details: { type: 'speedDrill', cardsPerRound: 20, speedMs: 900, rcErrors: [0, 0, 1] },
    countingSystem: CountingSystemId.HiLo,
  })
}

function storedSession(id = crypto.randomUUID()): TrainingSessionResult {
  return {
    id,
    mode: 'speedDrill',
    timestamp: '2026-11-20T10:00:00.000Z',
    countingSystem: CountingSystemId.HiLo,
    durationSeconds: 90,
    totalQuestions: 20,
    correctAnswers: 18,
    accuracy: 0.9,
    bestStreak: 9,
    details: { type: 'speedDrill', cardsPerRound: 20, speedMs: 900, rcErrors: [0] },
  }
}

const localIds = async () => (await localStorageService.getAllSessionResults()).map(s => s.id)
/** How many upserts carried this session. */
const sendsOf = (id: string) => cloud.upserts.filter(ids => ids.includes(id)).length

beforeEach(() => {
  localStorage.clear()
  resetPendingSessions()
  levelSystem.reload()
  useLevelStore.getState().refresh()
  useStatsStore.setState({ sessions: [], lifetimeStats: null, isLoading: false })
  cloud.rows.clear()
  cloud.upserts.length = 0
  cloud.hanging.length = 0
  cloud.heldReads.length = 0
  cloud.userId = 'user-1'
  syncProfileOnSignIn.mockReset()
  syncProfileOnSignIn.mockResolvedValue(undefined)
  syncAchievementsOnSignIn.mockReset()
  syncAchievementsOnSignIn.mockResolvedValue(undefined)
  useCloudSyncStore.setState({ status: 'idle' })
  cloud.mode = 'ok'
  cloud.readMode = 'ok'
  cloud.signedIn = true
  cloud.status = 'signedIn'
  pushProfileScalars.mockClear()
  setBrowserOnline(true, false)
  setLocalOwner('user-1')
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  setBrowserOnline(true, false)
})

describe('a session finished while the cloud is reachable', () => {
  it('is in the cloud and nothing is left waiting', async () => {
    await finishDrill()
    await settle()

    const [session] = useStatsStore.getState().sessions
    expect(cloud.rows.has(session.id)).toBe(true)
    expect(getPendingSnapshot()).toEqual({ count: 0, failed: false })
  })
})

describe.each([
  ['answers with an error', 'error'],
  ['throws (no network)', 'throw'],
] as const)('a session finished while Supabase %s', (_label, mode) => {
  beforeEach(() => { cloud.mode = mode })

  it('counts at once: the session is in the history and the XP is credited', async () => {
    const xpBefore = useLevelStore.getState().totalXP
    await finishDrill()

    expect(useStatsStore.getState().sessions).toHaveLength(1)
    expect(useStatsStore.getState().lifetimeStats?.totalSessions).toBe(1)
    expect(useLevelStore.getState().totalXP).toBeGreaterThan(xpBefore)
  })

  it('is kept on the device and marked as waiting for upload', async () => {
    await finishDrill()
    await settle()

    const [session] = useStatsStore.getState().sessions
    expect(await localIds()).toEqual([session.id])
    expect(cloud.rows.size).toBe(0)
    expect(getPendingSessionIds()).toEqual([session.id])
    // This is what the offline notice reads.
    expect(getPendingSnapshot()).toEqual({ count: 1, failed: true })
  })

  it('is uploaded when the browser comes back online — once', async () => {
    await finishDrill()
    await settle()
    const [session] = useStatsStore.getState().sessions

    cloud.mode = 'ok'
    setBrowserOnline(true)
    await settle()

    expect([...cloud.rows.keys()]).toEqual([session.id])
    expect(getPendingSnapshot()).toEqual({ count: 0, failed: false })
    // The level goes up with it: its own push failed along with the session's.
    expect(pushProfileScalars).toHaveBeenCalled()

    // A second "online" has nothing left to send.
    const sends = sendsOf(session.id)
    setBrowserOnline(true)
    await settle()
    expect(sendsOf(session.id)).toBe(sends)
    expect(cloud.rows.size).toBe(1)
  })

  it('is uploaded by the next page load instead, if that comes first', async () => {
    await finishDrill()
    await settle()
    const [session] = useStatsStore.getState().sessions

    // A reload: the stores are empty again, storage is what is left.
    useStatsStore.setState({ sessions: [], lifetimeStats: null })
    cloud.mode = 'ok'
    await handleSignedIn()

    expect([...cloud.rows.keys()]).toEqual([session.id])
    expect(getPendingSnapshot()).toEqual({ count: 0, failed: false })
    // And the history is back, from the cloud, with the session in it once.
    expect(useStatsStore.getState().sessions.map(s => s.id)).toEqual([session.id])
  })

  it('stays in the history when a screen reloads the stats before the upload', async () => {
    cloud.rows.set('older', { id: 'older', user_id: 'user-1', started_at: '2026-11-01T10:00:00.000Z',
      mode: 'speedDrill', counting_system: 'hi-lo', duration_seconds: 60, total_questions: 10,
      correct_answers: 9, accuracy: 0.9, best_streak: 4, details: { type: 'speedDrill' } })
    await finishDrill()
    await settle()
    const [session] = useStatsStore.getState().sessions

    // The analytics page does this on every mount. The cloud's list is the
    // source of truth and does not know the session yet.
    await useStatsStore.getState().loadStats()

    const ids = useStatsStore.getState().sessions.map(s => s.id)
    expect(ids).toContain(session.id)
    expect(ids).toContain('older')
    expect(useStatsStore.getState().lifetimeStats?.totalSessions).toBe(2)
  })
})

describe('a session finished while the request never comes back', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    cloud.mode = 'hang'
  })

  it('does not hold the finish path: rewards are applied and the save returns', async () => {
    const xpBefore = useLevelStore.getState().totalXP
    // Resolves although the request is still open — no timer was advanced.
    await finishDrill()

    expect(cloud.hanging).toHaveLength(1)
    expect(useStatsStore.getState().sessions).toHaveLength(1)
    expect(useLevelStore.getState().totalXP).toBeGreaterThan(xpBefore)
    const [session] = useStatsStore.getState().sessions
    expect(await localIds()).toEqual([session.id])
  })

  it('is on record as waiting from the first moment, so closing the tab loses nothing', async () => {
    await finishDrill()
    const [session] = useStatsStore.getState().sessions
    // In storage, not only in memory.
    expect(JSON.parse(localStorage.getItem('bjt_pending_sessions') ?? '[]')).toEqual([session.id])
    // Merely in flight so far: no notice yet.
    expect(getPendingSnapshot()).toEqual({ count: 1, failed: false })
  })

  it('counts as failed after the timeout, and is then uploaded like any other', async () => {
    await finishDrill()
    const [session] = useStatsStore.getState().sessions

    await vi.advanceTimersByTimeAsync(CLOUD_SAVE_TIMEOUT_MS)
    expect(getPendingSnapshot()).toEqual({ count: 1, failed: true })

    cloud.mode = 'ok'
    setBrowserOnline(true)
    await settle()
    expect([...cloud.rows.keys()]).toEqual([session.id])
    expect(getPendingSnapshot()).toEqual({ count: 0, failed: false })

    // The request that hung arrives after all. Same id, same row.
    cloud.hanging.forEach(arrive => arrive())
    await settle()
    expect(cloud.rows.size).toBe(1)
    expect(getPendingSnapshot()).toEqual({ count: 0, failed: false })
  })
})

describe('a session finished while the browser says it is offline', () => {
  beforeEach(() => setBrowserOnline(false))

  it('makes no request, keeps the session and marks it as waiting', async () => {
    await finishDrill()
    await settle()

    const [session] = useStatsStore.getState().sessions
    expect(cloud.upserts).toHaveLength(0)
    expect(await localIds()).toEqual([session.id])
    expect(getPendingSnapshot()).toEqual({ count: 1, failed: true })
  })

  it('uploads every session finished offline in one push when the connection returns', async () => {
    await finishDrill()
    await finishDrill()
    await finishDrill()
    await settle()
    const ids = useStatsStore.getState().sessions.map(s => s.id).sort()

    setBrowserOnline(true)
    await settle()

    expect([...cloud.rows.keys()].sort()).toEqual(ids)
    expect(cloud.upserts).toHaveLength(1)
    expect(getPendingSnapshot()).toEqual({ count: 0, failed: false })
  })

  it('does not try while still offline, whatever else wakes it', async () => {
    await finishDrill()
    await settle()
    document.dispatchEvent(new Event('visibilitychange'))
    await settle()
    expect(cloud.upserts).toHaveLength(0)
  })
})

describe('retrying when "online" never fires', () => {
  it('tries again by itself after a failed upload, and stops once it has arrived', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    cloud.mode = 'error'
    await finishDrill()
    await settle()
    const [session] = useStatsStore.getState().sessions
    expect(sendsOf(session.id)).toBe(1)

    // Supabase is back; the browser was "online" throughout and says nothing.
    cloud.mode = 'ok'
    await vi.advanceTimersByTimeAsync(UPLOAD_RETRY_MIN_MS)
    await settle()

    expect([...cloud.rows.keys()]).toEqual([session.id])
    expect(sendsOf(session.id)).toBe(2)
    expect(getPendingSnapshot()).toEqual({ count: 0, failed: false })

    // Nothing is sent again, however long the tab stays open.
    await vi.advanceTimersByTimeAsync(60 * 60_000)
    expect(sendsOf(session.id)).toBe(2)
  })

  it('tries again when the tab comes back to the front', async () => {
    cloud.mode = 'error'
    await finishDrill()
    await settle()
    const [session] = useStatsStore.getState().sessions

    cloud.mode = 'ok'
    document.dispatchEvent(new Event('visibilitychange'))
    await settle()
    expect(cloud.rows.has(session.id)).toBe(true)
  })
})

describe('the push itself', () => {
  it('is joined, not doubled, when two triggers arrive together', async () => {
    const session = storedSession()
    await localStorageService.saveSessionResult(session)
    markSessionPending(session.id)

    await Promise.all([pushLocalSessions(), pushLocalSessions()])
    expect(sendsOf(session.id)).toBe(1)
  })

  it('does not confirm a session that was finished while the push was in flight', async () => {
    const first = storedSession()
    await localStorageService.saveSessionResult(first)
    markSessionPending(first.id)
    cloud.mode = 'hang'
    const push = pushLocalSessions()
    await settle()

    // Finished after the batch was read: not in it.
    const late = storedSession()
    await localStorageService.saveSessionResult(late)
    markSessionPending(late.id)

    cloud.hanging.forEach(arrive => arrive())
    await push
    expect(getPendingSessionIds()).toEqual([late.id])
  })

  it('reports a failure and leaves everything waiting', async () => {
    const session = storedSession()
    await localStorageService.saveSessionResult(session)
    markSessionPending(session.id)
    cloud.mode = 'error'

    await expect(pushLocalSessions()).rejects.toBeTruthy()
    expect(getPendingSnapshot()).toEqual({ count: 1, failed: true })
    expect(await localIds()).toEqual([session.id])
  })

  it('does not run for someone who is signed out', async () => {
    const session = storedSession()
    await localStorageService.saveSessionResult(session)
    markSessionPending(session.id)
    cloud.status = 'signedOut'

    setBrowserOnline(true)
    await settle()
    expect(cloud.upserts).toHaveLength(0)
  })

  it('a failed push on page load no longer takes the rest of the sign-in merge with it', async () => {
    const session = storedSession()
    await localStorageService.saveSessionResult(session)
    cloud.mode = 'error'
    cloud.rows.set('older', { id: 'older', user_id: 'user-1', started_at: '2026-11-01T10:00:00.000Z',
      mode: 'speedDrill', counting_system: 'hi-lo', duration_seconds: 60, total_questions: 10,
      correct_answers: 9, accuracy: 0.9, best_streak: 4, details: { type: 'speedDrill' } })

    await handleSignedIn()
    // The history was still hydrated from the cloud.
    expect(useStatsStore.getState().sessions.map(s => s.id)).toContain('older')
  })
})

describe('the cloud write without a session to write as', () => {
  // Offline with an expired token, supabase-js has no session. This used to
  // return quietly, which read as "saved".
  it('throws for a single session', async () => {
    cloud.signedIn = false
    await expect(new SupabaseStorageService().saveSessionResult(storedSession())).rejects.toThrow(/no signed-in session/)
  })

  it('throws for a batch', async () => {
    cloud.signedIn = false
    await expect(new SupabaseStorageService().saveMany([storedSession()])).rejects.toThrow(/no signed-in session/)
  })

  it('leaves the session waiting rather than calling it saved', async () => {
    cloud.signedIn = false
    await finishDrill()
    await settle()
    expect(getPendingSnapshot()).toEqual({ count: 1, failed: true })
  })
})

describe('loading the history when the cloud cannot be read', () => {
  it('gives up on a request that never answers instead of loading forever', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    cloud.readMode = 'hang'
    const loading = useStatsStore.getState().loadStats()
    await settle()
    expect(useStatsStore.getState().isLoading).toBe(true)

    await vi.advanceTimersByTimeAsync(CLOUD_READ_TIMEOUT_MS)
    await loading
    expect(useStatsStore.getState().isLoading).toBe(false)
  })

  it('shows what this device holds when the store is empty', async () => {
    const session = storedSession()
    await localStorageService.saveSessionResult(session)
    cloud.readMode = 'throw'

    await useStatsStore.getState().loadStats()
    expect(useStatsStore.getState().sessions.map(s => s.id)).toEqual([session.id])
    expect(useStatsStore.getState().lifetimeStats?.totalSessions).toBe(1)
  })

  it('keeps a history that is already loaded rather than swapping it for the device copy', async () => {
    const loaded = [storedSession(), storedSession()]
    useStatsStore.setState({ sessions: loaded })
    await localStorageService.saveSessionResult(storedSession())
    cloud.readMode = 'error'

    await useStatsStore.getState().loadStats()
    expect(useStatsStore.getState().sessions).toBe(loaded)
  })

  it('shows nothing from a device whose local data belongs to someone else', async () => {
    await localStorageService.saveSessionResult(storedSession())
    setLocalOwner('somebody-else')
    cloud.readMode = 'throw'

    await useStatsStore.getState().loadStats()
    expect(useStatsStore.getState().sessions).toEqual([])
  })

  it('does not list a waiting session twice once the cloud has it', async () => {
    const session = storedSession()
    await localStorageService.saveSessionResult(session)
    markSessionPending(session.id)
    cloud.rows.set(session.id, { id: session.id, user_id: 'user-1', started_at: session.timestamp,
      mode: 'speedDrill', counting_system: 'hi-lo', duration_seconds: 90, total_questions: 20,
      correct_answers: 18, accuracy: 0.9, best_streak: 9, details: session.details })

    const all = await storage.getAllSessionResults()
    expect(all.filter(s => s.id === session.id)).toHaveLength(1)
  })
})

describe('whose sessions the push sends', () => {
  it('sends nothing from a device whose local data belongs to someone else', async () => {
    // The upsert files every row under the signed-in user. The wipe that
    // makes a shared device this account's runs a moment after sign-in, and
    // "online" or a tab coming to the front do not wait for it.
    const session = storedSession()
    await localStorageService.saveSessionResult(session)
    markSessionPending(session.id)
    setLocalOwner('somebody-else')

    await expect(pushLocalSessions()).resolves.toBe(0)
    setBrowserOnline(true)
    await settle()

    expect(cloud.upserts).toHaveLength(0)
    expect(cloud.rows.size).toBe(0)
    // Not confirmed either: nothing was sent.
    expect(getPendingSessionIds()).toEqual([session.id])
  })

  it('sends nothing from a device nobody has claimed yet', async () => {
    const session = storedSession()
    await localStorageService.saveSessionResult(session)
    localStorage.removeItem(LOCAL_OWNER_KEY)

    await expect(pushLocalSessions()).resolves.toBe(0)
    expect(cloud.upserts).toHaveLength(0)
  })

  it('still moves a guest’s sessions into the first account that signs in', async () => {
    // Owner `null` is guest data. The sign-in merge claims it before it
    // pushes, and that order is what this pins.
    const session = storedSession()
    await localStorageService.saveSessionResult(session)
    localStorage.removeItem(LOCAL_OWNER_KEY)

    await handleSignedIn()

    expect(getLocalOwner()).toBe('user-1')
    expect([...cloud.rows.keys()]).toEqual([session.id])
    expect(cloud.rows.get(session.id)?.user_id).toBe('user-1')
    expect(useStatsStore.getState().sessions.map(s => s.id)).toEqual([session.id])
  })
})

describe('the sign-in merge when a step never answers', () => {
  it.each([
    ['the achievements', syncAchievementsOnSignIn],
    ['the profile', syncProfileOnSignIn],
  ] as const)('gives up on %s after the limit and still loads the history', async (_label, stuck) => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    stuck.mockImplementation(() => new Promise<void>(() => {}))
    cloud.rows.set('older', { id: 'older', user_id: 'user-1', started_at: '2026-11-01T10:00:00.000Z',
      mode: 'speedDrill', counting_system: 'hi-lo', duration_seconds: 60, total_questions: 10,
      correct_answers: 9, accuracy: 0.9, best_streak: 4, details: { type: 'speedDrill' } })

    let finished = false
    const sync = handleSignedIn().then(() => { finished = true })
    await settle()
    expect(finished).toBe(false)
    expect(useCloudSyncStore.getState().status).toBe('syncing')

    await vi.advanceTimersByTimeAsync(SIGN_IN_STEP_TIMEOUT_MS)
    await sync

    // Every screen that waits for the merge is let go, with the history in it.
    expect(useCloudSyncStore.getState().status).toBe('done')
    expect(useStatsStore.getState().sessions.map(s => s.id)).toContain('older')
  })
})

describe('the sign-in merge and a change of account', () => {
  /** Hold the first step of a run open; returns the function that lets it answer. */
  function holdAchievements(): () => void {
    let release = () => {}
    syncAchievementsOnSignIn.mockImplementationOnce(() => new Promise<void>(resolve => { release = resolve }))
    return () => release()
  }

  it('joins a run for the same user', async () => {
    const release = holdAchievements()
    const first = handleSignedIn()
    const second = handleSignedIn()
    expect(second).toBe(first)
    await settle()
    release()
    await first
    expect(syncAchievementsOnSignIn).toHaveBeenCalledTimes(1)
  })

  it('starts a new run for a different user instead of joining the previous one', async () => {
    const releaseA = holdAchievements()
    const runA = handleSignedIn()
    await settle()

    // B signs in on the same page while A's merge is still out.
    cloud.userId = 'user-2'
    const runB = handleSignedIn()
    expect(runB).not.toBe(runA)
    await runB

    // B got a merge of their own, start to finish.
    expect(getLocalOwner()).toBe('user-2')
    expect(syncProfileOnSignIn).toHaveBeenCalledTimes(1)
    expect(useCloudSyncStore.getState().status).toBe('done')

    // A's answer arrives now. A's run stops there: no further step runs for
    // A on a device that is B's.
    releaseA()
    await runA
    expect(syncProfileOnSignIn).toHaveBeenCalledTimes(1)
    expect(getLocalOwner()).toBe('user-2')
  })

  it('a run overtaken by a sign-out writes nothing more and does not report "done"', async () => {
    const releaseA = holdAchievements()
    const runA = handleSignedIn()
    await settle()

    await signOutAndClearLocal()
    expect(useCloudSyncStore.getState().status).toBe('idle')

    releaseA()
    await runA

    expect(syncProfileOnSignIn).not.toHaveBeenCalled()
    // Left at "not started", so the next sign-in waits for its own merge.
    expect(useCloudSyncStore.getState().status).toBe('idle')
    expect(getLocalOwner()).toBeNull()
  })

  it('a sign-in after that sign-out runs its own merge rather than joining the old one', async () => {
    const releaseA = holdAchievements()
    const runA = handleSignedIn()
    await settle()
    await signOutAndClearLocal()

    const again = handleSignedIn()
    expect(again).not.toBe(runA)
    await again
    expect(syncProfileOnSignIn).toHaveBeenCalledTimes(1)
    expect(useCloudSyncStore.getState().status).toBe('done')

    releaseA()
    await runA
    expect(syncProfileOnSignIn).toHaveBeenCalledTimes(1)
  })
})

describe('a history read that is overtaken by an upload', () => {
  it('keeps the session that was confirmed while the read was out', async () => {
    // The read leaves, the session is finished, uploaded and confirmed, and
    // only then does the read come back — with a list from before. Not in
    // the answer and no longer waiting: it used to drop out of the history.
    cloud.readMode = 'hold'
    const loading = useStatsStore.getState().loadStats()
    await settle()
    expect(cloud.heldReads.length).toBeGreaterThan(0)

    cloud.readMode = 'ok'
    await finishDrill()
    await settle()
    const id = useStatsStore.getState().sessions[0].id
    expect(cloud.rows.has(id)).toBe(true)
    expect(getPendingSessionIds()).toEqual([])

    cloud.heldReads.forEach(answer => answer())
    await loading

    expect(useStatsStore.getState().sessions.map(s => s.id)).toContain(id)
    expect(useStatsStore.getState().lifetimeStats?.totalSessions).toBe(1)
  })

  it('does not bring in sessions from a device that belongs to someone else', async () => {
    await localStorageService.saveSessionResult(storedSession())
    setLocalOwner('somebody-else')

    expect(await storage.getAllSessionResults()).toEqual([])
  })
})

describe('deleting the history while signed in', () => {
  it('empties this device too, so the next page load does not upload it all again', async () => {
    await finishDrill()
    await settle()
    cloud.mode = 'error'
    await finishDrill()
    await settle()
    expect(await localIds()).toHaveLength(2)
    expect(getPendingSessionIds()).toHaveLength(1)

    cloud.mode = 'ok'
    await useStatsStore.getState().resetAllStats()

    expect(cloud.rows.size).toBe(0)
    expect(await localIds()).toEqual([])
    expect(getPendingSessionIds()).toEqual([])

    // The reload: nothing comes back.
    await handleSignedIn()
    expect(cloud.rows.size).toBe(0)
    expect(useStatsStore.getState().sessions).toEqual([])
  })
})
