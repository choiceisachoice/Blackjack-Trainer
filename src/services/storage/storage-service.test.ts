import { describe, it, expect, beforeEach, vi } from 'vitest'
import { LocalStorageService, computeLifetimeStats } from './storage-service'
import type { TrainingSessionResult } from '../stats-types'
import { CountingSystemId } from '../../engine/counting/types'

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

describe('LocalStorageService', () => {
  let service: LocalStorageService
  let store: Record<string, string>

  beforeEach(() => {
    store = {}
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => store[key] ?? null,
      setItem: (key: string, value: string) => { store[key] = value },
      removeItem: (key: string) => { delete store[key] },
    })
    service = new LocalStorageService()
  })

  it('saves and retrieves a session', async () => {
    const session = makeSession()
    await service.saveSessionResult(session)

    const results = await service.getAllSessionResults()
    expect(results).toHaveLength(1)
    expect(results[0].id).toBe(session.id)
  })

  it('filters sessions by mode', async () => {
    await service.saveSessionResult(makeSession({ mode: 'speedDrill' }))
    await service.saveSessionResult(makeSession({ mode: 'betSpread' }))
    await service.saveSessionResult(makeSession({ mode: 'speedDrill' }))

    const speedDrills = await service.getSessionResults('speedDrill')
    expect(speedDrills).toHaveLength(2)

    const betSpreads = await service.getSessionResults('betSpread')
    expect(betSpreads).toHaveLength(1)
  })

  it('filters sessions by date range', async () => {
    await service.saveSessionResult(
      makeSession({ timestamp: '2026-02-10T10:00:00.000Z' })
    )
    await service.saveSessionResult(
      makeSession({ timestamp: '2026-02-15T10:00:00.000Z' })
    )
    await service.saveSessionResult(
      makeSession({ timestamp: '2026-02-20T10:00:00.000Z' })
    )

    const filtered = await service.getSessionResultsByDateRange(
      new Date('2026-02-14'),
      new Date('2026-02-16')
    )
    expect(filtered).toHaveLength(1)
    expect(filtered[0].timestamp).toBe('2026-02-15T10:00:00.000Z')
  })

  it('clears all data', async () => {
    await service.saveSessionResult(makeSession())
    await service.saveSessionResult(makeSession())
    expect(await service.getAllSessionResults()).toHaveLength(2)

    await service.clearAll()
    expect(await service.getAllSessionResults()).toHaveLength(0)
  })

  it('handles corrupted localStorage gracefully', async () => {
    store['bjt_sessions'] = 'not valid json'
    const results = await service.getAllSessionResults()
    expect(results).toHaveLength(0)
  })

  it('handles empty localStorage', async () => {
    const results = await service.getAllSessionResults()
    expect(results).toHaveLength(0)
  })

  it('computes lifetime stats', async () => {
    await service.saveSessionResult(
      makeSession({
        mode: 'speedDrill',
        totalQuestions: 10,
        correctAnswers: 8,
        accuracy: 0.8,
        durationSeconds: 60,
        bestStreak: 5,
      })
    )
    await service.saveSessionResult(
      makeSession({
        mode: 'betSpread',
        totalQuestions: 20,
        correctAnswers: 15,
        accuracy: 0.75,
        durationSeconds: 180,
        bestStreak: 7,
        details: {
          type: 'betSpread',
          questionMode: 'random',
          tcCorrect: 5,
          tcTotal: 10,
          betCorrect: 15,
          betTotal: 20,
        },
      })
    )

    const stats = await service.getLifetimeStats()
    expect(stats.totalSessions).toBe(2)
    expect(stats.totalQuestions).toBe(30)
    expect(stats.totalCorrect).toBe(23)
    expect(stats.totalPracticeSeconds).toBe(240)
    expect(stats.bestStreak).toBe(7)
    expect(stats.overallAccuracy).toBeCloseTo(23 / 30)
    expect(stats.byMode.speedDrill?.totalSessions).toBe(1)
    expect(stats.byMode.betSpread?.totalSessions).toBe(1)
  })
})

describe('computeLifetimeStats', () => {
  it('returns empty stats for empty input', () => {
    const stats = computeLifetimeStats([])
    expect(stats.totalSessions).toBe(0)
    expect(stats.overallAccuracy).toBe(0)
    expect(stats.dailyStats).toHaveLength(0)
  })

  it('aggregates daily stats correctly', () => {
    // Use recent, RELATIVE dates. dailyStats only keeps the last 90 days, so
    // hard-coded past dates would silently age out of the window and fail.
    const dayStr = (daysAgo: number): string =>
      new Date(Date.now() - daysAgo * 86_400_000).toISOString().slice(0, 10)
    const dateA = dayStr(2)
    const dateB = dayStr(3)

    const sessions: TrainingSessionResult[] = [
      makeSession({
        timestamp: `${dateA}T10:00:00.000Z`,
        totalQuestions: 10,
        correctAnswers: 8,
        durationSeconds: 60,
      }),
      makeSession({
        timestamp: `${dateA}T14:00:00.000Z`,
        totalQuestions: 5,
        correctAnswers: 5,
        durationSeconds: 30,
      }),
      makeSession({
        timestamp: `${dateB}T10:00:00.000Z`,
        totalQuestions: 20,
        correctAnswers: 10,
        durationSeconds: 120,
      }),
    ]

    const stats = computeLifetimeStats(sessions)
    expect(stats.dailyStats).toHaveLength(2)

    const dayA = stats.dailyStats.find(d => d.date === dateA)
    expect(dayA).toBeDefined()
    expect(dayA!.sessions).toBe(2)
    expect(dayA!.totalQuestions).toBe(15)
    expect(dayA!.totalCorrect).toBe(13)
    expect(dayA!.practiceSeconds).toBe(90)
  })
})
