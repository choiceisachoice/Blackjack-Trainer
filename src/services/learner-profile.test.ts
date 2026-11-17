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
  budgetOf,
  commitmentFor,
  MINUTE_OPTIONS,
  DAY_OPTIONS,
  BLOCK_MINUTES,
  type Goal,
  type Commitment,
  type LearnerProfile,
  type TimeBudget,
} from './learner-profile'
import { onPlanStateChanged } from './plan-state-signal'
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
    //
    // "Stops being the constraint" is a fact about the curriculum, so it is
    // read from there: a pace that fits the largest stage into one week.
    const floor = CURRICULUM.length * MIN_WEEKS_PER_STAGE
    const largest = Math.max(...CURRICULUM.map(s => s.drill?.minSessions ?? 0))
    const unconstrained = COMMITMENT_OPTIONS.filter(o => o.sessionsPerWeek >= largest)
    const constrained = COMMITMENT_OPTIONS.filter(o => o.sessionsPerWeek < largest)
    // Both sides have to exist, or one half of this test asserts nothing.
    expect(unconstrained.length).toBeGreaterThan(0)
    expect(constrained.length).toBeGreaterThan(0)
    for (const o of unconstrained) {
      expect(estimateToGoal('rules', 'serious', o.value).weeks, o.value).toBe(floor)
    }
    for (const o of constrained) {
      expect(estimateToGoal('rules', 'serious', o.value).weeks, o.value).toBeGreaterThan(floor)
    }
  })

  it('charges each stage its own weeks at a pace too small for it', () => {
    // Worked by hand for a single stage, from the stage's own number: the
    // true count alone, at the lightest pace.
    const trueCount = CURRICULUM.find(s => s.id === 'true-count')!.drill!
    const perWeek = sessionsPerWeek('light')
    // The premise: at this pace the stage does not fit into one week.
    expect(trueCount.minSessions).toBeGreaterThan(perWeek)
    expect(estimateToGoal('true-count', 'curious', 'light')).toEqual({
      stages: 1,
      sessions: trueCount.minSessions,
      weeks: Math.ceil(trueCount.minSessions / perWeek),
    })
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

describe('the time budget, as days and minutes', () => {
  it('offers every number of days in a week, once each, in order', () => {
    expect([...DAY_OPTIONS]).toEqual([1, 2, 3, 4, 5, 6, 7])
  })

  it('offers day lengths that are whole numbers of blocks, shortest first', () => {
    expect([...MINUTE_OPTIONS]).toEqual([10, 20, 30, 60])
    for (const m of MINUTE_OPTIONS) {
      expect(m % BLOCK_MINUTES, String(m)).toBe(0)
      // Shorter than two blocks is not a training day: there would be no room
      // for a reading block and a first run.
      expect(m / BLOCK_MINUTES, String(m)).toBeGreaterThanOrEqual(2)
    }
  })

  describe('budgetOf', () => {
    it('assumes a middling budget for a learner who was never asked', () => {
      expect(budgetOf(null)).toEqual(budgetOf({ goal: 'serious', commitment: 'casual' }))
    })

    it('reads the two answers when they were given', () => {
      expect(budgetOf({ goal: 'serious', commitment: 'light', daysPerWeek: 6, minutesPerDay: 60 }))
        .toEqual({ daysPerWeek: 6, minutesPerDay: 60 })
    })

    it('fills a profile from before the question out of its old pace', () => {
      // More pace must never mean less time, on either axis.
      const order: Commitment[] = ['light', 'casual', 'regular', 'heavy']
      const budgets = order.map(commitment => budgetOf({ goal: 'serious', commitment }))
      for (const b of budgets) {
        expect(DAY_OPTIONS).toContain(b.daysPerWeek)
        expect(MINUTE_OPTIONS).toContain(b.minutesPerDay)
      }
      for (let i = 1; i < budgets.length; i++) {
        expect(budgets[i].daysPerWeek, order[i]).toBeGreaterThan(budgets[i - 1].daysPerWeek)
        expect(budgets[i].minutesPerDay, order[i]).toBeGreaterThan(budgets[i - 1].minutesPerDay)
      }
      expect(budgets[0]).toEqual({ daysPerWeek: 1, minutesPerDay: 10 })
      expect(budgets[3]).toEqual({ daysPerWeek: 7, minutesPerDay: 60 })
    })

    it('fills each half on its own when only one was stored', () => {
      const legacy = budgetOf({ goal: 'serious', commitment: 'regular' })
      expect(budgetOf({ goal: 'serious', commitment: 'regular', daysPerWeek: 2 }))
        .toEqual({ daysPerWeek: 2, minutesPerDay: legacy.minutesPerDay })
      expect(budgetOf({ goal: 'serious', commitment: 'regular', minutesPerDay: 10 }))
        .toEqual({ daysPerWeek: legacy.daysPerWeek, minutesPerDay: 10 })
    })

    it('does not trust numbers the picker could never have produced', () => {
      const legacy = budgetOf({ goal: 'serious', commitment: 'casual' })
      for (const daysPerWeek of [0, 8, -1, 2.5, Number.NaN]) {
        expect(budgetOf({ goal: 'serious', commitment: 'casual', daysPerWeek }).daysPerWeek, String(daysPerWeek))
          .toBe(legacy.daysPerWeek)
      }
      for (const minutesPerDay of [0, 15, 45, 600]) {
        const profile = { goal: 'serious', commitment: 'casual', minutesPerDay } as unknown as LearnerProfile
        expect(budgetOf(profile).minutesPerDay, String(minutesPerDay)).toBe(legacy.minutesPerDay)
      }
    })
  })

  describe('commitmentFor', () => {
    const blocksAWeek = (b: TimeBudget) => (b.daysPerWeek * b.minutesPerDay) / BLOCK_MINUTES

    it('calls the smallest budget light and the largest heavy', () => {
      expect(commitmentFor({ daysPerWeek: 1, minutesPerDay: 10 })).toBe('light')
      expect(commitmentFor({ daysPerWeek: 7, minutesPerDay: 60 })).toBe('heavy')
    })

    it('never ranks more time below less time', () => {
      const rank: Record<Commitment, number> = { light: 0, casual: 1, regular: 2, heavy: 3 }
      const all = DAY_OPTIONS.flatMap(daysPerWeek =>
        MINUTE_OPTIONS.map(minutesPerDay => ({ daysPerWeek, minutesPerDay })))
        .sort((a, b) => blocksAWeek(a) - blocksAWeek(b))
      for (let i = 1; i < all.length; i++) {
        expect(rank[commitmentFor(all[i])], JSON.stringify(all[i]))
          .toBeGreaterThanOrEqual(rank[commitmentFor(all[i - 1])])
      }
      // And all four paces are reachable from the picker.
      expect(new Set(all.map(commitmentFor)).size).toBe(4)
    })

    it('depends only on the minutes in a week, not on how they are cut', () => {
      // 60 minutes a week either way.
      expect(commitmentFor({ daysPerWeek: 6, minutesPerDay: 10 }))
        .toBe(commitmentFor({ daysPerWeek: 2, minutesPerDay: 30 }))
      expect(commitmentFor({ daysPerWeek: 3, minutesPerDay: 20 }))
        .toBe(commitmentFor({ daysPerWeek: 1, minutesPerDay: 60 }))
    })

    it('changes pace at the edges it documents', () => {
      // Blocks a week: up to 2 light, up to 12 casual, up to 30 regular.
      expect(commitmentFor({ daysPerWeek: 1, minutesPerDay: 10 })).toBe('light') // 2
      expect(commitmentFor({ daysPerWeek: 2, minutesPerDay: 10 })).toBe('casual') // 4
      expect(commitmentFor({ daysPerWeek: 3, minutesPerDay: 20 })).toBe('casual') // 12
      expect(commitmentFor({ daysPerWeek: 7, minutesPerDay: 10 })).toBe('regular') // 14
      expect(commitmentFor({ daysPerWeek: 5, minutesPerDay: 30 })).toBe('regular') // 30
      expect(commitmentFor({ daysPerWeek: 4, minutesPerDay: 60 })).toBe('heavy') // 48
    })

    it('maps each old pace back onto itself', () => {
      // Confirming the suggested budget unchanged used to raise the stored
      // pace a step — casual became regular, and the challenges with it.
      for (const o of COMMITMENT_OPTIONS) {
        expect(commitmentFor(budgetOf({ goal: 'serious', commitment: o.value })), o.value).toBe(o.value)
      }
    })
  })

  describe('stored with the profile', () => {
    it('round-trips the days and minutes', () => {
      const profile: LearnerProfile = { goal: 'profit', commitment: 'regular', daysPerWeek: 4, minutesPerDay: 30 }
      setProfile(profile)
      expect(getProfile()).toEqual(profile)
    })

    it('loads a profile from before the question, without inventing an answer', () => {
      localStorage.setItem('bjt_learner_profile', JSON.stringify({ goal: 'profit', commitment: 'regular' }))
      const profile = getProfile()
      expect(profile).toEqual({ goal: 'profit', commitment: 'regular' })
      // Absent, not defaulted: this is how the plan knows the question is
      // still owed.
      expect(profile?.daysPerWeek).toBeUndefined()
      expect(profile?.minutesPerDay).toBeUndefined()
    })

    it('drops a stored budget it does not recognise and keeps the rest', () => {
      localStorage.setItem('bjt_learner_profile', JSON.stringify({
        goal: 'profit', commitment: 'regular', daysPerWeek: 9, minutesPerDay: 45,
      }))
      expect(getProfile()).toEqual({ goal: 'profit', commitment: 'regular' })

      localStorage.setItem('bjt_learner_profile', JSON.stringify({
        goal: 'profit', commitment: 'regular', daysPerWeek: '3', minutesPerDay: '20',
      }))
      expect(getProfile()).toEqual({ goal: 'profit', commitment: 'regular' })
    })

    it('tells the plan when the profile is written', () => {
      const heard: string[] = []
      const stop = onPlanStateChanged(origin => heard.push(origin))
      setProfile({ goal: 'curious', commitment: 'light', daysPerWeek: 1, minutesPerDay: 10 })
      stop()
      expect(heard).toEqual(['local'])
    })
  })
})
