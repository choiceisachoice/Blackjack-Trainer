import { describe, it, expect, afterEach, vi } from 'vitest'
import { useStatsStore } from '../store/stats-store'
import { storage } from './storage/storage-service'

/**
 * A full localStorage quota while a session is recorded.
 *
 * The XP is awarded before the session is persisted (`recordSession` finishes
 * the reward path synchronously, then saves). The level's write was the one
 * write on that path that threw, so a full quota rejected `recordSession`
 * before `saveSessionResult` ran: the session never reached the device's copy
 * or the cloud.
 */
vi.mock('./storage/storage-service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./storage/storage-service')>()
  return {
    computeLifetimeStats: actual.computeLifetimeStats,
    getDeviceSessionResults: actual.getDeviceSessionResults,
    storage: {
      saveSessionResult: vi.fn(async () => {}),
      getAllSessionResults: vi.fn(async () => []),
      getSessionResults: vi.fn(async () => []),
      getLifetimeStats: vi.fn(async () => null),
      clearAll: vi.fn(async () => {}),
      getSessionResultsByDateRange: vi.fn(async () => []),
    },
  }
})

describe('recording a session while the level XP cannot be stored', () => {
  afterEach(() => vi.restoreAllMocks())

  it('still saves the session', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const realSetItem = Storage.prototype.setItem
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key: string, value: string) {
      if (key === 'bjt_level_xp') throw new DOMException('full', 'QuotaExceededError')
      realSetItem.call(this, key, value)
    })

    await expect(useStatsStore.getState().recordSession({
      mode: 'speedDrill',
      startTime: Date.now() - 60_000,
      totalQuestions: 10,
      correctAnswers: 9,
      bestStreak: 5,
      details: { type: 'speedDrill', cardsPerRound: 10, speedMs: 1000, rcErrors: [0, 0, 0, 0, 0, 0, 0, 0, 0, 1] },
    })).resolves.toBeUndefined()

    expect(vi.mocked(storage).saveSessionResult).toHaveBeenCalledOnce()
    expect(useStatsStore.getState().sessions).toHaveLength(1)
  })
})
