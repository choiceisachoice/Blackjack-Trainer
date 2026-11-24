import { describe, it, expect } from 'vitest'
import { gradeForScore, MIN_GRADED_HANDS, sessionScores } from './session-scores'
import type { CasinoSessionConfig, CasinoSessionResult, PlayerHandRecord } from './types'
import { CasinoSessionEngine } from './session-engine'
import { CountingSystemId } from '../counting/types'

const CONFIG = { playStyle: 'counting' } as CasinoSessionConfig
const hand = {} as PlayerHandRecord

/** A result with the counts that matter here and nothing graded unless given. */
function result(over: Partial<CasinoSessionResult> = {}, hands = 12): CasinoSessionResult {
  return {
    config: CONFIG,
    hands: Array.from({ length: hands }, () => hand),
    startTime: 0, endTime: 0, durationSeconds: 0,
    startingBankroll: 1000, finalBankroll: 1000, netProfit: 0, peakBankroll: 1000, worstDrawdown: 0,
    betAccuracy: 100, playAccuracy: 100, countAccuracy: 100, deviationAccuracy: 100, insuranceAccuracy: 100,
    overallScore: 0,
    totalCountChecks: 0, correctRCChecks: 0, correctTCChecks: 0, avgRCError: 0, avgTCError: 0,
    totalPlayDecisions: 0, correctPlayDecisions: 0, totalDeviationSituations: 0, correctDeviations: 0, missedDeviations: [],
    totalBetDecisions: 0, correctBetDecisions: 0, avgOverbetAmount: 0, avgUnderbetAmount: 0,
    totalInsuranceOffers: 0, correctInsuranceDecisions: 0,
    grade: 'F', gradeColor: '#dc2626',
    ...over,
  }
}

describe('sessionScores', () => {
  it('says "no data" for a category with nothing in it, not 100 %', () => {
    // The audit's summary: two hands, no count check, no deviation spot —
    // and "Counting 100.0 % (RC: 0/0)", "Deviations 100.0 % (0/0)".
    const s = sessionScores(result({ totalBetDecisions: 2, correctBetDecisions: 1, totalPlayDecisions: 1, correctPlayDecisions: 0, overallScore: 19.2 }, 2))
    expect(s.count).toBeNull()
    expect(s.deviation).toBeNull()
    expect(s.insurance).toBeNull()
    expect(s.bet).toBe(50)
    expect(s.play).toBe(0)
  })

  it('gives no letter below the minimum number of hands — two hands made a red F', () => {
    const s = sessionScores(result({ totalBetDecisions: 2, correctBetDecisions: 1, totalPlayDecisions: 1, overallScore: 19.2 }, 2))
    expect(s.grade).toBeNull()
    // The score exists; it is the letter that waits.
    expect(s.overall).toBeCloseTo(19.2)
  })

  it('grades from the minimum on', () => {
    const graded = { totalPlayDecisions: 12, correctPlayDecisions: 11, overallScore: 91.7, grade: 'A', gradeColor: '#22c55e' }
    const at = sessionScores(result(graded, MIN_GRADED_HANDS))
    expect(at.grade).toEqual({ letter: 'A', color: '#22c55e' })
    const below = sessionScores(result(graded, MIN_GRADED_HANDS - 1))
    expect(below.grade).toBeNull()
  })

  it('has no overall score, and no grade, when nothing at all was graded', () => {
    const s = sessionScores(result({}, 30))
    expect(s.overall).toBeNull()
    expect(s.grade).toBeNull()
  })

  it('leaves the bets, the count and the deviations out of basic play', () => {
    const basic = result({
      config: { playStyle: 'basic' } as CasinoSessionConfig,
      totalBetDecisions: 12, correctBetDecisions: 12, totalCountChecks: 2, correctRCChecks: 2, correctTCChecks: 2,
      totalPlayDecisions: 14, correctPlayDecisions: 13, overallScore: 92.9,
    })
    const s = sessionScores(basic)
    expect(s.bet).toBeNull()
    expect(s.count).toBeNull()
    expect(s.deviation).toBeNull()
    expect(s.play).toBeCloseTo(92.86, 1)
  })

  it('counts a count check as two answers, running and true', () => {
    const s = sessionScores(result({ totalCountChecks: 4, correctRCChecks: 3, correctTCChecks: 2, overallScore: 62.5 }))
    expect(s.count).toBeCloseTo(62.5)
  })
})

describe('gradeForScore', () => {
  it('is the table the engine stores its grade by', () => {
    expect(gradeForScore(95).letter).toBe('A+')
    expect(gradeForScore(90).letter).toBe('A')
    expect(gradeForScore(85).letter).toBe('B+')
    expect(gradeForScore(80).letter).toBe('B')
    expect(gradeForScore(70).letter).toBe('C')
    expect(gradeForScore(60).letter).toBe('D')
    expect(gradeForScore(59.9).letter).toBe('F')
  })

  it('agrees with the engine on a real session', () => {
    const engine = new CasinoSessionEngine({
      sessionMode: 'hands', targetHands: 10, targetMinutes: 15, numBots: 0, playerSeatIndex: 0, startingBankroll: 1000,
      minBet: 10, maxBet: 100, numDecks: 6, dealerHitsSoft17: false, doubleAfterSplit: true, surrenderAllowed: true,
      blackjackPays: 1.5, penetration: 0.75, maxSplitHands: 4, trainingMode: true, countCheckFrequency: 'never',
      showDeviationHints: false, countingSystem: CountingSystemId.HiLo, casinoAmbience: false,
    })
    const r = engine.calculateSessionResult(0, 1000)
    expect(r.grade).toBe(gradeForScore(r.overallScore).letter)
    expect(r.gradeColor).toBe(gradeForScore(r.overallScore).color)
  })
})
