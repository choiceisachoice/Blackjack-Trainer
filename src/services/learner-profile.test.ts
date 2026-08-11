import { describe, it, expect, beforeEach } from 'vitest'
import i18next from 'i18next'
import {
  GOAL_OPTIONS,
  COMMITMENT_OPTIONS,
  MIN_WEEKS_PER_STAGE,
  goalStage,
  proStagesFor,
  nextGoalUp,
  sessionsPerWeek,
  derivePace,
  estimateToGoal,
  isBeyondGoal,
  getProfile,
  setProfile,
  profileForLevel,
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
      // The hint is now interpolated from the same field, so the two cannot
      // disagree by construction. Checked anyway: this is the drift's home.
      expect(
        i18next.t('profile.pace.hint', { n: o.sessionsPerWeek }),
        o.value,
      ).toContain(String(o.sessionsPerWeek))
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
    const full = { goal: 'profit', commitment: 'regular' } as const
    setProfile(full)
    expect(getProfile()).toEqual(full)
  })

  it('loads a profile written before the extra answers were dropped', () => {
    // Accounts still carry `casino`, `maths` and `source` from the old
    // questionnaire. They must load, not be rejected — being logged out of your
    // own plan by an update is worse than the fields being useless.
    localStorage.setItem('bjt_learner_profile', JSON.stringify({
      goal: 'profit', commitment: 'regular', casino: 'real', maths: 'slow', source: 'video',
    }))
    expect(getProfile()).toEqual({ goal: 'profit', commitment: 'regular' })
  })

  it('ignores nonsense in the dropped fields rather than discarding the profile', () => {
    localStorage.setItem('bjt_learner_profile', JSON.stringify({
      goal: 'curious', commitment: 'light', casino: 'mars', maths: 7, source: null,
    }))
    expect(getProfile()).toEqual({ goal: 'curious', commitment: 'light' })
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

describe('the derived starting profile', () => {
  // The goal and pace questions are no longer asked. Both are derived, and both
  // stay editable in the plan — these tests pin the defaults so a change to
  // them has to be deliberate.

  it('gives everyone the full path rather than guessing a smaller goal', () => {
    // Narrowing someone's path on their behalf hides later stages from them.
    // The full path shows everything and closes nothing off.
    expect(profileForLevel().goal).toBe('serious')
    expect(goalStage(profileForLevel().goal)).toBe(CURRICULUM[CURRICULUM.length - 1].id)
  })

  it('marks nothing as beyond the goal for a freshly derived profile', () => {
    const { goal } = profileForLevel()
    for (const stage of CURRICULUM) {
      expect(isBeyondGoal(stage.id, goal), stage.id).toBe(false)
    }
  })

  it('starts on a middling pace, not the extremes', () => {
    const { commitment } = profileForLevel()
    const rates = COMMITMENT_OPTIONS.map(o => o.sessionsPerWeek)
    const mine = sessionsPerWeek(commitment)
    expect(mine).toBeGreaterThan(Math.min(...rates))
    expect(mine).toBeLessThan(Math.max(...rates))
  })

  it('produces a profile that survives a save and load', () => {
    setProfile(profileForLevel())
    expect(getProfile()).toEqual(profileForLevel())
  })
})

describe('the estimate no longer bends to a guessed input', () => {
  it('depends only on where you are, where you are going, and your pace', () => {
    // The arithmetic multiplier went with the mental-maths question. Two calls
    // with the same three arguments must now be identical — there is no fourth
    // input left to make them differ.
    const a = estimateToGoal('rules', 'serious', 'casual')
    const b = estimateToGoal('rules', 'serious', 'casual')
    expect(a).toEqual(b)
  })

  it('counts exactly what the curriculum demands, with nothing added', () => {
    const demanded = CURRICULUM.reduce((n, s) => n + (s.drill?.minSessions ?? 0), 0)
    expect(estimateToGoal('rules', 'serious', 'casual').sessions).toBe(demanded)
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
