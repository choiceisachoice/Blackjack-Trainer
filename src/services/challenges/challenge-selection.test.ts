import { describe, it, expect } from 'vitest'
import {
  stageForMode,
  stagesAgreeWithScreens,
  isReachable,
  isPaceable,
  eligibleChallenges,
  hashToIndex,
  selectChallenge,
  type LearnerContext,
} from './challenge-selection'
import { CHALLENGE_POOL } from './challenge-pool'
import { WEEKLY_CHALLENGE_POOL } from './weekly-challenge-pool'
import { CURRICULUM, stageIndex } from '../curriculum'

import type { TrainingMode } from '../stats-types'

const free = (stage: LearnerContext['stage']): LearnerContext => ({ stage, isPro: false })
const pro = (stage: LearnerContext['stage']): LearnerContext => ({ stage, isPro: true })
const paced = (sessionsPerWeek: number): LearnerContext => ({ stage: 'table', isPro: true, sessionsPerWeek })

describe('stageForMode', () => {
  it('gives every drilled stage at least one mode', () => {
    const modes: TrainingMode[] = [
      'speedDrill', 'tableCounting', 'deviationFlashCards', 'deviationAtTable',
      'betSpread', 'deckEstimation', 'casinoSession',
    ]
    for (const stage of CURRICULUM) {
      if (!stage.drill) continue
      expect(modes.filter(m => stageForMode(m) === stage.id).length, stage.id).toBeGreaterThan(0)
    }
  })

  it('keeps the hand-written mapping in step with the curriculum', () => {
    // Basic strategy and deviations share the Flashcards screen, so the stage
    // owning a mode cannot be derived — this asserts the stated table still
    // matches where each stage's drill actually lives.
    expect(stagesAgreeWithScreens()).toBe(true)
  })

  it('separates the two stages that share the Flashcards screen', () => {
    expect(stageForMode('deviationFlashCards')).toBe('basic-strategy')
    expect(stageForMode('deviationAtTable')).toBe('deviations')
  })

  it('reconciles the recorded mode name with the screen name', () => {
    // Sessions record 'deviationFlashCards'; the screen is 'deviationTraining'.
    expect(stageForMode('deviationFlashCards')).toBe('basic-strategy')
    expect(stageForMode('speedDrill')).toBe('hi-lo')
    expect(stageForMode('deckEstimation')).toBe('true-count')
    expect(stageForMode('betSpread')).toBe('bet-spread')
    expect(stageForMode('casinoSession')).toBe('table')
  })
})

describe('isReachable', () => {
  it('always allows challenges that need no particular screen', () => {
    expect(isReachable({}, free('rules'))).toBe(true)
    expect(isReachable({}, free(null))).toBe(true)
  })

  it('refuses a Pro screen to a free account', () => {
    expect(isReachable({ requiredMode: 'casinoSession' }, free('table'))).toBe(false)
    expect(isReachable({ requiredMode: 'casinoSession' }, pro('table'))).toBe(true)
  })

  it('refuses a skill the learner has not been taught yet', () => {
    // Bet spread sits four stages past someone still learning the count.
    expect(isReachable({ requiredMode: 'betSpread' }, pro('hi-lo'))).toBe(false)
    expect(isReachable({ requiredMode: 'betSpread' }, pro('bet-spread'))).toBe(true)
  })

  it('allows anything at or below the current stage', () => {
    expect(isReachable({ requiredMode: 'deviationFlashCards' }, pro('table'))).toBe(true)
    expect(isReachable({ requiredMode: 'speedDrill' }, pro('bet-spread'))).toBe(true)
  })

  it('holds no opinion about a learner who never took the placement test', () => {
    expect(isReachable({ requiredMode: 'betSpread' }, pro(null))).toBe(true)
    // ...but the Pro gate still applies.
    expect(isReachable({ requiredMode: 'casinoSession' }, free(null))).toBe(false)
  })
})

describe('eligibleChallenges', () => {
  it('never hands a free beginner something they cannot open', () => {
    // The bug this exists for: 6 of 24 daily challenges require a Pro screen.
    const PRO_ONLY: TrainingMode[] = ['casinoSession', 'betSpread', 'deckEstimation']
    for (const c of eligibleChallenges(CHALLENGE_POOL, free('rules'))) {
      expect(PRO_ONLY, c.id).not.toContain(c.requiredMode)
    }
  })

  it('actually removes challenges — the filter is not a no-op', () => {
    const beginner = eligibleChallenges(CHALLENGE_POOL, free('rules'))
    expect(beginner.length).toBeLessThan(CHALLENGE_POOL.length)
    expect(beginner.length).toBeGreaterThan(0)
  })

  it('widens as the learner advances', () => {
    const early = eligibleChallenges(CHALLENGE_POOL, pro('hi-lo')).length
    const late = eligibleChallenges(CHALLENGE_POOL, pro('table')).length
    expect(late).toBeGreaterThan(early)
  })

  it('falls back to generic challenges rather than returning nothing', () => {
    const onlyLocked = [{ requiredMode: 'casinoSession' as const }, { id: 'generic' }]
    const result = eligibleChallenges(onlyLocked, free('rules'))
    expect(result).toEqual([{ id: 'generic' }])
  })

  it('falls back to the whole pool when even that is empty', () => {
    const allLocked = [{ requiredMode: 'casinoSession' as const, id: 'a' }]
    expect(eligibleChallenges(allLocked, free('rules'))).toEqual(allLocked)
  })

  it('leaves the weekly pool usable for a free beginner', () => {
    const weekly = eligibleChallenges(WEEKLY_CHALLENGE_POOL, free('rules'))
    expect(weekly.length).toBeGreaterThan(0)
    // Every mode-bound weekly challenge requires the Pro Casino Session, so a
    // free learner must be left with the mode-free ones.
    for (const c of weekly) {
      expect(c.requiredMode, c.id).toBeUndefined()
    }
  })
})

describe('hashToIndex', () => {
  it('is deterministic', () => {
    expect(hashToIndex('2026-07-22', 10)).toBe(hashToIndex('2026-07-22', 10))
  })

  it('stays inside the pool', () => {
    for (let size = 1; size <= 30; size++) {
      for (const day of ['2026-01-01', '2026-07-22', '2025-12-31']) {
        const i = hashToIndex(day, size)
        expect(i).toBeGreaterThanOrEqual(0)
        expect(i).toBeLessThan(size)
      }
    }
  })

  it('survives an empty pool instead of returning NaN', () => {
    expect(hashToIndex('2026-07-22', 0)).toBe(0)
  })
})

describe('selectChallenge', () => {
  it('gives the same learner the same challenge all day', () => {
    const ctx = pro('hi-lo')
    expect(selectChallenge(CHALLENGE_POOL, '2026-07-22', ctx))
      .toBe(selectChallenge(CHALLENGE_POOL, '2026-07-22', ctx))
  })

  it('gives different days different challenges', () => {
    const ctx = pro('table')
    const week = ['2026-07-20', '2026-07-21', '2026-07-22', '2026-07-23', '2026-07-24']
      .map(d => selectChallenge(CHALLENGE_POOL, d, ctx).id)
    expect(new Set(week).size).toBeGreaterThan(1)
  })

  it('never returns something out of reach, on any day of a year', () => {
    // The property that matters: not one unopenable day for a free beginner.
    const ctx = free('rules')
    for (let day = 1; day <= 365; day++) {
      const key = `2026-${String((day % 12) + 1).padStart(2, '0')}-${String((day % 28) + 1).padStart(2, '0')}`
      const chosen = selectChallenge(CHALLENGE_POOL, key, ctx)
      expect(isReachable(chosen, ctx), `${key} → ${chosen.id}`).toBe(true)
    }
  })

  it('gives a beginner and an expert different challenges most days', () => {
    // If selection ignored the learner these two would agree every single day.
    const days = Array.from({ length: 60 }, (_, i) =>
      `2026-0${(i % 9) + 1}-${String((i % 28) + 1).padStart(2, '0')}`)
    const differ = days.filter(d =>
      selectChallenge(CHALLENGE_POOL, d, free('rules')).id !==
      selectChallenge(CHALLENGE_POOL, d, pro('table')).id).length

    expect(differ / days.length).toBeGreaterThan(0.5)
  })

  it('never asks a beginner for a skill from a later stage', () => {
    const ctx = pro('hi-lo')
    for (let i = 0; i < 60; i++) {
      const key = `2026-0${(i % 9) + 1}-${String((i % 28) + 1).padStart(2, '0')}`
      const chosen = selectChallenge(CHALLENGE_POOL, key, ctx)
      if (!chosen.requiredMode) continue
      const owner = stageForMode(chosen.requiredMode)
      if (!owner) continue
      expect(stageIndex(owner), `${key} → ${chosen.id}`).toBeLessThanOrEqual(stageIndex('hi-lo'))
    }
  })
})

describe('isPaceable', () => {
  const sessions = (target: number) => ({ type: 'play_sessions', target })

  it('holds no opinion when the learner never said how much time they have', () => {
    expect(isPaceable(sessions(20), pro('table'), 'day')).toBe(true)
  })

  it('refuses a day that costs more than the whole week', () => {
    // Twenty minutes a week is 2 sessions; "play 5 today" is a guaranteed
    // failure dressed as a goal.
    expect(isPaceable(sessions(5), paced(2), 'day')).toBe(false)
    expect(isPaceable(sessions(1), paced(2), 'day')).toBe(true)
  })

  it('allows a good day to overshoot the daily share a little', () => {
    // 15/week is ~2 a day; 3 should still be offered.
    expect(isPaceable(sessions(3), paced(15), 'day')).toBe(true)
  })

  it('measures weekly challenges against the whole week', () => {
    expect(isPaceable(sessions(10), paced(15), 'week')).toBe(true)
    expect(isPaceable(sessions(20), paced(15), 'week')).toBe(false)
  })

  it('leaves units it cannot convert alone', () => {
    // Hands, minutes, accuracy and streaks are not sessions, and inventing an
    // exchange rate would be worse than not filtering.
    for (const type of ['play_hands', 'play_minutes', 'achieve_accuracy', 'win_streak']) {
      expect(isPaceable({ type, target: 500 }, paced(2), 'day'), type).toBe(true)
    }
  })

  it('leaves a challenge with no target alone', () => {
    expect(isPaceable({ type: 'play_sessions' }, paced(2), 'day')).toBe(true)
  })
})

describe('pace filtering in selection', () => {
  it('never hands a very light learner a multi-session day', () => {
    const ctx: LearnerContext = { stage: 'table', isPro: true, sessionsPerWeek: 2 }
    for (const c of eligibleChallenges(CHALLENGE_POOL, ctx, 'day')) {
      if (c.type === 'play_sessions') expect(c.target, c.id).toBeLessThanOrEqual(2)
    }
  })

  it('still returns something rather than nothing', () => {
    const ctx: LearnerContext = { stage: 'rules', isPro: false, sessionsPerWeek: 1 }
    expect(eligibleChallenges(CHALLENGE_POOL, ctx, 'day').length).toBeGreaterThan(0)
  })

  it('prefers an over-ambitious challenge to an unopenable one', () => {
    // If pace filtering empties the pool, reachability is what must survive.
    const onlyBig = [
      { id: 'big', type: 'play_sessions', target: 99 },
      { id: 'locked', type: 'play_sessions', target: 1, requiredMode: 'casinoSession' as const },
    ]
    const ctx: LearnerContext = { stage: 'table', isPro: false, sessionsPerWeek: 1 }
    expect(eligibleChallenges(onlyBig, ctx, 'day').map(c => c.id)).toEqual(['big'])
  })
})
