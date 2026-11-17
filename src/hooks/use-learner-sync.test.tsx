import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, cleanup } from '@testing-library/react'
import { useLearnerSync } from './use-learner-sync'
import { useStatsStore } from '../store/stats-store'
import { useChallengeStore } from '../store/challenge-store'
import { useWeeklyChallengeStore } from '../store/weekly-challenge-store'
import { useLevelStore } from '../store/level-store'
import { stageForMode } from '../services/challenges/challenge-selection'
import { getClaimedStages } from '../services/stage-rewards'
import { stageXP } from '../services/stage-rewards'
import { CURRICULUM, stageIndex, type StageId } from '../services/curriculum'
import type { TrainingMode, TrainingSessionResult } from '../services/stats-types'

const proState = { isPro: true }
vi.mock('../store/entitlement-store', async importOriginal => ({
  ...(await importOriginal<typeof import('../store/entitlement-store')>()),
  useIsPro: () => proState.isPro,
}))

function session(mode: TrainingMode, accuracy: number): TrainingSessionResult {
  return {
    id: crypto.randomUUID(),
    mode,
    timestamp: '2026-05-01T10:00:00.000Z',
    durationSeconds: 120,
    totalQuestions: 20,
    correctAnswers: Math.round(20 * accuracy),
    accuracy,
    bestStreak: 5,
  } as unknown as TrainingSessionResult
}

/**
 * `count` runs dealt round-robin over `days` different calendar days. 10:00
 * UTC on consecutive dates is a different local day each, in any timezone.
 */
const spread = (count: number, days: number, mode: TrainingMode, accuracy: number) =>
  Array.from({ length: count }, (_, i) => ({
    ...session(mode, accuracy),
    timestamp: `2026-05-${String(1 + (i % days)).padStart(2, '0')}T10:00:00.000Z`,
  }))

const drillOf = (id: StageId) => CURRICULUM[stageIndex(id)].drill!

/**
 * Exactly what a stage asks for — its own number of sessions on its own
 * number of days, read from the curriculum rather than typed in here.
 */
function finishing(id: StageId, mode: TrainingMode, accuracy: number): TrainingSessionResult[] {
  const drill = drillOf(id)
  const sessions = spread(drill.minSessions, drill.minDays, mode, accuracy)
  if (!sessions.every(drill.counts)) throw new Error(`sessions do not count towards ${id}`)
  return sessions
}

beforeEach(() => {
  localStorage.clear()
  proState.isPro = true
  useStatsStore.setState({ sessions: [], lifetimeStats: null, loadStats: vi.fn() })
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('useLearnerSync', () => {
  it('tells both challenge engines where the learner stands', () => {
    const daily = vi.fn()
    const weekly = vi.fn()
    useChallengeStore.setState({ syncLearner: daily })
    useWeeklyChallengeStore.setState({ syncLearner: weekly })
    localStorage.setItem('bjt_placement', 'hi-lo')

    renderHook(() => useLearnerSync())

    expect(daily).toHaveBeenCalledWith({ stage: 'hi-lo', isPro: true })
    expect(weekly).toHaveBeenCalledWith({ stage: 'hi-lo', isPro: true })
  })

  it('reports no stage for a learner who never took the placement test', () => {
    const daily = vi.fn()
    useChallengeStore.setState({ syncLearner: daily })

    renderHook(() => useLearnerSync())

    expect(daily).toHaveBeenCalledWith({ stage: null, isPro: true })
  })

  it('moves the reported stage on as drills are cleared', () => {
    const daily = vi.fn()
    useChallengeStore.setState({ syncLearner: daily })
    localStorage.setItem('bjt_placement', 'hi-lo')
    useStatsStore.setState({ sessions: finishing('hi-lo', 'speedDrill', 0.95) })

    renderHook(() => useLearnerSync())

    // Hi-Lo cleared → the next unfinished stage is what challenges key off.
    expect(daily).toHaveBeenCalledWith({ stage: 'true-count', isPro: true })
    expect(stageIndex('true-count')).toBeGreaterThan(stageIndex(stageForMode('speedDrill')!))
  })

  it('pays XP for a stage the learner just finished', () => {
    const addXP = vi.fn()
    useLevelStore.setState({ addChallengeXP: addXP })
    localStorage.setItem('bjt_placement', 'hi-lo')
    useStatsStore.setState({ sessions: finishing('hi-lo', 'speedDrill', 0.95) })

    renderHook(() => useLearnerSync())

    // Feeds the level-up popup's "where did this XP come from" list. A key plus
    // params, not a rendered string — the store holds no display text, so the
    // breakdown can be translated at render instead of shipping English to all
    // seven languages.
    expect(addXP).toHaveBeenCalledWith(
      stageXP('hi-lo'),
      'plan.stageComplete',
      { stage: expect.stringContaining('Hi-Lo') },
    )
    expect(getClaimedStages()).toContain('hi-lo')
  })

  it('pays nothing when no stage is finished', () => {
    const addXP = vi.fn()
    useLevelStore.setState({ addChallengeXP: addXP })
    const { minSessions, minDays } = drillOf('hi-lo')
    useStatsStore.setState({ sessions: spread(minSessions - 1, minDays, 'speedDrill', 0.95) })

    renderHook(() => useLearnerSync())

    expect(addXP).not.toHaveBeenCalled()
  })

  it('pays nothing for a stage drilled to the full count in one sitting', () => {
    // The sessions are all there; the other days are not. Paying here would
    // bring back the plan that could be finished in an afternoon.
    const daily = vi.fn()
    const addXP = vi.fn()
    useChallengeStore.setState({ syncLearner: daily })
    useLevelStore.setState({ addChallengeXP: addXP })
    localStorage.setItem('bjt_placement', 'hi-lo')
    const { minSessions, minDays } = drillOf('hi-lo')
    useStatsStore.setState({ sessions: spread(minSessions * 2, 1, 'speedDrill', 0.95) })

    renderHook(() => useLearnerSync())

    expect(addXP).not.toHaveBeenCalled()
    expect(getClaimedStages()).not.toContain('hi-lo')
    expect(daily).toHaveBeenCalledWith(expect.objectContaining({ stage: 'hi-lo' }))

    // One day short is still short.
    useStatsStore.setState({ sessions: spread(minSessions, minDays - 1, 'speedDrill', 0.95) })
    renderHook(() => useLearnerSync())
    expect(addXP).not.toHaveBeenCalled()
  })

  it('keeps a stage paid under the old bar finished, without paying it again', () => {
    // Three good runs in one sitting closed Hi-Lo before 17 Nov 2026. Whoever
    // was paid for that is not sent back, and is not paid twice.
    const daily = vi.fn()
    const addXP = vi.fn()
    useChallengeStore.setState({ syncLearner: daily })
    useLevelStore.setState({ addChallengeXP: addXP })
    localStorage.setItem('bjt_placement', 'hi-lo')
    localStorage.setItem('bjt_claimed_stages', JSON.stringify(['hi-lo']))
    useStatsStore.setState({ sessions: spread(3, 1, 'speedDrill', 0.95) })

    renderHook(() => useLearnerSync())

    expect(daily).toHaveBeenCalledWith(expect.objectContaining({ stage: 'true-count' }))
    expect(addXP).not.toHaveBeenCalled()
  })

  it('never pays the same stage twice across remounts', () => {
    const addXP = vi.fn()
    useLevelStore.setState({ addChallengeXP: addXP })
    useStatsStore.setState({ sessions: finishing('hi-lo', 'speedDrill', 0.95) })

    const first = renderHook(() => useLearnerSync())
    const paidFirst = addXP.mock.calls.length
    first.unmount()
    renderHook(() => useLearnerSync())

    expect(paidFirst).toBe(1)
    expect(addXP.mock.calls.length).toBe(1)
  })

  it('pays for every stage finished at once, not just the newest', () => {
    const addXP = vi.fn()
    useLevelStore.setState({ addChallengeXP: addXP })
    // Flashcards clear basic strategy, speed drills clear Hi-Lo.
    useStatsStore.setState({
      sessions: [
        ...finishing('basic-strategy', 'deviationFlashCards', 0.9),
        ...finishing('hi-lo', 'speedDrill', 0.95),
      ],
    })

    renderHook(() => useLearnerSync())

    expect(addXP.mock.calls.map(c => c[0]))
      .toEqual([stageXP('basic-strategy'), stageXP('hi-lo')])
  })
})
