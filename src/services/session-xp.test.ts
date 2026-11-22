import { describe, it, expect } from 'vitest'
import { XP_REWARDS, XP_PER_CORRECT, DAILY_MODE_XP_CAP, calculateSessionXP, sessionXP, sessionXPEarned, personalBestXP, PERSONAL_BEST_XP } from './level-system'
import type { TrainingSessionResult } from './stats-types'
import { CountingSystemId } from '../engine/counting/types'

function makeSession(overrides: Partial<TrainingSessionResult> = {}): TrainingSessionResult {
  return {
    id: crypto.randomUUID(),
    mode: 'speedDrill',
    timestamp: new Date().toISOString(),
    countingSystem: CountingSystemId.HiLo,
    durationSeconds: 120,
    totalQuestions: 20,
    correctAnswers: 16,
    accuracy: 0.8,
    bestStreak: 5,
    details: { type: 'speedDrill', cardsPerRound: 10, speedMs: 1000, rcErrors: [] },
    ...overrides,
  }
}

/**
 * What a session pays (16 Nov 2026).
 *
 * It used to be 25 XP for finishing any session plus up to 70 for its accuracy
 * whatever its size: three correct flashcards paid 95 XP, and many short
 * sessions were the cheapest way up. Now the answers are what is paid.
 */
describe('sessionXPEarned — paid per correct answer', () => {
  const cards = (correct: number, total: number) =>
    makeSession({ mode: 'deviationFlashCards', correctAnswers: correct, totalQuestions: total, accuracy: total ? correct / total : 0 })

  it('a session with nothing right pays nothing — finishing is not the work', () => {
    expect(sessionXPEarned(cards(0, 20))).toBe(0)
    expect(sessionXPEarned(cards(0, 0))).toBe(0)
  })

  it('pays each correct answer at the rate of its mode', () => {
    expect(sessionXPEarned(cards(12, 20))).toBe(12 * XP_PER_CORRECT.deviationFlashCards)
    expect(sessionXPEarned(makeSession({ mode: 'speedDrill', correctAnswers: 2, totalQuestions: 4 }))).toBe(2 * XP_PER_CORRECT.speedDrill)
    expect(sessionXPEarned(makeSession({ mode: 'casinoSession', correctAnswers: 10, totalQuestions: 20 }))).toBe(10 * XP_PER_CORRECT.casinoSession)
  })

  it('one long session and several short ones are worth the same', () => {
    const long = sessionXPEarned(cards(14, 20))
    const short = sessionXPEarned(cards(7, 10)) * 2
    expect(short).toBe(long)
  })

  it('accuracy multiplies the pay: x1.25 from 85 %, x1.5 from 95 %', () => {
    expect(sessionXPEarned(cards(16, 20))).toBe(32)   // 80 %
    expect(sessionXPEarned(cards(17, 20))).toBe(43)   // 85 %: 34 x 1.25, rounded
    expect(sessionXPEarned(cards(19, 20))).toBe(57)   // 95 %: 38 x 1.5
    expect(sessionXPEarned(cards(20, 20))).toBe(60)
  })

  it('three correct flashcards are six XP, not ninety-five', () => {
    // Below the sample (10 answers) a perfect score is not an accuracy.
    expect(sessionXPEarned(cards(3, 3))).toBe(6)
    expect(sessionXPEarned(cards(9, 9))).toBe(18)
    expect(sessionXPEarned(cards(10, 10))).toBe(30)
  })

  it('the Speed Drill proves its accuracy from three runs', () => {
    expect(sessionXPEarned(makeSession({ mode: 'speedDrill', correctAnswers: 3, totalQuestions: 3 }))).toBe(Math.round(3 * XP_PER_CORRECT.speedDrill * 1.5))
    expect(sessionXPEarned(makeSession({ mode: 'speedDrill', correctAnswers: 2, totalQuestions: 2 }))).toBe(2 * XP_PER_CORRECT.speedDrill)
  })

  it('a casino session is not paid for its profit', () => {
    const details = {
      type: 'casinoSession' as const, handsPlayed: 60, netProfit: 0, overallScore: 80,
      grade: 'B', betAccuracy: 80, playAccuracy: 80, countAccuracy: 80,
      deviationAccuracy: 80, numBots: 2, hadBlackjack: false,
      longestWinStreak: 0, splitAces: false, maxSplitHands: 1,
    }
    const even = makeSession({ mode: 'casinoSession', correctAnswers: 30, totalQuestions: 40, details })
    const lucky = makeSession({ mode: 'casinoSession', correctAnswers: 30, totalQuestions: 40, details: { ...details, netProfit: 5000 } })
    expect(sessionXPEarned(lucky)).toBe(sessionXPEarned(even))
  })

  it('never counts more correct answers than there were questions', () => {
    expect(sessionXPEarned(cards(50, 20))).toBe(sessionXPEarned(cards(20, 20)))
    expect(sessionXPEarned(cards(-5, 20))).toBe(0)
  })
})

describe('sessionXP — a mode pays up to a limit per day', () => {
  const day = '2026-11-16T10:00:00'
  const cards = (id: string, correct: number, timestamp = day, mode: TrainingSessionResult['mode'] = 'deviationFlashCards') =>
    makeSession({ id, mode, timestamp, correctAnswers: correct, totalQuestions: correct, accuracy: 1 })

  it('pays in full while the day is under the limit', () => {
    expect(sessionXP(cards('a', 20), [])).toEqual({ amount: 60, earned: 60, capped: false, base: 40, bonus: 20 })
    expect(calculateSessionXP(cards('a', 20))).toBe(60)
  })

  it('pays what is left of the limit, then nothing, and says so', () => {
    const first = cards('a', 20)   // 60
    const second = cards('b', 20)  // 60, makes 120
    const third = cards('c', 20)   // only 30 left
    expect(sessionXP(third, [second, first])).toEqual({ amount: DAILY_MODE_XP_CAP - 120, earned: 60, capped: true, base: 30, bonus: 0 })
    expect(sessionXP(cards('d', 20), [third, second, first])).toEqual({ amount: 0, earned: 60, capped: true, base: 0, bonus: 0 })
  })

  it('the limit is per mode', () => {
    const flash = [cards('a', 40), cards('b', 40)]   // well over the limit
    const drill = cards('c', 20, day, 'betSpread')
    expect(sessionXP(drill, flash).capped).toBe(false)
  })

  it('and per day: yesterday does not count', () => {
    const yesterday = [cards('a', 40, '2026-11-15T10:00:00'), cards('b', 40, '2026-11-15T12:00:00')]
    expect(sessionXP(cards('c', 20), yesterday)).toEqual({ amount: 60, earned: 60, capped: false, base: 40, bonus: 20 })
  })

  it('a session is never counted against itself', () => {
    const s = cards('a', 20)
    expect(sessionXP(s, [s]).amount).toBe(60)
  })

  it('no session alone pays more than the limit', () => {
    expect(sessionXP(cards('a', 500), []).amount).toBe(DAILY_MODE_XP_CAP)
  })
})

describe('what training is worth beside the other rewards', () => {
  it('a full day in one mode is worth more than a gold achievement, less than a diamond', () => {
    expect(DAILY_MODE_XP_CAP).toBeGreaterThan(XP_REWARDS.achievementGold)
    expect(DAILY_MODE_XP_CAP).toBeLessThan(XP_REWARDS.achievementDiamond)
  })
})

/**
 * A new personal best (18 Nov 2026) — the second half of the XP proposal.
 */
describe('personalBestXP', () => {
  const at = (day: number, hour: number) => new Date(2026, 10, day, hour).toISOString()
  const run = (correct: number, day: number, hour = 12, over: Partial<TrainingSessionResult> = {}) =>
    makeSession({ mode: 'deviationFlashCards', totalQuestions: 20, correctAnswers: correct, accuracy: correct / 20, timestamp: at(day, hour), ...over })
  const history = [run(14, 1), run(15, 2), run(16, 3)]   // best so far: 80%

  it('pays when the best in a mode is beaten', () => {
    expect(personalBestXP(run(17, 4), history)).toBe(PERSONAL_BEST_XP)
  })

  it('pays nothing for matching the best, or for falling short of it', () => {
    expect(personalBestXP(run(16, 4), history)).toBe(0)
    expect(personalBestXP(run(12, 4), history)).toBe(0)
  })

  it('needs three proven sessions before there is a best to beat', () => {
    expect(personalBestXP(run(20, 4), history.slice(0, 2))).toBe(0)
    // Sessions too small to prove anything are not history.
    const tiny = [run(14, 1), run(15, 2), run(3, 3, 12, { totalQuestions: 3, accuracy: 1 })]
    expect(personalBestXP(run(20, 4), tiny)).toBe(0)
  })

  it('cannot be set by a session too small to prove its accuracy', () => {
    expect(personalBestXP(run(3, 4, 12, { totalQuestions: 3, accuracy: 1 }), history)).toBe(0)
  })

  it('pays once a day in a mode, however often the best is raised', () => {
    const first = run(17, 4, 10)
    expect(personalBestXP(first, history)).toBe(PERSONAL_BEST_XP)
    expect(personalBestXP(run(18, 4, 11), [...history, first])).toBe(0)
    // The next day it can be beaten again.
    expect(personalBestXP(run(18, 5, 11), [...history, first])).toBe(PERSONAL_BEST_XP)
  })

  it('keeps each mode its own best', () => {
    const drill = makeSession({ mode: 'speedDrill', totalQuestions: 5, correctAnswers: 5, accuracy: 1, timestamp: at(4, 12) })
    expect(personalBestXP(drill, history)).toBe(0)
  })

  it('leaves the casino table out: its accuracy has its own awards', () => {
    const table = (c: number, d: number) => makeSession({ mode: 'casinoSession', totalQuestions: 40, correctAnswers: c, accuracy: c / 40, timestamp: at(d, 12) })
    expect(personalBestXP(table(40, 4), [table(30, 1), table(31, 2), table(32, 3)])).toBe(0)
  })
})

/**
 * What a session's XP is made of (21 Nov 2026) — the two lines the toast
 * shows for it. They have to add up to what was credited in every case, the
 * day's limit included, or the toast states a sum that is not the sum.
 */
describe('sessionXP — the answers and the accuracy on top', () => {
  const day = '2026-11-16T10:00:00'
  const cards = (id: string, correct: number, total: number) =>
    makeSession({ id, mode: 'deviationFlashCards', timestamp: day, correctAnswers: correct, totalQuestions: total, accuracy: correct / total })

  it('below 85 % there is no bonus: all of it is the answers', () => {
    expect(sessionXP(cards('a', 16, 20))).toMatchObject({ amount: 32, base: 32, bonus: 0 })
  })

  it('from 85 % and from 95 % the factor is the bonus', () => {
    expect(sessionXP(cards('a', 17, 20))).toMatchObject({ amount: 43, base: 34, bonus: 9 })
    expect(sessionXP(cards('a', 20, 20))).toMatchObject({ amount: 60, base: 40, bonus: 20 })
  })

  it('a session too small to prove its accuracy has no bonus', () => {
    expect(sessionXP(cards('a', 9, 9))).toMatchObject({ amount: 18, base: 18, bonus: 0 })
  })

  it('the limit takes the bonus first and the answers last', () => {
    // A perfect twenty is 40 for the answers and 20 on top. What is left of
    // the day's 150 decides how much of that is paid.
    const perfect = (id: string) => cards(id, 20, 20)                 // 60
    // 90 paid, 60 left: all of it.
    expect(sessionXP(perfect('a'), [perfect('x'), cards('y', 15, 20)]))
      .toMatchObject({ amount: 60, base: 40, bonus: 20, capped: false })
    // 100 paid, 50 left: the answers and half the bonus.
    expect(sessionXP(perfect('b'), [perfect('x'), cards('y', 20, 40)]))
      .toMatchObject({ amount: 50, base: 40, bonus: 10, capped: true })
    // 120 paid, 30 left: not even all the answers, and no bonus.
    expect(sessionXP(perfect('c'), [perfect('x'), perfect('y')]))
      .toMatchObject({ amount: 30, base: 30, bonus: 0, capped: true })
    // 130 paid, 20 left.
    expect(sessionXP(perfect('d'), [perfect('x'), perfect('y'), cards('z', 5, 20)]))
      .toMatchObject({ amount: 20, base: 20, bonus: 0, capped: true })
  })

  it('base and bonus are the amount, whatever the session and whatever came before', () => {
    const modes: TrainingSessionResult['mode'][] = ['speedDrill', 'casinoSession', 'deviationFlashCards', 'betSpread', 'deckEstimation']
    for (const mode of modes) {
      const earlier: TrainingSessionResult[] = []
      for (let i = 0; i < 12; i++) {
        const total = 3 + ((i * 7) % 40)
        const correct = Math.round(total * (0.5 + ((i * 3) % 6) / 10))
        const s = makeSession({ id: `${mode}-${i}`, mode, timestamp: day, correctAnswers: Math.min(correct, total), totalQuestions: total })
        const xp = sessionXP(s, earlier)
        expect(xp.base + xp.bonus).toBe(xp.amount)
        expect(xp.base).toBeGreaterThanOrEqual(0)
        expect(xp.bonus).toBeGreaterThanOrEqual(0)
        expect(xp.amount).toBeLessThanOrEqual(xp.earned)
        earlier.push(s)
      }
      // And the day as a whole never pays more than its limit.
      const paid = earlier.reduce((n, s, i) => n + sessionXP(s, earlier.slice(0, i)).amount, 0)
      expect(paid).toBeLessThanOrEqual(DAILY_MODE_XP_CAP)
    }
  })
})
