import { describe, it, expect, beforeEach } from 'vitest'
import {
  CURRICULUM,
  deriveCurriculum,
  deriveStageProgress,
  currentStage,
  nextUnlockedStage,
  stageIndex,
  stageNeedsPro,
  getPlacement,
  setPlacement,
  getReadStages,
  markStageRead,
  stageTrend,
  stageEffort,
  activeStage,
  type StageId,
} from './curriculum'
import { isProMode } from './pro-features'
import type { TrainingMode, TrainingSessionResult } from './stats-types'

function session(mode: TrainingMode, accuracy: number, details?: unknown): TrainingSessionResult {
  return {
    id: crypto.randomUUID(),
    mode,
    timestamp: '2026-03-20T10:00:00.000Z',
    durationSeconds: 120,
    totalQuestions: 20,
    correctAnswers: Math.round(20 * accuracy),
    accuracy,
    bestStreak: 5,
    details: details ?? { type: mode },
  } as unknown as TrainingSessionResult
}

const repeat = (n: number, f: () => TrainingSessionResult) => Array.from({ length: n }, f)
const stage = (id: StageId) => CURRICULUM.find(s => s.id === id)!

describe('CURRICULUM shape', () => {
  it('is ordered along the real dependency chain', () => {
    // You cannot size bets by a count you can't keep.
    const order: StageId[] = ['rules', 'basic-strategy', 'hi-lo', 'true-count', 'deviations', 'bet-spread', 'table']
    expect(CURRICULUM.map(s => s.id)).toEqual(order)
  })

  it('gives every stage a goal and a reason to care', () => {
    for (const s of CURRICULUM) {
      expect(s.goal.length).toBeGreaterThan(20)
      expect(s.why.length).toBeGreaterThan(20)
    }
  })

  it('keeps the first three stages free, so a free account can genuinely learn to count', () => {
    for (const id of ['rules', 'basic-strategy', 'hi-lo'] as const) {
      expect(stageNeedsPro(stage(id)), `${id} must not need Pro`).toBe(false)
    }
  })

  it('marks a stage Pro exactly when its drill lives on a Pro screen', () => {
    for (const s of CURRICULUM) {
      const expected = s.drill ? isProMode(s.drill.mode) : false
      expect(stageNeedsPro(s)).toBe(expected)
    }
  })
})

describe('deriveStageProgress', () => {
  it('counts only sessions that clear the accuracy floor', () => {
    const s = stage('hi-lo') // 3 Speed Drills at 90%
    const sessions = [...repeat(5, () => session('speedDrill', 0.7)), session('speedDrill', 0.95)]
    const p = deriveStageProgress(s, sessions, [], true)
    expect(p.current).toBe(1)
    expect(p.done).toBe(false)
  })

  it('completes once enough qualifying sessions exist', () => {
    const p = deriveStageProgress(stage('hi-lo'), repeat(3, () => session('speedDrill', 0.95)), [], true)
    expect(p.done).toBe(true)
    expect(p.current).toBe(3)
  })

  it('ignores sessions from a different mode', () => {
    const p = deriveStageProgress(stage('hi-lo'), repeat(9, () => session('betSpread', 1)), [], true)
    expect(p.current).toBe(0)
  })

  it('counts a flashcards session towards deviations only if it contained deviations', () => {
    const plain = repeat(3, () => session('deviationFlashCards', 0.95, { type: 'deviationFlashCards', perDeviation: {} }))
    const real = repeat(3, () =>
      session('deviationFlashCards', 0.95, {
        type: 'deviationFlashCards',
        perDeviation: { '16 vs 10': { correct: 3, incorrect: 0 } },
      }),
    )
    expect(deriveStageProgress(stage('deviations'), plain, [], true).current).toBe(0)
    expect(deriveStageProgress(stage('deviations'), real, [], true).done).toBe(true)
  })

  it('treats a reading stage as user-confirmed, not measured', () => {
    const s = stage('rules')
    expect(deriveStageProgress(s, [], [], true).done).toBe(false)
    const marked = deriveStageProgress(s, [], ['rules'], true)
    expect(marked.done).toBe(true)
    expect(marked.readOnly).toBe(true)
  })

  it('locks Pro stages for a free account, without hiding them', () => {
    const p = deriveStageProgress(stage('bet-spread'), [], [], false)
    expect(p.locked).toBe(true)
    expect(p.stage.title).toBeTruthy()
  })
})

describe('currentStage', () => {
  const progress = (sessions: TrainingSessionResult[], read: StageId[] = []) =>
    deriveCurriculum(sessions, read, true)

  it('points a placed beginner at their first stage', () => {
    expect(currentStage(progress([]), 'rules')?.stage.id).toBe('rules')
  })

  it('never sends an experienced counter back to earlier stages', () => {
    // Placed at deviations with no history at all — the rules must not resurface.
    expect(currentStage(progress([]), 'deviations')?.stage.id).toBe('deviations')
  })

  it('advances as stages are completed', () => {
    const done = [
      ...repeat(3, () => session('deviationFlashCards', 0.95)),
      ...repeat(3, () => session('speedDrill', 0.95)),
    ]
    expect(currentStage(progress(done, ['rules']), 'rules')?.stage.id).toBe('true-count')
  })

  it('returns null when the whole path is finished', () => {
    const everything = [
      ...repeat(3, () => session('deviationFlashCards', 0.95, {
        type: 'deviationFlashCards',
        perDeviation: { '16 vs 10': { correct: 3, incorrect: 0 } },
      })),
      ...repeat(3, () => session('speedDrill', 0.95)),
      ...repeat(3, () => session('deckEstimation', 0.95)),
      ...repeat(3, () => session('betSpread', 0.95)),
      ...repeat(3, () => session('casinoSession', 1)),
    ]
    expect(currentStage(progress(everything, ['rules']), 'rules')).toBeNull()
  })
})

describe('stageIndex', () => {
  it('orders stages so an earlier gap always wins', () => {
    expect(stageIndex('basic-strategy')).toBeLessThan(stageIndex('hi-lo'))
    expect(stageIndex('hi-lo')).toBeLessThan(stageIndex('bet-spread'))
  })
})

describe('persistence', () => {
  beforeEach(() => localStorage.clear())

  it('has no placement until the assessment is taken', () => {
    expect(getPlacement()).toBeNull()
  })

  it('round-trips a placement', () => {
    setPlacement('deviations')
    expect(getPlacement()).toBe('deviations')
  })

  it('ignores a corrupt or unknown stored placement', () => {
    localStorage.setItem('bjt_placement', 'not-a-stage')
    expect(getPlacement()).toBeNull()
  })

  it('collects read stages without duplicating them', () => {
    markStageRead('rules')
    markStageRead('rules')
    markStageRead('hi-lo')
    expect(getReadStages().sort()).toEqual(['hi-lo', 'rules'])
  })

  it('survives corrupt read-stage storage', () => {
    localStorage.setItem('bjt_read_stages', '{not json')
    expect(getReadStages()).toEqual([])
  })
})

describe('stageTrend', () => {
  const at = (day: number, accuracy: number, mode: TrainingMode = 'speedDrill') => ({
    ...session(mode, accuracy),
    timestamp: `2026-03-${String(day).padStart(2, '0')}T10:00:00.000Z`,
  })

  it('reports nothing for a stage with no measurable drill', () => {
    expect(stageTrend(stage('rules'), [])).toBeNull()
  })

  it('reports the stage floor even with no sessions yet', () => {
    const trend = stageTrend(stage('hi-lo'), [])!
    expect(trend.points).toEqual([])
    expect(trend.cleared).toBe(0)
    expect(trend.floor).toBe(90)
  })

  it('returns accuracies as whole percentages, oldest first', () => {
    const trend = stageTrend(stage('hi-lo'), [at(3, 0.7), at(1, 0.95), at(2, 0.8)])!
    expect(trend.points).toEqual([95, 80, 70])
  })

  it('counts only the sessions that cleared the floor', () => {
    const trend = stageTrend(stage('hi-lo'), [at(1, 0.95), at(2, 0.89), at(3, 0.9)])!
    // 90% floor: 0.89 misses, 0.90 exactly clears.
    expect(trend.cleared).toBe(2)
  })

  it('ignores sessions from other modes', () => {
    const trend = stageTrend(stage('hi-lo'), [at(1, 0.95), at(2, 1, 'betSpread')])!
    expect(trend.points).toEqual([95])
  })

  it('keeps the most recent attempts, not the first', () => {
    const many = Array.from({ length: 15 }, (_, i) => at(i + 1, (i + 1) / 100))
    const trend = stageTrend(stage('hi-lo'), many, 10)!
    expect(trend.points).toHaveLength(10)
    expect(trend.points[trend.points.length - 1]).toBe(15)
    expect(trend.points[0]).toBe(6)
  })

  it('leaves the caller’s session list untouched', () => {
    const sessions = [at(3, 0.7), at(1, 0.95)]
    stageTrend(stage('hi-lo'), sessions)
    expect(sessions[0].timestamp).toContain('-03-')
    expect(sessions.map(s => s.accuracy)).toEqual([0.7, 0.95])
  })

  it('agrees with the progress derivation about what counts', () => {
    // Independent oracle: both read the same drill predicate and floor.
    const sessions = [at(1, 0.95), at(2, 0.95), at(3, 0.4)]
    const trend = stageTrend(stage('hi-lo'), sessions)!
    const progress = deriveStageProgress(stage('hi-lo'), sessions, [], true)
    expect(trend.cleared).toBe(progress.current)
  })
})

describe('activeStage', () => {
  beforeEach(() => localStorage.clear())

  it('is null until the learner has been placed', () => {
    expect(activeStage([], true)).toBeNull()
  })

  it('is the placement itself when nothing is finished', () => {
    setPlacement('hi-lo')
    expect(activeStage([], true)).toBe('hi-lo')
  })

  it('moves on as stages are cleared', () => {
    setPlacement('hi-lo')
    expect(activeStage(repeat(3, () => session('speedDrill', 0.95)), true)).toBe('true-count')
  })

  it('never sends a placed learner back below their placement', () => {
    setPlacement('bet-spread')
    expect(activeStage([], true)).toBe('bet-spread')
  })

  it('is null once the whole path is done', () => {
    setPlacement('bet-spread')
    const done = [
      ...repeat(3, () => session('betSpread', 0.9)),
      ...repeat(3, () => session('casinoSession', 1)),
    ]
    expect(activeStage(done, true)).toBeNull()
  })
})

describe('nextUnlockedStage', () => {
  const progressFor = (isPro: boolean, sessions: TrainingSessionResult[] = []) =>
    deriveCurriculum(sessions, [], isPro)

  it('says nothing when the current stage is already open', () => {
    expect(nextUnlockedStage(progressFor(true), 'hi-lo')).toBeNull()
    // Hi-Lo drills on the free Speed Drill screen.
    expect(nextUnlockedStage(progressFor(false), 'hi-lo')).toBeNull()
  })

  it('points a free learner past a Pro stage to the free one behind it', () => {
    // True count is Pro; deviations, the stage after it, is not — and a free
    // learner would otherwise be told to do something they cannot open.
    const next = nextUnlockedStage(progressFor(false), 'true-count')
    expect(next?.stage.id).toBe('deviations')
    expect(next?.locked).toBe(false)
  })

  it('says nothing when everything ahead is locked too', () => {
    // From bet spread on, the rest of the path is Pro.
    expect(nextUnlockedStage(progressFor(false), 'bet-spread')).toBeNull()
  })

  it('skips stages that are already finished', () => {
    const done = repeat(3, () => session('deviationFlashCards', 0.9))
    const next = nextUnlockedStage(progressFor(false, done), 'true-count')
    // Basic strategy is cleared by those sessions, but it sits before the
    // locked stage anyway; deviations needs its own sessions.
    expect(next?.stage.id).toBe('deviations')
  })

  it('never points past the learner’s goal', () => {
    // The plan cannot offer a stage as "open to you now" and label the same
    // stage "beyond your goal" a few rows further down.
    expect(nextUnlockedStage(progressFor(false), 'true-count', 'true-count')).toBeNull()
    expect(nextUnlockedStage(progressFor(false), 'true-count', 'deviations')?.stage.id).toBe('deviations')
  })

  it('searches the whole path when no goal is given', () => {
    expect(nextUnlockedStage(progressFor(false), 'true-count')?.stage.id).toBe('deviations')
  })

  it('never points backwards', () => {
    const next = nextUnlockedStage(progressFor(false), 'true-count')
    expect(stageIndex(next!.stage.id)).toBeGreaterThan(stageIndex('true-count'))
  })

  it('holds no opinion for a Pro learner, who is never blocked', () => {
    for (const id of CURRICULUM.map(s => s.id)) {
      expect(nextUnlockedStage(progressFor(true), id), id).toBeNull()
    }
  })
})

describe('effort below the bar', () => {
  const drills = (n: number, accuracy: number, mode: TrainingMode = 'speedDrill') =>
    Array.from({ length: n }, () => session(mode, accuracy))
  const hiLo = stage('hi-lo') // bar is 90%

  it('separates work done from the bar being cleared', () => {
    // The failure this exists for: ten near-misses and ten guesses both showed
    // "0/3", so real effort was indistinguishable from none.
    const near = deriveStageProgress(hiLo, drills(10, 0.895), [], true)
    const poor = deriveStageProgress(hiLo, drills(10, 0.5), [], true)

    expect(near.current).toBe(poor.current) // the verdict is still the same...
    expect(near.attempts).toBe(10)
    expect(near.best).toBe(89)
    expect(poor.best).toBe(50) // ...but the two are no longer indistinguishable
  })

  it('counts every attempt, not only the good ones', () => {
    const p = deriveStageProgress(hiLo, [...drills(2, 0.95), ...drills(5, 0.4)], [], true)
    expect(p.attempts).toBe(7)
    expect(p.current).toBe(2)
  })

  it('ignores attempts at other drills', () => {
    const p = deriveStageProgress(hiLo, drills(4, 0.99, 'betSpread'), [], true)
    expect(p.attempts).toBe(0)
    expect(p.best).toBeNull()
  })

  it('never rounds a best up to the bar it did not clear', () => {
    // 89.6% must not print as "90%" beside a 90% bar — a number that
    // contradicts the verdict next to it destroys trust in both.
    const p = deriveStageProgress(hiLo, drills(1, 0.899), [], true)
    expect(p.best).toBe(89)
    expect(p.best).toBeLessThan(p.bar)
    expect(p.done).toBe(false)
  })

  it('reports the bar as a whole percentage', () => {
    expect(deriveStageProgress(hiLo, [], [], true).bar).toBe(90)
    expect(deriveStageProgress(stage('true-count'), [], [], true).bar).toBe(80)
  })

  it('says nothing about effort on a reading stage', () => {
    const p = deriveStageProgress(stage('rules'), drills(5, 0.9), [], true)
    expect(p.attempts).toBe(0)
    expect(p.best).toBeNull()
  })
})

describe('stageEffort', () => {
  const drills = (n: number, accuracy: number) =>
    Array.from({ length: n }, () => session('speedDrill', accuracy))
  const classify = (sessions: TrainingSessionResult[], isPro = true) =>
    stageEffort(deriveStageProgress(stage('hi-lo'), sessions, [], isPro))

  it('calls an untouched stage untouched', () => {
    expect(classify([])).toEqual({ kind: 'untouched' })
  })

  it('names the near miss, with the gap to the bar', () => {
    expect(classify(drills(10, 0.895))).toEqual({
      kind: 'below', best: 89, bar: 90, gap: 1, attempts: 10,
    })
  })

  it('never claims a zero gap for something that has not cleared', () => {
    // Flooring the best could otherwise produce "0 points off" while the stage
    // is plainly unfinished.
    const effort = classify(drills(1, 0.8999))
    expect(effort.kind).toBe('below')
    if (effort.kind === 'below') expect(effort.gap).toBeGreaterThanOrEqual(1)
  })

  it('reports an honest gap for someone far off', () => {
    const effort = classify(drills(3, 0.5))
    expect(effort).toMatchObject({ kind: 'below', best: 50, gap: 40 })
  })

  it('switches to partial once something clears', () => {
    expect(classify([...drills(1, 0.95), ...drills(4, 0.3)]))
      .toEqual({ kind: 'partial', cleared: 1, target: 3 })
  })

  it('reports done, and done outranks everything else', () => {
    expect(classify(drills(3, 0.95))).toEqual({ kind: 'done' })
    // Even a locked stage reads as done if the work is there — losing Pro
    // should not retract an achievement.
    expect(stageEffort(deriveStageProgress(stage('true-count'), Array.from(
      { length: 3 }, () => session('deckEstimation', 0.9)), [], false))).toEqual({ kind: 'done' })
  })

  it('reports locked before effort, since the drill cannot be opened', () => {
    expect(stageEffort(deriveStageProgress(stage('true-count'), [], [], false)))
      .toEqual({ kind: 'locked' })
  })

  it('covers every stage and every learner without throwing', () => {
    for (const s of CURRICULUM) {
      for (const isPro of [true, false]) {
        for (const sessions of [[], drills(1, 0.4), drills(9, 0.99)]) {
          expect(stageEffort(deriveStageProgress(s, sessions, [], isPro)).kind).toBeTruthy()
        }
      }
    }
  })
})
