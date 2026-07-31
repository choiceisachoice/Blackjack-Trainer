import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { TrainingSessionResult } from '../stats-types'
import { CountingSystemId } from '../../engine/counting/types'

/**
 * The finish path must not wait for the network.
 *
 * A drill ending is the one moment in this product that has to feel immediate:
 * the XP, the achievements and the level-up all hang off this write. These tests
 * pin the behaviour rather than the implementation — a cloud that is slow, or
 * broken, or hanging forever, must not delay the reward, and must not lose the
 * session either.
 */

/** A cloud write we control: it never settles until the test says so. */
let cloudCalls = 0
let releaseCloud: (() => void) | null = null
let failCloud = false

vi.mock('../supabase/client', () => ({ isSupabaseConfigured: true }))

vi.mock('../../store/auth-store', () => ({
  useAuthStore: { getState: () => ({ status: 'signedIn' }) },
}))

vi.mock('../supabase/supabase-storage', () => ({
  SupabaseStorageService: class {
    saveSessionResult() {
      cloudCalls++
      return new Promise<void>((resolve, reject) => {
        releaseCloud = () => (failCloud ? reject(new Error('offline')) : resolve())
      })
    }
    getAllSessionResults() { return Promise.resolve([]) }
    getSessionResults() { return Promise.resolve([]) }
    getSessionResultsByDateRange() { return Promise.resolve([]) }
    getLifetimeStats() { return Promise.resolve(null) }
    clearAll() { return Promise.resolve() }
  },
}))

function makeSession(id = crypto.randomUUID()): TrainingSessionResult {
  return {
    id,
    mode: 'speedDrill',
    timestamp: '2026-07-27T10:00:00.000Z',
    countingSystem: CountingSystemId.HiLo,
    durationSeconds: 90,
    totalQuestions: 12,
    correctAnswers: 11,
    accuracy: 11 / 12,
    bestStreak: 7,
    details: {
      type: 'speedDrill',
      cardsPerRound: 20,
      speedMs: 900,
      rcErrors: [0, 1, 0],
    },
  }
}

beforeEach(() => {
  localStorage.clear()
  cloudCalls = 0
  releaseCloud = null
  failCloud = false
  vi.restoreAllMocks()
})

describe('saving a finished session', () => {
  it('resolves before the cloud does', async () => {
    const { storage, LocalStorageService } = await import('./storage-service')
    const session = makeSession()

    // The cloud promise is deliberately left hanging for the whole test.
    await storage.saveSessionResult(session)

    expect(cloudCalls).toBe(1)
    expect(releaseCloud).not.toBeNull() // still in flight

    // And the session is already readable locally — which is what the store,
    // the XP award and the achievement check all run off.
    const local = new LocalStorageService()
    const saved = await local.getAllSessionResults()
    expect(saved.map(s => s.id)).toContain(session.id)
  })

  it('does not reject when the cloud write fails', async () => {
    const { storage } = await import('./storage-service')
    vi.spyOn(console, 'error').mockImplementation(() => {})
    failCloud = true

    await expect(storage.saveSessionResult(makeSession())).resolves.toBeUndefined()
    releaseCloud?.()
    // Give the rejection a turn to land on the catch rather than on the runner.
    await Promise.resolve()
    await Promise.resolve()
  })

  it('keeps the session locally when the cloud write fails, so nothing is lost', async () => {
    const { storage, LocalStorageService } = await import('./storage-service')
    vi.spyOn(console, 'error').mockImplementation(() => {})
    failCloud = true
    const session = makeSession()

    await storage.saveSessionResult(session)
    releaseCloud?.()
    await Promise.resolve()

    const local = new LocalStorageService()
    expect((await local.getAllSessionResults()).map(s => s.id)).toContain(session.id)
  })

  it('writes locally first, every time — not only as a fallback', async () => {
    // The old behaviour only kept a local copy when the cloud threw. That made
    // the local store a repair mechanism; now it is the source the UI reads.
    const { storage, LocalStorageService } = await import('./storage-service')
    const a = makeSession()
    const b = makeSession()

    await storage.saveSessionResult(a)
    await storage.saveSessionResult(b)

    const local = new LocalStorageService()
    const ids = (await local.getAllSessionResults()).map(s => s.id)
    expect(ids).toContain(a.id)
    expect(ids).toContain(b.id)
    expect(cloudCalls).toBe(2)
  })
})
