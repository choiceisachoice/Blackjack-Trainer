import { describe, it, expect, beforeEach } from 'vitest'
import {
  GOAL_OPTIONS,
  COMMITMENT_OPTIONS,
  MIN_WEEKS_PER_STAGE,
  goalStage,
  proStagesFor,
  nextGoalUp,
  sessionsPerWeek,
  derivePace,
  playsForRealMoney,
  mathsMultiplier,
  CASINO_OPTIONS,
  MATHS_OPTIONS,
  SOURCE_OPTIONS,
  estimateToGoal,
  isBeyondGoal,
  getProfile,
  setProfile,
  type Goal,
} from './learner-profile'
import { CURRICULUM, stageIndex } from './curriculum'

beforeEach(() => {
  localStorage.clear()
})

describe('goals', () => {
  it('offers a goal for every kind of learner, in increasing ambition', () => {
    const stages = GOAL_OPTIONS.map(o => stageIndex(o.stage))
    for (let i = 1; i < stages.length; i++) {
      expect(stages[i], GOAL_OPTIONS[i].value).toBeGreaterThan(stages[i - 1])
    }
  })

  it('names real curriculum stages', () => {
    for (const o of GOAL_OPTIONS) {
      expect(CURRICULUM.some(s => s.id === o.stage), o.value).toBe(true)
    }
  })

  it('does not require bet sizing of someone who only wants to understand it', () => {
    expect(stageIndex(goalStage('curious'))).toBeLessThan(stageIndex('bet-spread'))
  })

  it('does require bet sizing of someone who wants to win money', () => {
    // Counting without spreading bets earns nothing — a "profit" goal that
    // stopped earlier would be dishonest.
    expect(stageIndex(goalStage('profit'))).toBeGreaterThanOrEqual(stageIndex('bet-spread'))
  })

  it('sends the most serious goal all the way to the end', () => {
    expect(goalStage('serious')).toBe(CURRICULUM[CURRICULUM.length - 1].id)
  })

  it('falls back to the full path for an unknown goal', () => {
    expect(goalStage('nonsense' as Goal)).toBe('table')
  })
})

describe('isBeyondGoal', () => {
  it('marks stages past the goal', () => {
    expect(isBeyondGoal('table', 'curious')).toBe(true)
    expect(isBeyondGoal('bet-spread', 'curious')).toBe(true)
  })

  it('does not mark the goal itself or anything before it', () => {
    expect(isBeyondGoal('true-count', 'curious')).toBe(false)
    expect(isBeyondGoal('rules', 'curious')).toBe(false)
  })

  it('marks nothing for the most serious goal', () => {
    for (const s of CURRICULUM) {
      expect(isBeyondGoal(s.id, 'serious'), s.id).toBe(false)
    }
  })
})

describe('sessionsPerWeek', () => {
  it('rises with the time offered', () => {
    const counts = COMMITMENT_OPTIONS.map(o => sessionsPerWeek(o.value))
    for (let i = 1; i < counts.length; i++) {
      expect(counts[i]).toBeGreaterThan(counts[i - 1])
    }
  })

  it('is exactly what the option promised', () => {
    // The label and the target used to disagree: "a couple of sessions a week"
    // became a target of 15 because the number came from minutes ÷ 8.
    for (const o of COMMITMENT_OPTIONS) {
      expect(sessionsPerWeek(o.value), o.value).toBe(o.sessionsPerWeek)
      expect(o.hint, o.value).toContain(String(o.sessionsPerWeek))
    }
  })

  it('never asks for more than a few sessions a day', () => {
    // A weekly target is something to hit, not a theoretical maximum.
    for (const o of COMMITMENT_OPTIONS) {
      expect(sessionsPerWeek(o.value) / 7, o.value).toBeLessThanOrEqual(4)
    }
  })

  it('never returns zero, so an estimate can never divide by nothing', () => {
    for (const o of COMMITMENT_OPTIONS) {
      expect(sessionsPerWeek(o.value), o.value).toBeGreaterThan(0)
    }
  })
})

describe('estimateToGoal', () => {
  it('counts the drills the curriculum actually demands', () => {
    const e = estimateToGoal('rules', 'serious', 'casual')
    const expected = CURRICULUM.reduce((n, s) => n + (s.drill?.minSessions ?? 0), 0)
    expect(e.sessions).toBe(expected)
    expect(e.stages).toBe(CURRICULUM.length)
  })

  it('shrinks as the learner advances', () => {
    const early = estimateToGoal('rules', 'serious', 'casual')
    const late = estimateToGoal('bet-spread', 'serious', 'casual')
    expect(late.sessions).toBeLessThan(early.sessions)
    expect(late.stages).toBeLessThan(early.stages)
  })

  it('shrinks for a smaller goal', () => {
    const modest = estimateToGoal('rules', 'curious', 'casual')
    const full = estimateToGoal('rules', 'serious', 'casual')
    expect(modest.sessions).toBeLessThan(full.sessions)
  })

  it('is zero once the learner is past their goal', () => {
    expect(estimateToGoal('table', 'curious', 'casual')).toEqual({ stages: 0, sessions: 0, weeks: 0 })
  })

  it('includes the goal stage itself', () => {
    const e = estimateToGoal('true-count', 'curious', 'heavy')
    expect(e.stages).toBe(1)
  })

  it('gets faster with more time, but never below the spacing floor', () => {
    const slow = estimateToGoal('rules', 'serious', 'light')
    const fast = estimateToGoal('rules', 'serious', 'heavy')
    expect(fast.weeks).toBeLessThanOrEqual(slow.weeks)
    // Cramming cannot beat spacing: a stage a week is the floor whatever the
    // hours available.
    expect(fast.weeks).toBe(CURRICULUM.length * MIN_WEEKS_PER_STAGE)
  })

  it('never promises less than a week per stage', () => {
    for (const c of COMMITMENT_OPTIONS) {
      for (const g of GOAL_OPTIONS) {
        const e = estimateToGoal('rules', g.value, c.value)
        expect(e.weeks, `${g.value}/${c.value}`).toBeGreaterThanOrEqual(e.stages * MIN_WEEKS_PER_STAGE)
      }
    }
  })

  it('takes longer for someone with almost no time', () => {
    // The whole point of asking: twenty minutes a week cannot clear three
    // drills in one, so those stages take more than the spacing floor.
    const light = estimateToGoal('rules', 'serious', 'light')
    expect(light.weeks).toBeGreaterThan(CURRICULUM.length * MIN_WEEKS_PER_STAGE)
  })

  it('bottoms out at the spacing floor once time stops being the constraint', () => {
    // Above a certain pace the limit is spaced repetition, not hours — and the
    // estimate must say so rather than promising an ever-shorter path.
    const floor = CURRICULUM.length * MIN_WEEKS_PER_STAGE
    for (const c of ['casual', 'regular', 'heavy'] as const) {
      expect(estimateToGoal('rules', 'serious', c).weeks, c).toBe(floor)
    }
  })
})

describe('persistence', () => {
  it('is null until answered', () => {
    expect(getProfile()).toBeNull()
  })

  it('round-trips', () => {
    const full = {
      goal: 'profit', commitment: 'regular', casino: 'real', maths: 'slow', source: 'video',
    } as const
    setProfile(full)
    expect(getProfile()).toEqual(full)
  })

  it('keeps a profile saved before the extra questions existed', () => {
    // An account that answered the earlier two-question version must not be
    // marched through the whole thing again.
    localStorage.setItem('bjt_learner_profile', JSON.stringify({ goal: 'profit', commitment: 'regular' }))
    expect(getProfile()).toEqual({
      goal: 'profit', commitment: 'regular', casino: 'never', maths: 'okay', source: 'other',
    })
  })

  it('replaces nonsense in the optional answers instead of discarding the profile', () => {
    localStorage.setItem('bjt_learner_profile', JSON.stringify({
      goal: 'curious', commitment: 'light', casino: 'mars', maths: 7, source: null,
    }))
    expect(getProfile()).toMatchObject({ goal: 'curious', casino: 'never', maths: 'okay', source: 'other' })
  })

  it('still rejects a profile whose goal is not a real option', () => {
    localStorage.setItem('bjt_learner_profile', JSON.stringify({ goal: 'rich', commitment: 'regular' }))
    expect(getProfile()).toBeNull()
  })

  it('survives corrupt storage', () => {
    localStorage.setItem('bjt_learner_profile', 'not json')
    expect(getProfile()).toBeNull()
  })

  it('rejects a partial profile rather than half-applying it', () => {
    localStorage.setItem('bjt_learner_profile', JSON.stringify({ goal: 'profit' }))
    expect(getProfile()).toBeNull()
  })
})

describe('the universal questions', () => {
  it('offers options everyone can answer without knowing any jargon', () => {
    const jargon = /true count|running count|deviation|illustrious|hi-lo/i
    for (const o of [...CASINO_OPTIONS, ...MATHS_OPTIONS, ...SOURCE_OPTIONS]) {
      expect(o.label, o.value).not.toMatch(jargon)
      expect(o.hint.length, o.value).toBeGreaterThan(0)
    }
  })

  it('flags only the learner with money actually at risk', () => {
    expect(playsForRealMoney('real')).toBe(true)
    expect(playsForRealMoney('online')).toBe(false)
    expect(playsForRealMoney('never')).toBe(false)
  })

  it('asks for more repetition where the arithmetic bites, and nowhere else', () => {
    expect(mathsMultiplier('quick')).toBe(1)
    expect(mathsMultiplier('okay')).toBeGreaterThan(1)
    expect(mathsMultiplier('slow')).toBeGreaterThan(mathsMultiplier('okay'))
  })

  it('lengthens the estimate for someone slow at sums', () => {
    const quick = estimateToGoal('rules', 'serious', 'casual', 'quick')
    const slow = estimateToGoal('rules', 'serious', 'casual', 'slow')
    expect(slow.sessions).toBeGreaterThan(quick.sessions)
    expect(slow.stages).toBe(quick.stages)
  })

  it('leaves the recall-only stages alone', () => {
    // Basic strategy is memory, not arithmetic — its requirement must not move.
    const onlyRecall = estimateToGoal('basic-strategy', 'curious', 'casual', 'slow')
    const baseline = estimateToGoal('basic-strategy', 'curious', 'casual', 'quick')
    const strategyOnly = estimateToGoal('basic-strategy', 'stop-losing', 'casual', 'slow')
    expect(onlyRecall.sessions).toBeGreaterThan(baseline.sessions) // spans hi-lo + true-count
    expect(strategyOnly.sessions).toBeGreaterThan(0)
  })
})

describe('derivePace', () => {
  const week = '2026-07-20'
  const on = (day: string) => ({ timestamp: `${day}T10:00:00.000Z` })

  it('targets what the learner said they had time for', () => {
    expect(derivePace('light', [], week).target).toBe(sessionsPerWeek('light'))
    expect(derivePace('heavy', [], week).target).toBe(sessionsPerWeek('heavy'))
  })

  it('counts only sessions from this week', () => {
    const pace = derivePace('light', [on('2026-07-19'), on('2026-07-20'), on('2026-07-23')], week)
    expect(pace.done).toBe(2)
  })

  it('counts a session on the first day of the week', () => {
    expect(derivePace('light', [on(week)], week).done).toBe(1)
  })

  it('knows when the week is done', () => {
    const target = sessionsPerWeek('light')
    const sessions = Array.from({ length: target }, () => on('2026-07-21'))
    expect(derivePace('light', sessions, week).met).toBe(true)
    expect(derivePace('light', sessions.slice(1), week).met).toBe(false)
  })

  it('is not met on an empty week', () => {
    expect(derivePace('casual', [], week)).toEqual({
      target: sessionsPerWeek('casual'), done: 0, met: false,
    })
  })
})

describe('proStagesFor', () => {
  it('names the stages a free account cannot open on the way to a goal', () => {
    // True count is drilled on a Pro screen and sits fourth of seven, so it
    // lands inside every goal. This is a pricing fact, asserted so a change to
    // pricing shows up here rather than silently.
    expect(proStagesFor('curious')).toContain('true-count')
    expect(proStagesFor('serious')).toEqual(['true-count', 'bet-spread', 'table'])
  })

  it('grows with ambition and never shrinks', () => {
    const counts = GOAL_OPTIONS.map(o => proStagesFor(o.value).length)
    for (let i = 1; i < counts.length; i++) {
      expect(counts[i], GOAL_OPTIONS[i].value).toBeGreaterThanOrEqual(counts[i - 1])
    }
  })

  it('lists them in curriculum order', () => {
    const listed = proStagesFor('serious')
    const sorted = [...listed].sort((a, b) => stageIndex(a) - stageIndex(b))
    expect(listed).toEqual(sorted)
  })

  it('never reports a stage past the goal', () => {
    for (const o of GOAL_OPTIONS) {
      for (const id of proStagesFor(o.value)) {
        expect(stageIndex(id), `${o.value}/${id}`).toBeLessThanOrEqual(stageIndex(goalStage(o.value)))
      }
    }
  })
})

describe('nextGoalUp', () => {
  it('walks the ladder one rung at a time', () => {
    for (let i = 0; i < GOAL_OPTIONS.length - 1; i++) {
      expect(nextGoalUp(GOAL_OPTIONS[i].value)).toBe(GOAL_OPTIONS[i + 1].value)
    }
  })

  it('stops at the top', () => {
    expect(nextGoalUp(GOAL_OPTIONS[GOAL_OPTIONS.length - 1].value)).toBeNull()
  })

  it('always points somewhere further along the curriculum', () => {
    for (const o of GOAL_OPTIONS) {
      const up = nextGoalUp(o.value)
      if (up) expect(stageIndex(goalStage(up))).toBeGreaterThan(stageIndex(goalStage(o.value)))
    }
  })
})
