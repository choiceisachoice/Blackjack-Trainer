import { describe, it, expect } from 'vitest'
import {
  compareWithBest,
  nearestAward,
  recordedRound,
  roundPercent,
  roundVerdict,
  stageLine,
  xpFill,
  type AwardProgress,
} from './round-summary-model'
import { LEVELS } from '../../services/level-system'
import { ALL_ACHIEVEMENTS } from '../../services/achievements/achievement-list'
import type { Achievement } from '../../services/achievements/achievement-types'
import type { TrainingMode, TrainingSessionResult } from '../../services/stats-types'
import { CountingSystemId } from '../../types'

let seq = 0
function session(mode: TrainingMode, correct: number, total: number, extra: Partial<TrainingSessionResult> = {}): TrainingSessionResult {
  seq += 1
  return {
    id: `s${seq}`,
    mode,
    timestamp: new Date(Date.UTC(2026, 10, 1 + seq)).toISOString(),
    countingSystem: CountingSystemId.HiLo,
    durationSeconds: 60,
    totalQuestions: total,
    correctAnswers: correct,
    accuracy: total > 0 ? correct / total : 0,
    bestStreak: 0,
    details: mode === 'deviationFlashCards'
      ? { type: 'deviationFlashCards', deviationSet: 'all', perDeviation: {} }
      : { type: 'speedDrill', cardsPerRound: 20, speedMs: 1000, rcErrors: [] },
    ...extra,
  }
}

describe('roundPercent', () => {
  it('rounds down, so a score never claims a mark it did not clear', () => {
    expect(roundPercent({ correct: 2, total: 3 })).toBe(66)
    expect(roundPercent({ correct: 17, total: 20 })).toBe(85)
  })
  it('is 0 for an empty round and clamps nonsense', () => {
    expect(roundPercent({ correct: 0, total: 0 })).toBe(0)
    expect(roundPercent({ correct: 12, total: 10 })).toBe(100)
  })
})

describe('roundVerdict', () => {
  it('has no word for a round too short to mean anything', () => {
    expect(roundVerdict({ correct: 3, total: 3 }, 'deviationFlashCards')).toBeNull()
  })
  it('steps where the XP bonus steps', () => {
    const v = (c: number) => roundVerdict({ correct: c, total: 20 }, 'deviationFlashCards')
    expect(v(20)).toBe('perfect')
    expect(v(19)).toBe('excellent') // 95 %
    expect(v(17)).toBe('strong') // 85 %
    expect(v(14)).toBe('solid') // 70 %
    expect(v(13)).toBe('practice')
  })
  it('takes the mode’s own sample: three speed-drill rounds are enough', () => {
    expect(roundVerdict({ correct: 3, total: 3 }, 'speedDrill')).toBe('perfect')
  })
})

describe('compareWithBest', () => {
  const mode = 'deviationFlashCards'
  it('is a first round without proven earlier rounds of this mode', () => {
    const earlier = [session('speedDrill', 10, 10), session(mode, 3, 3)]
    expect(compareWithBest({ correct: 8, total: 10 }, mode, earlier)).toEqual({ kind: 'first' })
  })
  it('names a new best and by how much', () => {
    const earlier = [session(mode, 8, 10), session(mode, 17, 20)]
    expect(compareWithBest({ correct: 9, total: 10 }, mode, earlier)).toEqual({ kind: 'new', previous: 85, gain: 5 })
  })
  it('names an equal best', () => {
    expect(compareWithBest({ correct: 9, total: 10 }, mode, [session(mode, 18, 20)])).toEqual({ kind: 'equal', previous: 90 })
  })
  it('names the gap below the best', () => {
    expect(compareWithBest({ correct: 7, total: 10 }, mode, [session(mode, 9, 10)])).toEqual({ kind: 'below', previous: 90, gap: 20 })
  })
  it('does not compare a round too short to count, but still knows the best', () => {
    expect(compareWithBest({ correct: 3, total: 3 }, mode, [session(mode, 9, 10)])).toEqual({ kind: 'short', previous: 90 })
  })
})

describe('xpFill', () => {
  const l12 = LEVELS[11]
  const l13 = LEVELS[12]
  it('starts where the XP stood and ends where it stands', () => {
    const total = l12.xpRequired + 1000
    const f = xpFill(total, 500)
    const span = l13.xpRequired - l12.xpRequired
    expect(f.level.level).toBe(12)
    expect(f.next?.level).toBe(13)
    expect(f.from).toBeCloseTo(500 / span)
    expect(f.to).toBeCloseTo(1000 / span)
    expect(f.leveledUp).toBe(false)
    expect(f.toNext).toBe(l13.xpRequired - total)
  })
  it('starts the new level empty after a level-up', () => {
    const f = xpFill(l13.xpRequired + 10, 100)
    expect(f.leveledUp).toBe(true)
    expect(f.level.level).toBe(13)
    expect(f.from).toBe(0)
  })
  it('is full at the top of the ladder', () => {
    const top = LEVELS[LEVELS.length - 1]
    const f = xpFill(top.xpRequired + 5000, 100)
    expect(f.next).toBeNull()
    expect(f.to).toBe(1)
    expect(f.toNext).toBe(0)
  })
})

describe('stageLine', () => {
  it('is null without a stage, without a recorded round, or for a round the stage does not count', () => {
    const s = session('speedDrill', 10, 10)
    expect(stageLine(null, s, [s], [], true)).toBeNull()
    expect(stageLine('hi-lo', null, [s], [], true)).toBeNull()
    // Deviations counts only flashcard rounds that had deviation questions.
    const basic = session('deviationFlashCards', 10, 10)
    expect(stageLine('deviations', basic, [basic], [], true)).toBeNull()
  })
  it('counts the stage the plan’s way and says whether this round cleared the mark', () => {
    const good = session('speedDrill', 10, 10)
    const weak = session('speedDrill', 5, 10)
    const line = stageLine('hi-lo', weak, [good, weak], [], true)
    expect(line).toMatchObject({ stage: 'hi-lo', cleared: 1, target: 10, bar: 90, roundCleared: false, done: false, days: 1, targetDays: 5 })
    expect(stageLine('hi-lo', good, [good, weak], [], true)?.roundCleared).toBe(true)
  })
})

describe('nearestAward', () => {
  const sessionsAward = ALL_ACHIEVEMENTS.find(a => a.requirement.type === 'sessions' && a.requirement.mode === 'deviationFlashCards' && a.requirement.value > 1) as Achievement
  const speedAward = ALL_ACHIEVEMENTS.find(a => a.requirement.type === 'sessions' && a.requirement.mode === 'speedDrill') as Achievement
  const generalHours = ALL_ACHIEVEMENTS.find(a => a.requirement.type === 'total_hours') as Achievement
  const perfect = ALL_ACHIEVEMENTS.find(a => a.requirement.type === 'perfect') as Achievement
  const row = (achievement: Achievement, percent: number, before = percent, unlocked = false): AwardProgress => ({ achievement, percent, before, unlocked })

  it('leaves out unlocked, another mode’s, untouched, finished and all-or-nothing awards', () => {
    expect(sessionsAward).toBeDefined()
    expect(nearestAward([
      row(sessionsAward, 80, 80, true),
      row(speedAward, 90),
      row(generalHours, 0),
      row(perfect, 50),
    ], 'deviationFlashCards')).toBeNull()
  })
  it('prefers an award this round moved, then the mode’s own, then the closest', () => {
    const moved = nearestAward([row(generalHours, 90), row(sessionsAward, 40, 20)], 'deviationFlashCards')
    const v = sessionsAward.requirement.value
    expect(moved).toEqual({ achievement: sessionsAward, percent: 40, current: Math.round(0.4 * v), target: v, gain: Math.round(0.4 * v) - Math.round(0.2 * v) })
    const own = nearestAward([row(generalHours, 90), row(sessionsAward, 40)], 'deviationFlashCards')
    expect(own?.achievement).toBe(sessionsAward)
    expect(own?.gain).toBe(0)
  })
  it('never points at an accuracy award: its figure moves without meaning a count', () => {
    const accuracy = ALL_ACHIEVEMENTS.find(a => a.requirement.type === 'accuracy' && a.requirement.mode === 'deviationFlashCards') as Achievement
    expect(nearestAward([row(accuracy, 73, 0)], 'deviationFlashCards')).toBeNull()
  })
  it('counts in the award’s own unit', () => {
    const hands = ALL_ACHIEVEMENTS.find(a => a.requirement.type === 'hands' && a.requirement.value === 1000) as Achievement
    expect(nearestAward([row(hands, 26, 25)], 'deviationFlashCards')).toMatchObject({ current: 260, target: 1000, gain: 10 })
  })
})

describe('recordedRound', () => {
  it('is the session of this mode that was not there before', () => {
    const old = session('deviationFlashCards', 5, 10)
    const other = session('speedDrill', 3, 3)
    const fresh = session('deviationFlashCards', 9, 10)
    expect(recordedRound([fresh, other, old], new Set([old.id]), 'deviationFlashCards')).toBe(fresh)
    expect(recordedRound([old], new Set([old.id]), 'deviationFlashCards')).toBeNull()
  })
})
