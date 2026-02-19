import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useStatsStore } from './stats-store'
import type { TrainingSessionResult } from '../services/stats-types'
import { CountingSystemId } from '../engine/counting/types'
import { storage } from '../services/storage/storage-service'

// Mock storage service
vi.mock('../services/storage/storage-service', () => {
  return {
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
