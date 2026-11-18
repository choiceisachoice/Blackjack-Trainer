import { describe, it, expect } from 'vitest'
import {
  buildDayPlan,
  divideDay,
  deriveWeek,
  weeksToGoal,
  type DayPlan,
  type DayPlanInput,
} from './daily-plan'
import { CURRICULUM, deriveCurriculum, stageIndex, type StageId } from './curriculum'
import { BLOCK_MINUTES, MINUTE_OPTIONS, DAY_OPTIONS, GOAL_OPTIONS, type Goal, type TimeBudget } from './learner-profile'
import { dayKey } from './date-utils'
import type { TrainingMode, TrainingSessionResult } from './stats-types'

// Tuesday 17 November 2026, local time — "today" for every plan below.
const NOW = new Date(2026, 10, 17, 12)
const TODAY = dayKey(NOW)
const MONDAY = dayKey(new Date(2026, 10, 16, 12))

/** Local noon, `daysAgo` days before today. */
const noon = (daysAgo: number) => new Date(2026, 10, 17 - daysAgo, 12).toISOString()

let nextId = 0
function session(mode: TrainingMode, daysAgo: number, accuracy = 0.95, details?: unknown): TrainingSessionResult {
  return {
    id: `s${nextId++}`,
    mode,
    timestamp: noon(daysAgo),
    durationSeconds: 240,
    totalQuestions: 20,
    correctAnswers: Math.round(20 * accuracy),
    accuracy,
    bestStreak: 5,
    details: details ?? { type: mode },
  } as unknown as TrainingSessionResult
}

const DEVIATION_DETAILS = { type: 'deviationFlashCards', perDeviation: { '16 vs 10': { correct: 3, incorrect: 0 } } }

/** A session each drill stage counts. */
const KIND: Partial<Record<StageId, { mode: TrainingMode; details?: unknown }>> = {
  'basic-strategy': { mode: 'deviationFlashCards' },
  'hi-lo': { mode: 'speedDrill' },
  'true-count': { mode: 'deckEstimation' },
  deviations: { mode: 'deviationFlashCards', details: DEVIATION_DETAILS },
  'bet-spread': { mode: 'betSpread' },
  table: { mode: 'casinoSession' },
}

const drillOf = (id: StageId) => CURRICULUM[stageIndex(id)].drill!

/** One run of a stage's drill, `daysAgo` days back. */
function run(id: StageId, daysAgo: number, accuracy = 0.95): TrainingSessionResult {
  const s = session(KIND[id]!.mode, daysAgo, accuracy, KIND[id]!.details)
  if (!drillOf(id).counts(s)) throw new Error(`session does not count towards ${id}`)
  return s
}

/**
 * A stage finished by its own rule — its `minSessions` on its `minDays`
 * different days — with the newest run `daysAgo` days back.
 */
function finished(id: StageId, daysAgo: number): TrainingSessionResult[] {
  const { minSessions, minDays } = drillOf(id)
  return Array.from({ length: minSessions }, (_, i) => run(id, daysAgo + (i % minDays)))
}

interface Scenario {
  placement?: StageId
  goal?: Goal
  isPro?: boolean
  minutes?: TimeBudget['minutesPerDay']
  sessions?: TrainingSessionResult[]
  read?: StageId[]
  claimed?: StageId[]
}

function input(s: Scenario = {}): DayPlanInput {
  const isPro = s.isPro ?? true
  const sessions = s.sessions ?? []
  return {
    progress: deriveCurriculum(sessions, s.read ?? [], isPro, s.claimed ?? []),
    placement: s.placement ?? 'hi-lo',
    goal: s.goal ?? 'serious',
    isPro,
    budget: { daysPerWeek: 3, minutesPerDay: s.minutes ?? 20 },
    sessions,
    today: TODAY,
  }
}

const plan = (s: Scenario = {}) => buildDayPlan(input(s))

/** The day as `kind:stage` strings, in order — the shape most tests read. */
const shape = (day: DayPlan) => day.blocks.map(b => `${b.kind}:${b.stage}`)
const kinds = (day: DayPlan, kind: string) => day.blocks.filter(b => b.kind === kind)

describe('divideDay', () => {
  it('gives a ten-minute day to the work alone', () => {
    // Two slots: a third of them is no slot, and the work is what the day is for.
    expect(divideDay(10, false, true)).toEqual({ work: 2, warmup: 0, table: 0 })
    expect(divideDay(10, false, false)).toEqual({ work: 2, warmup: 0, table: 0 })
  })

  it('gives one slot in three to the warm-up', () => {
    expect(divideDay(20, false, true)).toEqual({ work: 3, warmup: 1, table: 0 })
    expect(divideDay(30, false, true)).toEqual({ work: 4, warmup: 2, table: 0 })
    expect(divideDay(60, false, true)).toEqual({ work: 8, warmup: 4, table: 0 })
  })

  it('gives everything to the work when there is nothing earlier to warm up on', () => {
    expect(divideDay(20, false, false)).toEqual({ work: 4, warmup: 0, table: 0 })
    expect(divideDay(30, false, false)).toEqual({ work: 6, warmup: 0, table: 0 })
    expect(divideDay(60, false, false)).toEqual({ work: 12, warmup: 0, table: 0 })
  })

  it('seats the table only on a day long enough to leave real work beside it', () => {
    expect(divideDay(10, true, true).table).toBe(0)
    expect(divideDay(20, true, true).table).toBe(0)
    expect(divideDay(30, true, true)).toEqual({ work: 2, warmup: 1, table: 1 })
    expect(divideDay(60, true, true)).toEqual({ work: 6, warmup: 3, table: 1 })
  })

  it('seats the table without a warm-up when there is nothing to warm up on', () => {
    expect(divideDay(30, true, false)).toEqual({ work: 3, warmup: 0, table: 1 })
    expect(divideDay(60, true, false)).toEqual({ work: 9, warmup: 0, table: 1 })
  })

  it('leaves a short day unchanged by a table it cannot seat', () => {
    expect(divideDay(20, true, true)).toEqual(divideDay(20, false, true))
    expect(divideDay(10, true, false)).toEqual(divideDay(10, false, false))
  })

  it('spends exactly the minutes it was given, for every length on offer', () => {
    for (const minutes of MINUTE_OPTIONS) {
      for (const withTable of [true, false]) {
        for (const hasReview of [true, false]) {
          const { work, warmup, table } = divideDay(minutes, withTable, hasReview)
          const label = `${minutes}/${withTable}/${hasReview}`
          expect((work + warmup) * BLOCK_MINUTES + table * 15, label).toBe(minutes)
          expect(work, label).toBeGreaterThanOrEqual(1)
          expect(work, label).toBeGreaterThan(warmup)
        }
      }
    }
  })

  it('never returns an empty day, whatever it is handed', () => {
    for (const minutes of [0, 3, 5, -10]) {
      expect(divideDay(minutes, true, true), String(minutes)).toEqual({ work: 1, warmup: 0, table: 0 })
    }
  })
})

describe('buildDayPlan — cut to the time there is', () => {
  it('makes ten minutes a short day: the reading and one run', () => {
    const day = plan({ placement: 'hi-lo', minutes: 10 })
    expect(shape(day)).toEqual(['read:hi-lo', 'work:hi-lo'])
    expect(day.minutes).toBe(10)
  })

  it('makes sixty minutes a long one', () => {
    const day = plan({ placement: 'hi-lo', minutes: 60 })
    expect(day.minutes).toBe(60)
    expect(day.blocks).toHaveLength(60 / BLOCK_MINUTES)
    // One earlier stage only, so one warm-up: a second run of the same drill
    // would be the same row twice, and the stage on turn gets those minutes.
    expect(kinds(day, 'warmup')).toHaveLength(1)
    expect(kinds(day, 'read')).toHaveLength(1)
    expect(kinds(day, 'work')).toHaveLength(10)
  })

  it('grows with the minutes and never shrinks', () => {
    for (const placement of CURRICULUM.map(s => s.id)) {
      const lengths = MINUTE_OPTIONS.map(minutes => plan({ placement, minutes }).minutes)
      for (let i = 1; i < lengths.length; i++) {
        expect(lengths[i], `${placement} at ${MINUTE_OPTIONS[i]}`).toBeGreaterThanOrEqual(lengths[i - 1])
      }
    }
  })

  it('never plans more minutes than the learner said they have', () => {
    for (const placement of CURRICULUM.map(s => s.id)) {
      for (const isPro of [true, false]) {
        for (const goal of GOAL_OPTIONS.map(o => o.value)) {
          for (const minutes of MINUTE_OPTIONS) {
            const day = plan({ placement, isPro, goal, minutes })
            const label = `${placement}/${isPro ? 'pro' : 'free'}/${goal}/${minutes}`
            // No exception: a ten-minute day whose work is the table gets a
            // ten-minute sit, not the full fifteen it used to be handed.
            expect(day.minutes, label).toBeLessThanOrEqual(minutes)
            expect(day.minutes, label).toBe(day.blocks.reduce((n, b) => n + b.minutes, 0))
          }
        }
      }
    }
  })

  it('uses the whole budget once there is a drill to fill it with', () => {
    // From Hi-Lo on there is always an earlier stage to warm up on and a
    // drill to run, so nothing of the day is left unplanned.
    for (const minutes of MINUTE_OPTIONS) {
      expect(plan({ placement: 'hi-lo', minutes }).minutes, String(minutes)).toBe(minutes)
      expect(plan({ placement: 'true-count', minutes }).minutes, String(minutes)).toBe(minutes)
    }
  })

  it('gives every block a length in whole slots and an id of its own', () => {
    for (const minutes of MINUTE_OPTIONS) {
      const day = plan({ placement: 'true-count', minutes })
      expect(new Set(day.blocks.map(b => b.id)).size).toBe(day.blocks.length)
      for (const b of day.blocks) {
        expect(b.minutes % BLOCK_MINUTES).toBe(0)
        expect(b.minutes).toBeGreaterThan(0)
      }
    }
  })

  it('does not depend on the days a week — that answer cuts the week, not the day', () => {
    const base = input({ placement: 'true-count', minutes: 30 })
    const once = buildDayPlan({ ...base, budget: { daysPerWeek: 1, minutesPerDay: 30 } })
    const daily = buildDayPlan({ ...base, budget: { daysPerWeek: 7, minutesPerDay: 30 } })
    expect(shape(once)).toEqual(shape(daily))
  })
})

describe('buildDayPlan — today’s work', () => {
  it('belongs to the stage the learner is on', () => {
    const day = plan({ placement: 'hi-lo' })
    expect(day.focus).toBe('hi-lo')
    expect(day.lockedFocus).toBeNull()
    for (const b of kinds(day, 'work')) {
      expect(b.stage).toBe('hi-lo')
      expect(b.mode).toBe(drillOf('hi-lo').mode)
    }
  })

  it('moves on with the learner', () => {
    const day = plan({ placement: 'hi-lo', sessions: finished('hi-lo', 1) })
    expect(day.focus).toBe('true-count')
    expect(kinds(day, 'work').every(b => b.stage === 'true-count')).toBe(true)
  })

  it('stays on a stage that was drilled to the full count in one sitting', () => {
    const { minSessions } = drillOf('hi-lo')
    const cram = Array.from({ length: minSessions }, () => run('hi-lo', 1))
    expect(plan({ placement: 'hi-lo', sessions: cram }).focus).toBe('hi-lo')
  })

  it('skips a stage that was already paid for', () => {
    expect(plan({ placement: 'hi-lo', claimed: ['hi-lo'] }).focus).toBe('true-count')
  })

  it('never reaches past the goal', () => {
    // "Curious" ends at the true count.
    const done = [...finished('true-count', 1)]
    const day = plan({ placement: 'true-count', goal: 'curious', sessions: done })
    expect(day.focus).toBeNull()
    expect(day.lockedFocus).toBeNull()
    // No block is *work* on a stage beyond the goal. (Warm-ups are another
    // matter and are reported separately: see the report for this change.)
    expect(kinds(day, 'work')).toEqual([])
    expect(kinds(day, 'read')).toEqual([])
  })

  it('keeps the older stages sharp once the goal is reached, a different one each', () => {
    const done = [...finished('true-count', 1)]
    const day = plan({ placement: 'true-count', goal: 'curious', sessions: done, minutes: 20 })
    expect(day.blocks.length).toBeGreaterThan(0)
    expect(day.blocks.every(b => b.kind === 'warmup')).toBe(true)
    expect(new Set(day.blocks.map(b => b.stage)).size).toBeGreaterThan(1)
    expect(day.minutes).toBe(20)
  })

  it('has nothing to drill for a stage that is reading only', () => {
    const day = plan({ placement: 'rules' })
    expect(shape(day)).toEqual(['read:rules'])
    expect(day.blocks[0].mode).toBe('learn')
    expect(day.focus).toBe('rules')
    expect(day.next).toEqual(day.blocks[0])
  })
})

describe('buildDayPlan — the reading block', () => {
  it('comes before the first run of a stage', () => {
    const day = plan({ placement: 'hi-lo' })
    const read = day.blocks.findIndex(b => b.kind === 'read')
    const work = day.blocks.findIndex(b => b.kind === 'work')
    expect(read).toBeGreaterThanOrEqual(0)
    expect(read).toBeLessThan(work)
    expect(day.blocks[read]).toMatchObject({ stage: 'hi-lo', mode: 'learn', minutes: BLOCK_MINUTES, done: false })
  })

  it('takes its slot from the work, not on top of it', () => {
    const first = plan({ placement: 'hi-lo', minutes: 20 })
    expect(first.minutes).toBe(20)
    expect(kinds(first, 'work')).toHaveLength(2)
  })

  it('is gone after the first run, and the slot goes back to the work', () => {
    // Any run counts — the first attempt does not have to clear the bar.
    const day = plan({ placement: 'hi-lo', minutes: 20, sessions: [run('hi-lo', 3, 0.4)] })
    expect(kinds(day, 'read')).toEqual([])
    expect(kinds(day, 'work')).toHaveLength(3)
    expect(day.minutes).toBe(20)
  })

  it('is not offered for a stage that has no reading', () => {
    expect(CURRICULUM[stageIndex('bet-spread')].read).toBeUndefined()
    expect(kinds(plan({ placement: 'bet-spread' }), 'read')).toEqual([])
  })

  it('is only ever about the stage being worked on', () => {
    for (const placement of CURRICULUM.map(s => s.id)) {
      const day = plan({ placement })
      for (const b of kinds(day, 'read')) expect(b.stage, placement).toBe(day.focus)
    }
  })
})

describe('buildDayPlan — the warm-up', () => {
  it('opens the day', () => {
    const day = plan({ placement: 'true-count' })
    expect(day.blocks[0].kind).toBe('warmup')
    expect(day.blocks[0].minutes).toBe(BLOCK_MINUTES)
  })

  it('picks the earlier stage that has gone longest without practice', () => {
    const sessions = [run('basic-strategy', 9), run('hi-lo', 2)]
    expect(plan({ placement: 'true-count', sessions }).blocks[0]).toMatchObject({
      kind: 'warmup', stage: 'basic-strategy', mode: drillOf('basic-strategy').mode,
    })

    const other = [run('basic-strategy', 2), run('hi-lo', 9)]
    expect(plan({ placement: 'true-count', sessions: other }).blocks[0]).toMatchObject({
      kind: 'warmup', stage: 'hi-lo', mode: drillOf('hi-lo').mode,
    })
  })

  it('goes by the newest run of each stage, not the oldest', () => {
    const sessions = [run('basic-strategy', 30), run('basic-strategy', 1), run('hi-lo', 5)]
    expect(plan({ placement: 'true-count', sessions }).blocks[0].stage).toBe('hi-lo')
  })

  it('changes once that stage has been practised', () => {
    const before = [run('basic-strategy', 9), run('hi-lo', 2)]
    expect(plan({ placement: 'true-count', sessions: before }).blocks[0].stage).toBe('basic-strategy')

    // Yesterday the warm-up was done: a different old stage comes round.
    const after = [...before, run('basic-strategy', 1)]
    expect(plan({ placement: 'true-count', sessions: after }).blocks[0].stage).toBe('hi-lo')
  })

  it('puts a stage that was never practised first — the placement skipped it', () => {
    const sessions = [run('hi-lo', 40)]
    expect(plan({ placement: 'true-count', sessions }).blocks[0].stage).toBe('basic-strategy')
  })

  it('never warms up on the stage being worked on, or on one further along', () => {
    for (const placement of CURRICULUM.map(s => s.id)) {
      for (const minutes of MINUTE_OPTIONS) {
        const day = plan({ placement, minutes })
        const focus = stageIndex(day.focus!)
        for (const b of kinds(day, 'warmup')) {
          expect(stageIndex(b.stage), `${placement}/${minutes}`).toBeLessThan(focus)
        }
      }
    }
  })

  it('never warms up on a drill the learner cannot open, or on the table', () => {
    for (const placement of CURRICULUM.map(s => s.id)) {
      const day = plan({ placement, isPro: false, minutes: 60 })
      for (const b of kinds(day, 'warmup')) {
        expect(b.stage, placement).not.toBe('true-count')
        expect(b.stage, placement).not.toBe('bet-spread')
        expect(b.mode, placement).not.toBe('casinoSession')
      }
    }
    for (const b of kinds(plan({ placement: 'table', isPro: true, minutes: 60 }), 'warmup')) {
      expect(b.mode).not.toBe('casinoSession')
    }
  })

  it('is left out when there is nothing behind the learner to warm up on', () => {
    expect(kinds(plan({ placement: 'basic-strategy', minutes: 60 }), 'warmup')).toEqual([])
  })

  it('gives the spare warm-up slots to the stage on turn when only one earlier stage exists', () => {
    // Hi-Lo has basic strategy behind it and nothing else. Thirty minutes is
    // two warm-up slots: one is the warm-up, the other goes to the work.
    const day = plan({ placement: 'hi-lo', minutes: 30, sessions: [run('hi-lo', 6, 0.5)] })
    expect(shape(day)).toEqual([
      'warmup:basic-strategy', 'work:hi-lo', 'work:hi-lo', 'work:hi-lo', 'work:hi-lo', 'work:hi-lo',
    ])
    expect(day.minutes).toBe(30)
  })

  it('repeats the one earlier stage only when there is no drill on turn to give the time to', () => {
    // A free learner whose goal ends at the locked true count, with a single
    // open stage finished behind them: nothing to work on, one thing to keep.
    const day = plan({ placement: 'basic-strategy', goal: 'curious', isPro: false, minutes: 20,
      sessions: [...finished('basic-strategy', 1), ...finished('hi-lo', 1)] })
    expect(day.focus).toBeNull()
    expect(day.blocks.length).toBeGreaterThan(0)
    expect(day.blocks.every(b => b.kind === 'warmup')).toBe(true)
  })

  it('spreads a long day’s warm-ups over different stages', () => {
    const day = plan({ placement: 'deviations', minutes: 60 })
    const warm = kinds(day, 'warmup').map(b => b.stage)
    expect(warm.length).toBeGreaterThan(1)
    expect(new Set(warm).size).toBeGreaterThan(1)
  })
})

describe('buildDayPlan — a free learner at a Pro stage', () => {
  it('says which stage is locked and builds the day from the next open one', () => {
    // True count is Pro; deviations, right behind it, is not.
    const day = plan({ placement: 'true-count', isPro: false })
    expect(day.lockedFocus).toBe('true-count')
    expect(day.focus).toBe('deviations')
    const work = kinds(day, 'work')
    expect(work.length).toBeGreaterThan(0)
    for (const b of work) {
      expect(b.stage).toBe('deviations')
      expect(b.mode).toBe(drillOf('deviations').mode)
    }
  })

  it('plans nothing on the locked stage itself', () => {
    for (const minutes of MINUTE_OPTIONS) {
      const day = plan({ placement: 'true-count', isPro: false, minutes })
      expect(day.blocks.some(b => b.stage === 'true-count'), String(minutes)).toBe(false)
      expect(day.blocks.some(b => b.mode === drillOf('true-count').mode), String(minutes)).toBe(false)
    }
  })

  it('still gives the day its full length', () => {
    for (const minutes of MINUTE_OPTIONS) {
      expect(plan({ placement: 'true-count', isPro: false, minutes }).minutes, String(minutes)).toBe(minutes)
    }
  })

  it('falls back to keeping the open stages sharp when nothing open is left inside the goal', () => {
    // "Curious" ends at the true count itself, so there is no open stage to
    // move the work to.
    const day = plan({ placement: 'true-count', isPro: false, goal: 'curious' })
    expect(day.lockedFocus).toBe('true-count')
    expect(day.focus).toBeNull()
    expect(day.blocks.length).toBeGreaterThan(0)
    expect(day.blocks.every(b => b.kind === 'warmup')).toBe(true)
    expect(day.blocks.some(b => b.stage === 'basic-strategy')).toBe(true)
    expect(day.blocks.some(b => b.stage === 'hi-lo')).toBe(true)
  })

  it('never seats a free learner at the table', () => {
    for (const placement of CURRICULUM.map(s => s.id)) {
      const day = plan({ placement, isPro: false, minutes: 60 })
      expect(day.blocks.some(b => b.kind === 'table' || b.mode === 'casinoSession'), placement).toBe(false)
    }
  })

  it('has no locked stage to report for Pro', () => {
    for (const placement of CURRICULUM.map(s => s.id)) {
      expect(plan({ placement, isPro: true }).lockedFocus, placement).toBeNull()
    }
  })

  it('has no locked stage to report while the stage on turn is free', () => {
    expect(plan({ placement: 'hi-lo', isPro: false })).toMatchObject({ lockedFocus: null, focus: 'hi-lo' })
  })
})

describe('buildDayPlan — the table', () => {
  it('closes the day for Pro once counting is in place', () => {
    const day = plan({ placement: 'true-count', minutes: 30 })
    const last = day.blocks[day.blocks.length - 1]
    expect(last).toMatchObject({ kind: 'table', stage: 'table', mode: 'casinoSession', minutes: 15 })
    expect(kinds(day, 'table')).toHaveLength(1)
    // Real work beside it, and the day still adds up.
    expect(kinds(day, 'work').length).toBeGreaterThan(0)
    expect(day.minutes).toBe(30)
  })

  it('is there on a sixty-minute day too, once', () => {
    const day = plan({ placement: 'deviations', minutes: 60 })
    expect(kinds(day, 'table')).toHaveLength(1)
    expect(day.minutes).toBe(60)
  })

  it('is there once Hi-Lo is finished by drilling, not only by placement', () => {
    const day = plan({ placement: 'hi-lo', minutes: 30, sessions: finished('hi-lo', 1) })
    expect(day.focus).toBe('true-count')
    expect(kinds(day, 'table')).toHaveLength(1)
  })

  it('waits until the count can be kept', () => {
    for (const placement of ['rules', 'basic-strategy', 'hi-lo'] as const) {
      expect(kinds(plan({ placement, minutes: 60 }), 'table'), placement).toEqual([])
    }
  })

  it('is left off a day too short to hold it', () => {
    expect(kinds(plan({ placement: 'true-count', minutes: 10 }), 'table')).toEqual([])
    expect(kinds(plan({ placement: 'true-count', minutes: 20 }), 'table')).toEqual([])
  })

  it('is the work itself on the last stage, in whole sits', () => {
    const half = plan({ placement: 'table', minutes: 30 })
    expect(half.focus).toBe('table')
    expect(kinds(half, 'work')).toEqual([])
    expect(kinds(half, 'table')).toHaveLength(1)

    const hour = plan({ placement: 'table', minutes: 60 })
    expect(kinds(hour, 'table')).toHaveLength(2)
    for (const b of kinds(hour, 'table')) expect(b).toMatchObject({ stage: 'table', minutes: 15 })
    expect(hour.minutes).toBeLessThanOrEqual(60)
  })

  it('stays on the day for a Pro learner whose goal is reached', () => {
    const day = plan({ placement: 'true-count', goal: 'curious', minutes: 30, sessions: finished('true-count', 1) })
    expect(day.focus).toBeNull()
    expect(kinds(day, 'table')).toHaveLength(1)
    expect(day.minutes).toBe(30)
  })
})

describe('buildDayPlan — what is already done today', () => {
  // A run from last week, so the reading block is out of the picture.
  const earlier = run('hi-lo', 7, 0.5)

  it('starts a day with nothing done', () => {
    const day = plan({ placement: 'hi-lo', sessions: [earlier] })
    expect(day.blocks.every(b => !b.done)).toBe(true)
    expect(day.doneMinutes).toBe(0)
    expect(day.complete).toBe(false)
    expect(day.next).toEqual(day.blocks[0])
  })

  it('marks exactly one matching block for one session recorded today', () => {
    const day = plan({ placement: 'hi-lo', sessions: [earlier, run('hi-lo', 0)] })
    const work = kinds(day, 'work')
    expect(work).toHaveLength(3)
    expect(work.filter(b => b.done)).toHaveLength(1)
    expect(day.blocks.filter(b => b.done)).toHaveLength(1)
    expect(day.doneMinutes).toBe(BLOCK_MINUTES)
  })

  it('needs two sessions for two blocks — each session counts once', () => {
    const day = plan({ placement: 'hi-lo', sessions: [earlier, run('hi-lo', 0), run('hi-lo', 0)] })
    expect(kinds(day, 'work').filter(b => b.done)).toHaveLength(2)
    expect(day.doneMinutes).toBe(2 * BLOCK_MINUTES)
  })

  it('counts a run that missed the bar: the block asks for the work, not the result', () => {
    const day = plan({ placement: 'hi-lo', sessions: [earlier, run('hi-lo', 0, 0.3)] })
    expect(kinds(day, 'work').filter(b => b.done)).toHaveLength(1)
  })

  it('does not count yesterday’s session', () => {
    const day = plan({ placement: 'hi-lo', sessions: [earlier, run('hi-lo', 1)] })
    expect(day.blocks.some(b => b.done)).toBe(false)
  })

  it('does not count a session of a drill no block asks for', () => {
    const day = plan({ placement: 'hi-lo', sessions: [earlier, session('betSpread', 0)] })
    expect(day.blocks.some(b => b.done)).toBe(false)
  })

  it('does not count more blocks than there are', () => {
    const many = Array.from({ length: 9 }, () => run('hi-lo', 0))
    const day = plan({ placement: 'hi-lo', sessions: [earlier, ...many] })
    expect(kinds(day, 'work').every(b => b.done)).toBe(true)
    expect(day.doneMinutes).toBeLessThanOrEqual(day.minutes)
  })

  it('points at the first block still open', () => {
    const day = plan({ placement: 'hi-lo', sessions: [earlier, run('basic-strategy', 0)] })
    expect(day.blocks[0]).toMatchObject({ kind: 'warmup', stage: 'basic-strategy', done: true })
    expect(day.next).toEqual(day.blocks[1])
    expect(day.next?.kind).toBe('work')
  })

  it('is complete when every block is covered, and then points nowhere', () => {
    const sessions = [earlier, run('basic-strategy', 0), run('hi-lo', 0), run('hi-lo', 0), run('hi-lo', 0)]
    const day = plan({ placement: 'hi-lo', sessions })
    expect(day.blocks.every(b => b.done)).toBe(true)
    expect(day.complete).toBe(true)
    expect(day.next).toBeNull()
    expect(day.doneMinutes).toBe(day.minutes)
  })

  it('marks a sit at the table from a Casino Session played today', () => {
    const sessions = [run('true-count', 5, 0.5), run('table', 0)]
    const day = plan({ placement: 'true-count', minutes: 30, sessions })
    expect(kinds(day, 'table')).toHaveLength(1)
    expect(kinds(day, 'table')[0].done).toBe(true)
    expect(day.doneMinutes).toBe(15)
  })

  it('reads "today" from what it is told, not from the clock', () => {
    const base = input({ placement: 'hi-lo', sessions: [earlier, run('hi-lo', 1)] })
    const yesterday = dayKey(new Date(2026, 10, 16, 12))
    expect(buildDayPlan({ ...base, today: yesterday }).doneMinutes).toBe(BLOCK_MINUTES)
    expect(buildDayPlan({ ...base, today: TODAY }).doneMinutes).toBe(0)
  })
})

describe('deriveWeek', () => {
  const budget = (daysPerWeek: number): TimeBudget => ({ daysPerWeek, minutesPerDay: 20 })
  const on = (daysAgo: number, hour = 12) => ({ timestamp: new Date(2026, 10, 17 - daysAgo, hour).toISOString() })

  it('shows an untouched week', () => {
    expect(deriveWeek([], budget(3), MONDAY, TODAY)).toEqual({
      target: 3,
      trained: 0,
      met: false,
      days: [false, false, false, false, false, false, false],
      todayIndex: 1, // Tuesday
    })
  })

  it('counts different days, not sessions', () => {
    // Three runs on Monday and one today: two training days.
    const week = deriveWeek([on(1, 9), on(1, 13), on(1, 20), on(0)], budget(3), MONDAY, TODAY)
    expect(week.trained).toBe(2)
    expect(week.days).toEqual([true, true, false, false, false, false, false])
  })

  it('marks today, wherever in the week it falls', () => {
    for (let i = 0; i < 7; i++) {
      const today = dayKey(new Date(2026, 10, 16 + i, 12))
      expect(deriveWeek([], budget(3), MONDAY, today).todayIndex, today).toBe(i)
    }
  })

  it('leaves out last week and next week', () => {
    const sunday = on(2) // 15 November, the day before this week began
    const nextMonday = { timestamp: new Date(2026, 10, 23, 12).toISOString() }
    const week = deriveWeek([sunday, nextMonday], budget(3), MONDAY, TODAY)
    expect(week.trained).toBe(0)
    expect(week.days.some(Boolean)).toBe(false)
  })

  it('counts a late-evening session on the day the learner trained', () => {
    const lateMonday = { timestamp: new Date(2026, 10, 16, 23, 45).toISOString() }
    const earlyMonday = { timestamp: new Date(2026, 10, 16, 0, 15).toISOString() }
    expect(deriveWeek([lateMonday], budget(1), MONDAY, TODAY).days[0]).toBe(true)
    expect(deriveWeek([earlyMonday], budget(1), MONDAY, TODAY).days[0]).toBe(true)
  })

  it('is met on the day the planned number of days is reached, and not before', () => {
    const sessions = [on(1), on(0)]
    expect(deriveWeek(sessions, budget(3), MONDAY, TODAY).met).toBe(false)
    expect(deriveWeek(sessions, budget(2), MONDAY, TODAY).met).toBe(true)
    expect(deriveWeek(sessions, budget(1), MONDAY, TODAY).met).toBe(true)
  })

  it('carries the learner’s own number as the target', () => {
    for (const d of DAY_OPTIONS) {
      expect(deriveWeek([], budget(d), MONDAY, TODAY).target).toBe(d)
    }
  })

  it('covers a week that crosses a month end', () => {
    // Monday 30 November to Sunday 6 December 2026.
    const monday = dayKey(new Date(2026, 10, 30, 12))
    const thursday = { timestamp: new Date(2026, 11, 3, 12).toISOString() }
    const week = deriveWeek([thursday], budget(3), monday, dayKey(new Date(2026, 11, 3, 12)))
    expect(week.days).toEqual([false, false, false, true, false, false, false])
    expect(week.todayIndex).toBe(3)
  })
})

describe('weeksToGoal', () => {
  const fresh = deriveCurriculum([], [], true)
  const weeks = (daysPerWeek: number, minutesPerDay: TimeBudget['minutesPerDay'], placement: StageId = 'rules', goal: Goal = 'serious') =>
    weeksToGoal(fresh, placement, goal, { daysPerWeek, minutesPerDay })

  it('grows as the days a week shrink', () => {
    for (const minutes of MINUTE_OPTIONS) {
      for (let d = 2; d <= 7; d++) {
        expect(weeks(d - 1, minutes), `${d - 1} vs ${d} days at ${minutes}`).toBeGreaterThanOrEqual(weeks(d, minutes))
      }
      expect(weeks(1, minutes), String(minutes)).toBeGreaterThan(weeks(7, minutes))
    }
  })

  it('grows as the minutes a day shrink', () => {
    for (const d of DAY_OPTIONS) {
      for (let i = 1; i < MINUTE_OPTIONS.length; i++) {
        expect(weeks(d, MINUTE_OPTIONS[i - 1]), `${d} days, ${MINUTE_OPTIONS[i - 1]} vs ${MINUTE_OPTIONS[i]}`)
          .toBeGreaterThanOrEqual(weeks(d, MINUTE_OPTIONS[i]))
      }
    }
  })

  it('is shortened by longer days where sessions, not days, are what is missing', () => {
    // One good run on each of the days the true count asks for: the days are
    // all there, half the sessions are not. Now the minutes decide.
    const { minSessions, minDays } = drillOf('true-count')
    const spreadThin = Array.from({ length: minDays }, (_, i) => run('true-count', 1 + i))
    const progress = deriveCurriculum(spreadThin, [], true)
    const left = minSessions - minDays
    expect(left).toBeGreaterThan(2)
    const at = (minutesPerDay: TimeBudget['minutesPerDay']) =>
      weeksToGoal(progress, 'true-count', 'curious', { daysPerWeek: 1, minutesPerDay })
    // Ten minutes is two runs a day; an hour holds all of them. The estimate
    // allows for one run in three missing the bar.
    expect(at(10)).toBe(Math.ceil((left * 1.5) / 2))
    expect(at(60)).toBe(1)
    expect(at(10)).toBeGreaterThan(at(60))
  })

  it('cannot be bought down below the days every stage asks for', () => {
    // An hour every day: the sessions fit easily, the nights in between do not.
    const days = CURRICULUM.reduce((n, s) => n + (s.drill?.minDays ?? 0), 0)
    expect(weeks(7, 60)).toBe(Math.ceil(days / 7))
    for (const d of DAY_OPTIONS) {
      for (const m of MINUTE_OPTIONS) {
        expect(weeks(d, m) * d, `${d}/${m}`).toBeGreaterThanOrEqual(days)
      }
    }
  })

  it('is longer for a bigger goal and shorter for a later start', () => {
    expect(weeks(3, 20, 'rules', 'curious')).toBeLessThan(weeks(3, 20, 'rules', 'serious'))
    expect(weeks(3, 20, 'bet-spread', 'serious')).toBeLessThan(weeks(3, 20, 'rules', 'serious'))
  })

  it('is 0 at the goal', () => {
    const done = CURRICULUM.filter(s => s.drill).flatMap(s => finished(s.id, 1))
    const all = deriveCurriculum(done, ['rules'], true)
    expect(all.every(p => p.done)).toBe(true)
    for (const d of DAY_OPTIONS) {
      for (const m of MINUTE_OPTIONS) {
        expect(weeksToGoal(all, 'rules', 'serious', { daysPerWeek: d, minutesPerDay: m })).toBe(0)
      }
    }
  })

  it('is 0 for a learner placed beyond their goal', () => {
    expect(weeks(3, 20, 'table', 'curious')).toBe(0)
  })

  it('is 0 when only reading is left', () => {
    expect(weeksToGoal(fresh, 'rules', 'serious', { daysPerWeek: 3, minutesPerDay: 20 })).toBeGreaterThan(0)
    const paid = deriveCurriculum([], [], true, CURRICULUM.filter(s => s.drill).map(s => s.id))
    expect(weeksToGoal(paid, 'rules', 'serious', { daysPerWeek: 3, minutesPerDay: 20 })).toBe(0)
  })

  it('shrinks by training, and by nothing else', () => {
    const budget: TimeBudget = { daysPerWeek: 1, minutesPerDay: 20 }
    const before = weeksToGoal(fresh, 'hi-lo', 'curious', budget)
    const some = deriveCurriculum(finished('hi-lo', 1), [], true)
    const after = weeksToGoal(some, 'hi-lo', 'curious', budget)
    expect(after).toBeLessThan(before)
    // Hi-Lo is done; what is left is the true count alone, at one day a week.
    expect(after).toBe(weeksToGoal(fresh, 'true-count', 'curious', budget))
  })

  it('still counts the days a stage owes when its sessions are all there', () => {
    // The full count in one sitting leaves the other days to come back for.
    const { minSessions, minDays } = drillOf('true-count')
    const cram = Array.from({ length: minSessions }, () => run('true-count', 1))
    const progress = deriveCurriculum(cram, [], true)
    expect(weeksToGoal(progress, 'true-count', 'curious', { daysPerWeek: 1, minutesPerDay: 60 })).toBe(minDays - 1)
    expect(weeksToGoal(progress, 'true-count', 'curious', { daysPerWeek: 7, minutesPerDay: 60 })).toBe(1)
  })

  it('never divides by nothing', () => {
    const odd = weeksToGoal(fresh, 'rules', 'serious', { daysPerWeek: 0, minutesPerDay: 20 })
    expect(Number.isFinite(odd)).toBe(true)
    expect(odd).toBeGreaterThan(0)
  })
})

/**
 * Found by review on the day the plan was built (17 Nov 2026): two ways the
 * warm-up went wrong, both of which left a day that could not be finished or
 * was not the learner's own.
 */
describe('the warm-up, after review', () => {
  const build = (sessions: TrainingSessionResult[], goal: Goal, placement: StageId, isPro = true) =>
    buildDayPlan({
      progress: deriveCurriculum(sessions, [], isPro),
      placement,
      goal,
      isPro,
      budget: { daysPerWeek: 3, minutesPerDay: 20 },
      sessions,
      today: TODAY,
    })

  it('is ticked by the run that does it, and does not move on to another stage', () => {
    // Placed at the true count: basic strategy and Hi-Lo are both behind.
    const before = build([], 'serious', 'true-count')
    const warmup = before.blocks.find(b => b.kind === 'warmup')!
    expect(warmup.done).toBe(false)

    // The warm-up is done, today.
    const after = build([run(warmup.stage, 0)], 'serious', 'true-count')
    const same = after.blocks.find(b => b.kind === 'warmup')!
    expect(same.stage).toBe(warmup.stage)
    expect(same.done).toBe(true)
  })

  it('never reaches past the goal for something to warm up on', () => {
    // Goal: understand counting (ends at the true count), and it is reached.
    const sessions = [...finished('basic-strategy', 9), ...finished('hi-lo', 5), ...finished('true-count', 1)]
    const day = build(sessions, 'curious', 'basic-strategy')
    const end = stageIndex('true-count')
    expect(day.blocks.length).toBeGreaterThan(0)
    for (const b of day.blocks) expect(stageIndex(b.stage), b.id).toBeLessThanOrEqual(end)
  })
})

describe('reading, once', () => {
  it('does not put a stage’s reading on the day again once it has been opened', () => {
    const base = { ...input({ placement: 'hi-lo' }) }
    expect(buildDayPlan(base).blocks.some(b => b.kind === 'read')).toBe(true)
    expect(buildDayPlan({ ...base, readStages: ['hi-lo'] }).blocks.some(b => b.kind === 'read')).toBe(false)
    // The minutes the reading took go to the drill.
    expect(buildDayPlan({ ...base, readStages: ['hi-lo'] }).minutes).toBe(buildDayPlan(base).minutes)
  })
})
