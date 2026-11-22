import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { useStatsStore } from './stats-store'
import { useLevelStore } from './level-store'
import { useAchievementStore } from './achievement-store'
import { useChallengeStore } from './challenge-store'
import { useWeeklyChallengeStore } from './weekly-challenge-store'
import type { TrainingSessionResult } from '../services/stats-types'
import { CountingSystemId } from '../engine/counting/types'
import { storage } from '../services/storage/storage-service'

// Mock the storage *service*, but keep the real `computeLifetimeStats`.
// The store now derives lifetime stats itself instead of re-reading them, and
// stubbing that derivation would leave the assertions checking a fake.
vi.mock('../services/storage/storage-service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/storage/storage-service')>()
  return {
    computeLifetimeStats: actual.computeLifetimeStats,
    storage: {
      saveSessionResult: vi.fn(async () => {}),
      getAllSessionResults: vi.fn(async () => []),
      getSessionResults: vi.fn(async () => []),
      getLifetimeStats: vi.fn(async () => ({
        totalSessions: 0,
        totalQuestions: 0,
        totalCorrect: 0,
        totalPracticeSeconds: 0,
        overallAccuracy: 0,
        bestStreak: 0,
        byMode: {},
        dailyStats: [],
      })),
      clearAll: vi.fn(async () => {}),
      getSessionResultsByDateRange: vi.fn(async () => []),
    },
  }
})

const mockedStorage = vi.mocked(storage)

function makeSession(
  overrides: Partial<TrainingSessionResult> = {}
): TrainingSessionResult {
  return {
    id: crypto.randomUUID(),
    mode: 'speedDrill',
    timestamp: '2026-02-19T10:00:00.000Z',
    countingSystem: CountingSystemId.HiLo,
    durationSeconds: 120,
    totalQuestions: 10,
    correctAnswers: 8,
    accuracy: 0.8,
    bestStreak: 5,
    details: {
      type: 'speedDrill',
      cardsPerRound: 20,
      speedMs: 1000,
      rcErrors: [0, 0, 2, 0, 1, 0, 0, 0, 3, 0],
    },
    ...overrides,
  }
}

describe('stats-store', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useStatsStore.setState({
      sessions: [],
      lifetimeStats: null,
      isLoading: false,
    })
  })

  it('loads stats from storage', async () => {
    const session = makeSession()
    mockedStorage.getAllSessionResults.mockResolvedValueOnce([session])
    mockedStorage.getLifetimeStats.mockResolvedValueOnce({
      totalSessions: 1,
      totalQuestions: 10,
      totalCorrect: 8,
      totalPracticeSeconds: 120,
      overallAccuracy: 0.8,
      bestStreak: 5,
      byMode: {},
      dailyStats: [],
    })

    await useStatsStore.getState().loadStats()

    const state = useStatsStore.getState()
    expect(state.sessions).toHaveLength(1)
    expect(state.lifetimeStats).toBeTruthy()
    expect(state.lifetimeStats!.totalSessions).toBe(1)
    expect(state.isLoading).toBe(false)
  })

  it('records a session and updates state', async () => {
    mockedStorage.getLifetimeStats.mockResolvedValueOnce({
      totalSessions: 1,
      totalQuestions: 10,
      totalCorrect: 8,
      totalPracticeSeconds: 120,
      overallAccuracy: 0.8,
      bestStreak: 5,
      byMode: {},
      dailyStats: [],
    })

    await useStatsStore.getState().recordSession({
      mode: 'speedDrill',
      startTime: Date.now() - 120000,
      totalQuestions: 10,
      correctAnswers: 8,
      bestStreak: 5,
      details: {
        type: 'speedDrill',
        cardsPerRound: 20,
        speedMs: 1000,
        rcErrors: [0, 0, 2, 0, 1, 0, 0, 0, 3, 0],
      },
    })

    const state = useStatsStore.getState()
    expect(state.sessions).toHaveLength(1)
    expect(state.sessions[0].mode).toBe('speedDrill')
    expect(state.sessions[0].accuracy).toBeCloseTo(0.8)
    expect(state.lifetimeStats).toBeTruthy()
    expect(mockedStorage.saveSessionResult).toHaveBeenCalledOnce()
  })

  it('returns stable trend when not enough sessions', () => {
    const trend = useStatsStore.getState().getAccuracyTrend()
    expect(trend).toBe('stable')
  })

  it('detects improving trend', () => {
    // 10 sessions: first 5 at 90% accuracy (recent), last 5 at 60% (older)
    const sessions: TrainingSessionResult[] = []
    for (let i = 0; i < 5; i++) {
      sessions.push(makeSession({
        timestamp: `2026-02-${String(19 - i).padStart(2, '0')}T10:00:00.000Z`,
        accuracy: 0.9,
      }))
    }
    for (let i = 0; i < 5; i++) {
      sessions.push(makeSession({
        timestamp: `2026-02-${String(10 - i).padStart(2, '0')}T10:00:00.000Z`,
        accuracy: 0.6,
      }))
    }

    useStatsStore.setState({ sessions })
    const trend = useStatsStore.getState().getAccuracyTrend()
    expect(trend).toBe('improving')
  })

  it('aggregates weakest deviations', () => {
    const sessions: TrainingSessionResult[] = [
      makeSession({
        mode: 'deviationFlashCards',
        details: {
          type: 'deviationFlashCards',
          deviationSet: 'i18',
          perDeviation: {
            'Insurance': { correct: 1, incorrect: 4 },
            '16 vs 10': { correct: 8, incorrect: 2 },
            '15 vs 10': { correct: 3, incorrect: 3 },
          },
        },
      }),
    ]
    useStatsStore.setState({ sessions })

    const weakest = useStatsStore.getState().getWeakestDeviations(2)
    expect(weakest).toHaveLength(2)
    expect(weakest[0].name).toBe('Insurance')
    expect(weakest[0].accuracy).toBeCloseTo(0.2)
    expect(weakest[1].name).toBe('15 vs 10')
  })

  it('calculates training streak', () => {
    const today = new Date().toISOString().slice(0, 10)
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10)
    const twoDaysAgo = new Date(Date.now() - 172800000).toISOString().slice(0, 10)

    const sessions: TrainingSessionResult[] = [
      makeSession({ timestamp: `${today}T10:00:00.000Z` }),
      makeSession({ timestamp: `${yesterday}T10:00:00.000Z` }),
      makeSession({ timestamp: `${twoDaysAgo}T10:00:00.000Z` }),
    ]
    useStatsStore.setState({ sessions })

    const streak = useStatsStore.getState().getTrainingStreak()
    expect(streak).toBe(3)
  })

  it('resets all stats', async () => {
    // First record a session
    mockedStorage.getLifetimeStats.mockResolvedValueOnce({
      totalSessions: 1,
      totalQuestions: 5,
      totalCorrect: 3,
      totalPracticeSeconds: 60,
      overallAccuracy: 0.6,
      bestStreak: 2,
      byMode: {},
      dailyStats: [],
    })

    await useStatsStore.getState().recordSession({
      mode: 'speedDrill',
      startTime: Date.now() - 60000,
      totalQuestions: 5,
      correctAnswers: 3,
      bestStreak: 2,
      details: {
        type: 'speedDrill',
        cardsPerRound: 10,
        speedMs: 1000,
        rcErrors: [0, 1, 0, 2, 0],
      },
    })
    expect(useStatsStore.getState().sessions).toHaveLength(1)

    await useStatsStore.getState().resetAllStats()
    expect(useStatsStore.getState().sessions).toHaveLength(0)
    expect(useStatsStore.getState().lifetimeStats).toBeNull()
    expect(mockedStorage.clearAll).toHaveBeenCalledOnce()
  })
})

/**
 * What a finished session must survive.
 *
 * `recordSession` is called from two places and awaited by neither:
 * `useSessionSave` fires it on unmount *and* on `pagehide`, and
 * `CasinoSession` calls it outright. Both matter here.
 *
 *  - **Nothing may hang off persistence.** The write used to come first, so a
 *    local failure — quota, private browsing, a serialisation error — took the
 *    session, the XP, the challenge progress and the achievement check with it,
 *    and did so as an unhandled rejection with nothing on screen.
 *  - **Nothing important may sit behind an `await`.** On `pagehide` the page is
 *    being torn down. Work scheduled after the first suspension point is not
 *    guaranteed to run, so the reward path has to be finished before then.
 */
describe('recording a session that cannot be persisted', () => {
  const params = {
    mode: 'speedDrill' as const,
    startTime: Date.now() - 60_000,
    totalQuestions: 10,
    correctAnswers: 8,
    bestStreak: 4,
    details: {
      type: 'speedDrill' as const,
      cardsPerRound: 10,
      speedMs: 1000,
      rcErrors: [0, 1, 0, 0, 0, 0, 2, 0, 0, 0],
    },
  }

  beforeEach(() => {
    vi.clearAllMocks()
    useStatsStore.setState({ sessions: [], lifetimeStats: null, isLoading: false })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('still counts the session, the XP and the achievements', async () => {
    const xp = vi.spyOn(useLevelStore.getState(), 'addSessionXP')
    const achievements = vi.spyOn(useAchievementStore.getState(), 'checkAchievements')
    mockedStorage.saveSessionResult.mockRejectedValueOnce(new Error('QuotaExceededError'))

    await useStatsStore.getState().recordSession(params)

    const state = useStatsStore.getState()
    expect(state.sessions).toHaveLength(1)
    expect(state.lifetimeStats?.totalSessions).toBe(1)
    expect(xp).toHaveBeenCalledOnce()
    expect(achievements).toHaveBeenCalledOnce()
  })

  it('does not reject, because neither caller awaits it', async () => {
    // An unhandled rejection here is not a logging nuisance — it is the entire
    // failure mode being invisible.
    mockedStorage.saveSessionResult.mockRejectedValueOnce(new Error('nope'))
    await expect(useStatsStore.getState().recordSession(params)).resolves.toBeUndefined()
  })

  it('applies the session and its rewards before it waits on anything', async () => {
    const xp = vi.spyOn(useLevelStore.getState(), 'addSessionXP')
    // A write that never settles stands in for a page being torn down mid-flight.
    mockedStorage.saveSessionResult.mockImplementationOnce(() => new Promise<void>(() => {}))

    const pending = useStatsStore.getState().recordSession(params)

    // No `await` above: everything asserted here ran synchronously, before the
    // first suspension point. This is the property that makes the `pagehide`
    // path safe, and it cannot be observed any other way.
    expect(useStatsStore.getState().sessions).toHaveLength(1)
    expect(xp).toHaveBeenCalledOnce()

    void pending
  })
})

/**
 * A session that carries its own id, and one that ended before it was recorded.
 *
 * The Casino Session saves its table to the device, so a table can be cashed
 * out later, from another tab, or by the app itself after a day. The id makes
 * all of those one session; the end time keeps a session found a day late from
 * being a day long.
 */
describe('recording a session under an id of its own', () => {
  const params = {
    mode: 'casinoSession' as const,
    startTime: 1_800_000_000_000,
    totalQuestions: 12,
    correctAnswers: 9,
    bestStreak: 0,
    details: {
      type: 'speedDrill' as const,
      cardsPerRound: 10,
      speedMs: 1000,
      rcErrors: [],
    },
  }

  beforeEach(() => {
    vi.clearAllMocks()
    useStatsStore.setState({ sessions: [], lifetimeStats: null, isLoading: false })
  })
  afterEach(() => { vi.restoreAllMocks() })

  it('stores it under that id', async () => {
    await useStatsStore.getState().recordSession({ ...params, id: 'table-1' })
    expect(useStatsStore.getState().sessions.map(s => s.id)).toEqual(['table-1'])
  })

  it('records it once: a second call adds no row, pays no XP and writes nothing', async () => {
    const xp = vi.spyOn(useLevelStore.getState(), 'addSessionXP')
    const achievements = vi.spyOn(useAchievementStore.getState(), 'checkAchievements')
    await useStatsStore.getState().recordSession({ ...params, id: 'table-1' })
    await useStatsStore.getState().recordSession({ ...params, id: 'table-1' })
    await useStatsStore.getState().recordSession({ ...params, id: 'table-1', correctAnswers: 12 })

    expect(useStatsStore.getState().sessions).toHaveLength(1)
    expect(useStatsStore.getState().sessions[0].correctAnswers).toBe(9)
    expect(xp).toHaveBeenCalledOnce()
    expect(achievements).toHaveBeenCalledOnce()
    expect(mockedStorage.saveSessionResult).toHaveBeenCalledOnce()
  })

  it('still records every session that brings no id', async () => {
    await useStatsStore.getState().recordSession(params)
    await useStatsStore.getState().recordSession(params)
    const ids = useStatsStore.getState().sessions.map(s => s.id)
    expect(ids).toHaveLength(2)
    expect(ids[0]).not.toBe(ids[1])
  })

  it('ends when it is told it ended, not when it is recorded', async () => {
    await useStatsStore.getState().recordSession({ ...params, endTime: params.startTime + 754_000 })
    const [session] = useStatsStore.getState().sessions
    expect(session.durationSeconds).toBe(754)
    expect(session.timestamp).toBe(new Date(params.startTime).toISOString())
  })
})

/**
 * A session recorded after the fact — a casino table cashed out a day later —
 * carries its own, older times. It is a session of then, not of now.
 */
describe('recording a session that ended earlier', () => {
  const DAY = 24 * 60 * 60 * 1000
  const base = {
    mode: 'casinoSession' as const,
    totalQuestions: 12,
    correctAnswers: 9,
    bestStreak: 0,
    details: { type: 'speedDrill' as const, cardsPerRound: 10, speedMs: 1000, rcErrors: [] },
  }
  const startedAt = (s: TrainingSessionResult) => new Date(s.timestamp).getTime()

  beforeEach(() => {
    vi.clearAllMocks()
    useStatsStore.setState({ sessions: [], lifetimeStats: null, isLoading: false })
  })
  afterEach(() => { vi.restoreAllMocks() })

  it('goes where it belongs in the list, which stays newest first', async () => {
    const now = Date.now()
    await useStatsStore.getState().recordSession({ ...base, id: 'three-days-ago', startTime: now - 3 * DAY, endTime: now - 3 * DAY + 60_000 })
    await useStatsStore.getState().recordSession({ ...base, id: 'today', startTime: now - 60_000 })
    await useStatsStore.getState().recordSession({ ...base, id: 'yesterday', startTime: now - DAY, endTime: now - DAY + 60_000 })
    await useStatsStore.getState().recordSession({ ...base, id: 'last-week', startTime: now - 7 * DAY, endTime: now - 7 * DAY + 60_000 })

    const sessions = useStatsStore.getState().sessions
    expect(sessions.map(s => s.id)).toEqual(['today', 'yesterday', 'three-days-ago', 'last-week'])
    expect(sessions.map(startedAt)).toEqual([...sessions.map(startedAt)].sort((a, b) => b - a))
  })

  it('still puts a session that just ended at the head', async () => {
    const now = Date.now()
    await useStatsStore.getState().recordSession({ ...base, id: 'first', startTime: now - 120_000 })
    await useStatsStore.getState().recordSession({ ...base, id: 'second', startTime: now - 60_000 })
    expect(useStatsStore.getState().sessions.map(s => s.id)).toEqual(['second', 'first'])
  })

  it('hands the XP rule the other sessions, wherever the new one landed', async () => {
    const now = Date.now()
    const xp = vi.spyOn(useLevelStore.getState(), 'addSessionXP')
    await useStatsStore.getState().recordSession({ ...base, id: 'today', startTime: now - 60_000 })
    await useStatsStore.getState().recordSession({ ...base, id: 'yesterday', startTime: now - DAY, endTime: now - DAY + 60_000 })
    const [recorded, others] = xp.mock.calls[1]
    expect(recorded.id).toBe('yesterday')
    expect((others ?? []).map(s => s.id)).toEqual(['today'])
  })

  it('is not progress on today\'s challenge when it ended yesterday', async () => {
    const daily = vi.spyOn(useChallengeStore.getState(), 'updateProgress')
    const now = Date.now()
    await useStatsStore.getState().recordSession({ ...base, startTime: now - DAY - 60_000, endTime: now - DAY })
    expect(daily).not.toHaveBeenCalled()
    await useStatsStore.getState().recordSession({ ...base, startTime: now - 60_000 })
    expect(daily).toHaveBeenCalledOnce()
  })

  it('is not progress on this week\'s challenge when it ended in an earlier week', async () => {
    const weekly = vi.spyOn(useWeeklyChallengeStore.getState(), 'updateProgress')
    const daily = vi.spyOn(useChallengeStore.getState(), 'updateProgress')
    const now = Date.now()
    await useStatsStore.getState().recordSession({ ...base, startTime: now - 8 * DAY - 60_000, endTime: now - 8 * DAY })
    expect(weekly).not.toHaveBeenCalled()
    expect(daily).not.toHaveBeenCalled()
    await useStatsStore.getState().recordSession({ ...base, startTime: now - 60_000 })
    expect(weekly).toHaveBeenCalledOnce()
  })
})
