import { describe, it, expect, beforeEach } from 'vitest'
import i18next from 'i18next'
import {
  CURRICULUM,
  deriveCurriculum,
  deriveStageProgress,
  currentStage,
  nextUnlockedStage,
  stageIndex,
  drillDescription, stageNeedsPro,
  getPlacement,
  setPlacement,
  getReadStages,
  markStageRead,
  setReadStages,
  claimedStageIds,
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

/** A session each drill stage counts, by stage. */
const DRILL_SESSION: Partial<Record<StageId, { mode: TrainingMode; details?: unknown }>> = {
  'basic-strategy': { mode: 'deviationFlashCards' },
  'hi-lo': { mode: 'speedDrill' },
  'true-count': { mode: 'deckEstimation' },
  deviations: {
    mode: 'deviationFlashCards',
    details: { type: 'deviationFlashCards', perDeviation: { '16 vs 10': { correct: 3, incorrect: 0 } } },
  },
  'bet-spread': { mode: 'betSpread' },
  table: { mode: 'casinoSession' },
}

/** 10:00 UTC on the n-th day of March 2026 — a different local day for every n, in any timezone. */
const onDay = (n: number) => `2026-03-${String(n).padStart(2, '0')}T10:00:00.000Z`

/**
 * `count` qualifying runs of a stage's drill, dealt round-robin over `days`
 * different calendar days.
 */
function runs(id: StageId, count: number, days: number, accuracy = 0.95): TrainingSessionResult[] {
  const kind = DRILL_SESSION[id]!
  const out = Array.from({ length: count }, (_, i) => ({
    ...session(kind.mode, accuracy, kind.details),
    timestamp: onDay(1 + (i % days)),
  }))
  // A helper that built sessions the stage ignores would make every test
  // below pass or fail for the wrong reason.
  if (!out.every(stage(id).drill!.counts)) throw new Error(`sessions do not count towards ${id}`)
  return out
}

/**
 * Exactly what a stage asks for: its own `minSessions`, on its own `minDays`.
 * Read from the curriculum, so a changed bar moves the tests with it.
 */
const finishing = (id: StageId, accuracy = 0.95) =>
  runs(id, stage(id).drill!.minSessions, stage(id).drill!.minDays, accuracy)

describe('CURRICULUM shape', () => {
  it('is ordered along the real dependency chain', () => {
    // You cannot size bets by a count you can't keep.
    const order: StageId[] = ['rules', 'basic-strategy', 'hi-lo', 'true-count', 'deviations', 'bet-spread', 'table']
    expect(CURRICULUM.map(s => s.id)).toEqual(order)
  })

  it('gives every stage a goal and a reason to care', () => {
    // Resolved through the messages: the stage now holds keys, and a key with
    // no message would otherwise pass this as a perfectly long string.
    for (const s of CURRICULUM) {
      expect(i18next.t(s.goalKey).length, s.id).toBeGreaterThan(20)
      expect(i18next.t(s.whyKey).length, s.id).toBeGreaterThan(20)
      expect(i18next.t(s.titleKey), s.id).not.toBe(s.titleKey)
    }
  })

  it('states each drill requirement with the numbers it actually enforces', () => {
    // The sentence used to be typed out beside the thresholds, so the two
    // could drift. It is interpolated now — this is what holds that.
    for (const s of CURRICULUM) {
      if (!s.drill) continue
      const text = drillDescription(s.drill, i18next.t)
      expect(text, s.id).toContain(String(s.drill.minSessions))
      // The days are part of the promise now, and have to be in the sentence.
      expect(text, s.id).toContain(`${s.drill.minDays} different days`)
      if (s.drill.minAccuracy > 0) {
        expect(text, s.id).toContain(String(Math.round(s.drill.minAccuracy * 100)))
      }
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

  it('completes once enough qualifying sessions exist on enough different days', () => {
    const { minSessions, minDays } = stage('hi-lo').drill!
    const p = deriveStageProgress(stage('hi-lo'), finishing('hi-lo'), [], true)
    expect(p.done).toBe(true)
    expect(p.current).toBe(minSessions)
    expect(p.target).toBe(minSessions)
    expect(p.days).toBe(minDays)
    expect(p.targetDays).toBe(minDays)
  })

  it('is not done one session short, however well the days are spread', () => {
    const { minSessions, minDays } = stage('hi-lo').drill!
    const p = deriveStageProgress(stage('hi-lo'), runs('hi-lo', minSessions - 1, minDays), [], true)
    expect(p.done).toBe(false)
    expect(p.current).toBe(minSessions - 1)
    expect(p.days).toBe(minDays)
  })

  it('ignores sessions from a different mode', () => {
    const p = deriveStageProgress(stage('hi-lo'), repeat(9, () => session('betSpread', 1)), [], true)
    expect(p.current).toBe(0)
  })

  it('counts a flashcards session towards deviations only if it contained deviations', () => {
    // Same number, same days, same accuracy — the only difference is whether
    // a deviation was ever asked.
    const real = finishing('deviations')
    const plain = real.map(s => ({
      ...s,
      details: { type: 'deviationFlashCards', perDeviation: {} },
    })) as unknown as TrainingSessionResult[]
    expect(deriveStageProgress(stage('deviations'), plain, [], true).current).toBe(0)
    expect(deriveStageProgress(stage('deviations'), plain, [], true).done).toBe(false)
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
    expect(i18next.t(p.stage.titleKey)).toBeTruthy()
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
    const done = [...finishing('basic-strategy'), ...finishing('hi-lo')]
    expect(currentStage(progress(done, ['rules']), 'rules')?.stage.id).toBe('true-count')
  })

  it('returns null when the whole path is finished', () => {
    // The deviation sessions are flashcards too, and there are at least as
    // many of them on as many days as basic strategy asks for.
    expect(stage('deviations').drill!.minSessions).toBeGreaterThanOrEqual(stage('basic-strategy').drill!.minSessions)
    expect(stage('deviations').drill!.minDays).toBeGreaterThanOrEqual(stage('basic-strategy').drill!.minDays)
    const everything = [
      ...finishing('deviations'),
      ...finishing('hi-lo'),
      ...finishing('true-count'),
      ...finishing('bet-spread'),
      ...finishing('table', 1),
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
    expect(activeStage(finishing('hi-lo'), true)).toBe('true-count')
  })

  it('stays on a stage whose sessions all fell on one day', () => {
    setPlacement('hi-lo')
    const { minSessions } = stage('hi-lo').drill!
    expect(activeStage(runs('hi-lo', minSessions, 1), true)).toBe('hi-lo')
  })

  it('treats a stage already paid as finished, with no sessions at all', () => {
    // The claimed list is read from storage here — the bar was raised on
    // 17 Nov 2026 and nobody may be sent back to a stage they were paid for.
    setPlacement('hi-lo')
    localStorage.setItem('bjt_claimed_stages', JSON.stringify(['hi-lo']))
    expect(activeStage([], true)).toBe('true-count')
  })

  it('never sends a placed learner back below their placement', () => {
    setPlacement('bet-spread')
    expect(activeStage([], true)).toBe('bet-spread')
  })

  it('is null once the whole path is done', () => {
    setPlacement('bet-spread')
    const done = [...finishing('bet-spread', 0.9), ...finishing('table', 1)]
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
    const done = finishing('basic-strategy', 0.9)
    expect(deriveStageProgress(stage('basic-strategy'), done, [], false).done).toBe(true)
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
      .toEqual({ kind: 'partial', cleared: 1, target: stage('hi-lo').drill!.minSessions })
  })

  it('reports done, and done outranks everything else', () => {
    expect(classify(finishing('hi-lo'))).toEqual({ kind: 'done' })
    // Even a locked stage reads as done if the work is there — losing Pro
    // should not retract an achievement.
    expect(stageEffort(deriveStageProgress(stage('true-count'), finishing('true-count', 0.9), [], false)))
      .toEqual({ kind: 'done' })
  })

  it('names the wait when the sessions are there and the days are not', () => {
    // The whole count in one sitting: nothing is missing but the nights.
    const { minSessions, minDays } = stage('hi-lo').drill!
    expect(classify(runs('hi-lo', minSessions, 1)))
      .toEqual({ kind: 'spacing', days: 1, targetDays: minDays, left: minDays - 1 })
    expect(classify(runs('hi-lo', minSessions + 4, minDays - 1)))
      .toEqual({ kind: 'spacing', days: minDays - 1, targetDays: minDays, left: 1 })
  })

  it('still calls it partial while sessions are missing, whatever the days say', () => {
    const { minSessions, minDays } = stage('hi-lo').drill!
    expect(classify(runs('hi-lo', minSessions - 1, minDays)))
      .toEqual({ kind: 'partial', cleared: minSessions - 1, target: minSessions })
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

describe('a stage needs sessions large enough to prove something', () => {
  const short = (mode: TrainingMode, accuracy: number): TrainingSessionResult =>
    ({ ...session(mode, accuracy), totalQuestions: 3, correctAnswers: Math.round(3 * accuracy) })

  it('does not finish a stage on three aborted three-question runs', () => {
    // 13 Nov 2026: three flashcards right, leave, three times — stage done.
    const stage = CURRICULUM.find(s => s.id === 'basic-strategy')!
    // Today's bar in full — enough of them, on enough days — so the only
    // thing wrong with these runs is their size.
    const aborted = finishing('basic-strategy', 1)
      .map(s => ({ ...s, totalQuestions: 3, correctAnswers: 3 }))
      .filter(stage.drill!.counts)
    expect(aborted).toHaveLength(stage.drill!.minSessions)
    const p = deriveStageProgress(stage, aborted, [], true)
    expect(p.done).toBe(false)
    expect(p.current).toBe(0)
    expect(p.days).toBe(0)
    // They still count as practice: the learner tried.
    expect(p.attempts).toBe(aborted.length)
  })

  it('counts a three-answer Speed Drill run — one answer there is a whole shoe counted', () => {
    const stage = CURRICULUM.find(s => s.drill?.mode === 'speedDrill')!
    expect(short('speedDrill', 1).totalQuestions).toBe(3)
    const threeAnswerRuns = finishing('hi-lo', 1).map(s => ({ ...s, totalQuestions: 3, correctAnswers: 3 }))
    const p = deriveStageProgress(stage, threeAnswerRuns, [], true)
    expect(p.current).toBe(stage.drill!.minSessions)
    expect(p.done).toBe(true)
  })
})

describe('a stage has to come back on other days', () => {
  const drillStages = CURRICULUM.filter(s => s.drill)

  it('asks every drill stage for more than one day, and never for more days than sessions', () => {
    for (const s of drillStages) {
      expect(s.drill!.minDays, s.id).toBeGreaterThan(1)
      expect(s.drill!.minDays, s.id).toBeLessThanOrEqual(s.drill!.minSessions)
    }
  })

  it('does not finish any stage in one sitting, however many good runs', () => {
    // 17 Nov 2026: three good runs closed a stage and the whole plan could be
    // walked in an afternoon.
    for (const s of drillStages) {
      const { minSessions, minDays } = s.drill!
      const p = deriveStageProgress(s, runs(s.id, minSessions * 3, 1, 1), [], true)
      expect(p.done, s.id).toBe(false)
      expect(p.current, s.id).toBe(minSessions)
      expect(p.days, s.id).toBe(1)
      expect(stageEffort(p), s.id).toEqual({ kind: 'spacing', days: 1, targetDays: minDays, left: minDays - 1 })
    }
  })

  it('is not done one day short, and done on the day that completes the set', () => {
    for (const s of drillStages) {
      const { minSessions, minDays } = s.drill!
      const short = deriveStageProgress(s, runs(s.id, minSessions, minDays - 1, 1), [], true)
      expect(short.done, s.id).toBe(false)
      expect(short.days, s.id).toBe(minDays - 1)
      expect(deriveStageProgress(s, runs(s.id, minSessions, minDays, 1), [], true).done, s.id).toBe(true)
    }
  })

  it('counts days only from runs that cleared the bar', () => {
    // Five days of trying and one good day is one day, not five.
    const hiLo = stage('hi-lo')
    const { minSessions, minDays } = hiLo.drill!
    const sessions = [
      ...runs('hi-lo', minSessions, 1),
      ...runs('hi-lo', minDays, minDays, 0.5).map((s, i) => ({ ...s, timestamp: onDay(10 + i) })),
    ]
    const p = deriveStageProgress(hiLo, sessions, [], true)
    expect(p.current).toBe(minSessions)
    expect(p.days).toBe(1)
    expect(p.done).toBe(false)
  })

  it('counts two runs on one calendar day as one day', () => {
    // Local noon and an hour later: the same day in every timezone.
    const at = (hour: number) => ({
      ...session('speedDrill', 0.95),
      timestamp: new Date(2026, 2, 5, hour).toISOString(),
    })
    expect(deriveStageProgress(stage('hi-lo'), [at(12), at(13)], [], true).days).toBe(1)
  })

  it('buckets by the local calendar day, not by UTC', () => {
    // Late evening and the next early morning, local time: two days for the
    // learner whatever UTC calls them.
    const evening = { ...session('speedDrill', 0.95), timestamp: new Date(2026, 2, 5, 23, 30).toISOString() }
    const morning = { ...session('speedDrill', 0.95), timestamp: new Date(2026, 2, 6, 0, 30).toISOString() }
    expect(deriveStageProgress(stage('hi-lo'), [evening, morning], [], true).days).toBe(2)
  })

  it('caps the days it reports at the days it asks for', () => {
    const { minSessions, minDays } = stage('hi-lo').drill!
    const p = deriveStageProgress(stage('hi-lo'), runs('hi-lo', minSessions * 2, minDays + 3), [], true)
    expect(p.days).toBe(minDays)
    expect(p.done).toBe(true)
  })

  it('asks a reading stage for no days at all', () => {
    const p = deriveStageProgress(stage('rules'), [], [], true)
    expect(p.targetDays).toBe(0)
    expect(p.days).toBe(0)
  })
})

describe('a stage already paid stays finished', () => {
  beforeEach(() => localStorage.clear())

  it('is done with zero sessions, and reads as full', () => {
    // Raising the bar must never take away something earned.
    const hiLo = stage('hi-lo')
    const p = deriveStageProgress(hiLo, [], [], true, ['hi-lo'])
    expect(p.done).toBe(true)
    expect(p.current).toBe(hiLo.drill!.minSessions)
    expect(p.days).toBe(hiLo.drill!.minDays)
    expect(stageEffort(p)).toEqual({ kind: 'done' })
    // What actually happened is still told straight.
    expect(p.attempts).toBe(0)
    expect(p.best).toBeNull()
  })

  it('stays done under the old bar: three good runs in one sitting', () => {
    const old = runs('hi-lo', 3, 1)
    expect(deriveStageProgress(stage('hi-lo'), old, [], true).done).toBe(false)
    expect(deriveStageProgress(stage('hi-lo'), old, [], true, ['hi-lo']).done).toBe(true)
  })

  it('finishes only the stage that was paid', () => {
    const progress = deriveCurriculum([], [], true, ['hi-lo'])
    expect(progress.filter(p => p.done).map(p => p.stage.id)).toEqual(['hi-lo'])
  })

  it('does not open a Pro stage by having been paid for it', () => {
    const p = deriveStageProgress(stage('true-count'), [], [], false, ['true-count'])
    expect(p.done).toBe(true)
    expect(p.locked).toBe(true)
  })

  it('defaults to nothing claimed', () => {
    expect(deriveCurriculum([], [], true).some(p => p.done)).toBe(false)
  })

  it('reads the claimed list from storage, dropping what is not a stage', () => {
    expect(claimedStageIds()).toEqual([])
    localStorage.setItem('bjt_claimed_stages', JSON.stringify(['hi-lo', 'nonsense', 7, 'rules']))
    expect(claimedStageIds()).toEqual(['hi-lo', 'rules'])
  })

  it('survives a corrupt or mis-shaped claimed list', () => {
    localStorage.setItem('bjt_claimed_stages', '{not json')
    expect(claimedStageIds()).toEqual([])
    localStorage.setItem('bjt_claimed_stages', JSON.stringify({ 'hi-lo': true }))
    expect(claimedStageIds()).toEqual([])
  })
})

describe('setReadStages', () => {
  beforeEach(() => localStorage.clear())

  it('replaces the list, dropping repeats and unknown ids', () => {
    markStageRead('rules')
    setReadStages(['hi-lo', 'hi-lo', 'not-a-stage' as StageId, 'basic-strategy'])
    expect(getReadStages()).toEqual(['hi-lo', 'basic-strategy'])
  })

  it('can be emptied', () => {
    markStageRead('rules')
    setReadStages([])
    expect(getReadStages()).toEqual([])
  })
})
