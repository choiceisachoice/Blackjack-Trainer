import { describe, it, expect } from 'vitest'
import {
  normalRandom,
  calculateHouseEdge,
  kellyOptimalBet,
  calculateN0,
  calculateWeightedPlayerEdge,
  TC_DISTRIBUTION,
  EDGE_PER_TC,
  DEVIATION_TC_BONUS,
} from './math-utils'
import {
  ALL_PRESETS,
  PRESET_BASIC_STRATEGY,
  PRESET_CASUAL,
  PRESET_PROFESSIONAL,
  PRESET_HOSTILE,
  getBetMultiplier,
  calculateBankrollAnalysis,
  calculateAllPresets,
  getTCBreakdown,
} from './bankroll-calculator'
import type { BankrollParams } from './types'

// ---------------------------------------------------------------------------
// math-utils
// ---------------------------------------------------------------------------

describe('math-utils', () => {
  describe('normalRandom', () => {
    it('generates values with approximately correct mean', () => {
      const samples = 10000
      let sum = 0
      for (let i = 0; i < samples; i++) {
        sum += normalRandom(5, 1)
      }
      const mean = sum / samples
      expect(mean).toBeCloseTo(5, 0)
    })

    it('generates values with approximately correct standard deviation', () => {
      const samples = 10000
      const expectedMean = 0
      const expectedSd = 2
      const values: number[] = []
      for (let i = 0; i < samples; i++) {
        values.push(normalRandom(expectedMean, expectedSd))
      }
      const actualMean = values.reduce((a, b) => a + b, 0) / samples
      const variance = values.reduce((a, b) => a + (b - actualMean) ** 2, 0) / samples
      const sd = Math.sqrt(variance)
      expect(sd).toBeCloseTo(expectedSd, 0)
    })

    it('defaults to standard normal (mean=0, sd=1)', () => {
      const samples = 5000
      let sum = 0
      for (let i = 0; i < samples; i++) {
        sum += normalRandom()
      }
      const mean = sum / samples
      expect(Math.abs(mean)).toBeLessThan(0.1)
    })
  })

  describe('calculateHouseEdge', () => {
    it('returns approximately -0.22% for 6-deck S17 DAS surrender 3:2', () => {
      const edge = calculateHouseEdge({
        dealerHitsSoft17: false,
        doubleAfterSplit: true,
        surrenderAllowed: true,
        blackjackPays: 1.5,
        numDecks: 6,
      })
      expect(edge).toBeCloseTo(-0.0022, 4)
    })

    it('returns approximately -0.44% for 6-deck H17 DAS surrender 3:2', () => {
      const edge = calculateHouseEdge({
        dealerHitsSoft17: true,
        doubleAfterSplit: true,
        surrenderAllowed: true,
        blackjackPays: 1.5,
        numDecks: 6,
      })
      expect(edge).toBeCloseTo(-0.0044, 3)
    })

    it('returns correct edge for 6:5 unfavorable (H17, no DAS, no surrender, 8 deck)', () => {
      const edge = calculateHouseEdge({
        dealerHitsSoft17: true,
        doubleAfterSplit: false,
        surrenderAllowed: false,
        blackjackPays: 1.2,
        numDecks: 8,
      })
      expect(edge).toBeCloseTo(-0.0203, 4)
    })

    it('returns base edge with all default rules (H17, no DAS, no surrender, 3:2, 6 deck)', () => {
      const edge = calculateHouseEdge({
        dealerHitsSoft17: true,
        doubleAfterSplit: false,
        surrenderAllowed: false,
        blackjackPays: 1.5,
        numDecks: 6,
      })
      expect(edge).toBeCloseTo(-0.0064, 4)
    })

    it('6:5 blackjack is at least 1.3% worse than 3:2', () => {
      const threeTwo = calculateHouseEdge({
        dealerHitsSoft17: false, doubleAfterSplit: true,
        surrenderAllowed: true, blackjackPays: 1.5, numDecks: 6,
      })
      const sixFive = calculateHouseEdge({
        dealerHitsSoft17: false, doubleAfterSplit: true,
        surrenderAllowed: true, blackjackPays: 1.2, numDecks: 6,
      })
      expect(threeTwo - sixFive).toBeGreaterThan(0.013)
    })

    it('edge at TC 0 is negative for all standard rule sets', () => {
      const bestEdge = calculateHouseEdge({
        dealerHitsSoft17: false, doubleAfterSplit: true,
        surrenderAllowed: true, blackjackPays: 1.5, numDecks: 6,
      })
      const edgeAtTC0 = bestEdge + 0 * EDGE_PER_TC
      expect(edgeAtTC0).toBeLessThan(0)
    })

    it('edge at TC +2 is positive for 6-deck S17 DAS surrender', () => {
      const baseEdge = calculateHouseEdge({
        dealerHitsSoft17: false, doubleAfterSplit: true,
        surrenderAllowed: true, blackjackPays: 1.5, numDecks: 6,
      })
      const tcGain = EDGE_PER_TC + DEVIATION_TC_BONUS * 0.95
      const edgeAtTC2 = baseEdge + 2 * tcGain
      expect(edgeAtTC2).toBeGreaterThan(0)
    })

    it('handles 2-deck bonus', () => {
      const twoDeck = calculateHouseEdge({
        dealerHitsSoft17: true, doubleAfterSplit: false,
        surrenderAllowed: false, blackjackPays: 1.5, numDecks: 2,
      })
      const sixDeck = calculateHouseEdge({
        dealerHitsSoft17: true, doubleAfterSplit: false,
        surrenderAllowed: false, blackjackPays: 1.5, numDecks: 6,
      })
      expect(twoDeck).toBeGreaterThan(sixDeck)
    })
  })

  describe('kellyOptimalBet', () => {
    it('returns positive value for positive edge', () => {
      const bet = kellyOptimalBet(0.01, 1.3225, 50000)
      expect(bet).toBeGreaterThan(0)
      expect(bet).toBeCloseTo(0.01 / 1.3225 * 50000, 0)
    })

    it('returns 0 for zero edge', () => {
      expect(kellyOptimalBet(0, 1.3225, 50000)).toBe(0)
    })

    it('returns 0 for negative edge', () => {
      expect(kellyOptimalBet(-0.005, 1.3225, 50000)).toBe(0)
    })
  })

  describe('calculateN0', () => {
    it('returns correct N0 for positive EV', () => {
      const n0 = calculateN0(0.5, 50)
      expect(n0).toBe(10000)
    })

    it('returns Infinity for zero EV', () => {
      expect(calculateN0(0, 50)).toBe(Infinity)
    })

    it('returns Infinity for negative EV', () => {
      expect(calculateN0(-0.5, 50)).toBe(Infinity)
    })
  })

  describe('TC_DISTRIBUTION', () => {
    it('percentages sum to 1', () => {
      const sum = TC_DISTRIBUTION.reduce((s, d) => s + d.pct, 0)
      expect(sum).toBeCloseTo(1, 6)
    })

    it('has entries for TC 0 through 5', () => {
      expect(TC_DISTRIBUTION).toHaveLength(6)
      expect(TC_DISTRIBUTION[0].tc).toBe(0)
      expect(TC_DISTRIBUTION[5].tc).toBe(5)
    })
  })

  describe('calculateWeightedPlayerEdge', () => {
    const proConfig = {
      dealerHitsSoft17: false,
      doubleAfterSplit: true,
      surrenderAllowed: true,
      blackjackPays: 1.5,
      numDecks: 6,
      betSpread: { 1: 2, 2: 4, 3: 8, 4: 12, 5: 16 } as Record<number, number>,
      deviationAccuracy: 0.95,
      countingAccuracy: 0.95,
    }

    const worstConfig = {
      dealerHitsSoft17: true,
      doubleAfterSplit: false,
      surrenderAllowed: false,
      blackjackPays: 1.2,
      numDecks: 8,
      betSpread: { 1: 1, 2: 2, 3: 3, 4: 4, 5: 5 } as Record<number, number>,
      deviationAccuracy: 0.5,
      countingAccuracy: 0.85,
    }

    it('returns positive weighted edge for professional config', () => {
      const edge = calculateWeightedPlayerEdge(proConfig, getBetMultiplier)
      expect(edge).toBeGreaterThan(0)
    })

    it('returns negative weighted edge for worst-case config', () => {
      const edge = calculateWeightedPlayerEdge(worstConfig, getBetMultiplier)
      expect(edge).toBeLessThan(0)
    })

    it('higher counting accuracy produces higher edge', () => {
      const low = calculateWeightedPlayerEdge({ ...proConfig, countingAccuracy: 0.7 }, getBetMultiplier)
      const high = calculateWeightedPlayerEdge({ ...proConfig, countingAccuracy: 1.0 }, getBetMultiplier)
      expect(high).toBeGreaterThan(low)
    })

    it('wider bet spread produces higher edge', () => {
      const narrow = calculateWeightedPlayerEdge(
        { ...proConfig, betSpread: { 1: 1, 2: 2, 3: 3, 4: 4, 5: 5 } },
        getBetMultiplier,
      )
      const wide = calculateWeightedPlayerEdge(
        { ...proConfig, betSpread: { 1: 2, 2: 8, 3: 16, 4: 24, 5: 32 } },
        getBetMultiplier,
      )
      expect(wide).toBeGreaterThan(narrow)
    })
  })
})

// ---------------------------------------------------------------------------
// getBetMultiplier
// ---------------------------------------------------------------------------

describe('getBetMultiplier', () => {
  const spread: Record<number, number> = { 1: 2, 2: 4, 3: 8, 5: 16 }

  it('returns matching multiplier for exact TC', () => {
    expect(getBetMultiplier(spread, 3)).toBe(8)
  })

  it('returns highest matching key for TC between keys', () => {
    expect(getBetMultiplier(spread, 4)).toBe(8)
  })

  it('returns max multiplier for TC above highest key', () => {
    expect(getBetMultiplier(spread, 10)).toBe(16)
  })

  it('returns default 1 for TC below all keys', () => {
    expect(getBetMultiplier(spread, -3)).toBe(1)
  })

  it('returns correct multiplier at TC +1', () => {
    expect(getBetMultiplier(spread, 1)).toBe(2)
  })
})

// ---------------------------------------------------------------------------
// Presets
// ---------------------------------------------------------------------------

describe('presets', () => {
  it('ALL_PRESETS contains exactly 5 presets', () => {
    expect(ALL_PRESETS).toHaveLength(5)
  })

  it('all presets have unique IDs', () => {
    const ids = ALL_PRESETS.map(p => p.id)
    expect(new Set(ids).size).toBe(5)
  })

  it('all presets have valid rules', () => {
    for (const preset of ALL_PRESETS) {
      expect(preset.rules.numDecks).toBeGreaterThan(0)
      expect(preset.rules.penetration).toBeGreaterThan(0)
      expect(preset.rules.penetration).toBeLessThanOrEqual(1)
      expect(preset.rules.blackjackPays).toBeGreaterThan(0)
      expect(preset.handsPerHour).toBeGreaterThan(0)
      expect(preset.defaultBankroll).toBeGreaterThan(0)
      expect(preset.defaultMinBet).toBeGreaterThan(0)
    }
  })

  it('basic strategy preset has zero counting accuracy', () => {
    expect(PRESET_BASIC_STRATEGY.countingAccuracy).toBe(0)
    expect(PRESET_BASIC_STRATEGY.deviationAccuracy).toBe(0)
  })

  it('basic strategy preset has flat bet spread', () => {
    const mults = Object.values(PRESET_BASIC_STRATEGY.betSpread)
    expect(mults.every(m => m === 1)).toBe(true)
  })

  it('professional preset has favorable rules', () => {
    expect(PRESET_PROFESSIONAL.rules.dealerHitsSoft17).toBe(false)
    expect(PRESET_PROFESSIONAL.rules.doubleAfterSplit).toBe(true)
    expect(PRESET_PROFESSIONAL.rules.surrenderAllowed).toBe(true)
    expect(PRESET_PROFESSIONAL.rules.blackjackPays).toBe(1.5)
    expect(PRESET_PROFESSIONAL.countingAccuracy).toBeGreaterThanOrEqual(0.9)
    expect(PRESET_PROFESSIONAL.deviationAccuracy).toBeGreaterThanOrEqual(0.9)
  })

  it('hostile preset has unfavorable rules', () => {
    expect(PRESET_HOSTILE.rules.dealerHitsSoft17).toBe(true)
    expect(PRESET_HOSTILE.rules.doubleAfterSplit).toBe(false)
    expect(PRESET_HOSTILE.rules.surrenderAllowed).toBe(false)
    expect(PRESET_HOSTILE.rules.blackjackPays).toBe(1.2)
    expect(PRESET_HOSTILE.rules.numDecks).toBe(8)
  })

  it('presets are ordered by skill level (basic → casual → serious → pro → hostile)', () => {
    expect(ALL_PRESETS[0].id).toBe('basicStrategy')
    expect(ALL_PRESETS[1].id).toBe('casual')
    expect(ALL_PRESETS[2].id).toBe('serious')
    expect(ALL_PRESETS[3].id).toBe('professional')
    expect(ALL_PRESETS[4].id).toBe('hostile')
  })
})

// ---------------------------------------------------------------------------
// calculateBankrollAnalysis
// ---------------------------------------------------------------------------

describe('calculateBankrollAnalysis', () => {
  const defaultParams: BankrollParams = {
    bankroll: 100000,
    minBet: 100,
    sessionsPerWeek: 3,
    hoursPerSession: 3,
  }

  it('professional preset has positive player edge', () => {
    const result = calculateBankrollAnalysis(PRESET_PROFESSIONAL, defaultParams)
    expect(result.hasEdge).toBe(true)
    expect(result.playerEdge).toBeGreaterThan(0)
  })

  it('professional preset has positive hourly, monthly, yearly EV', () => {
    const result = calculateBankrollAnalysis(PRESET_PROFESSIONAL, defaultParams)
    expect(result.hourlyEV).toBeGreaterThan(0)
    expect(result.monthlyEV).toBeGreaterThan(0)
    expect(result.yearlyEV).toBeGreaterThan(0)
  })

  it('basic strategy preset has negative edge (no counting)', () => {
    const result = calculateBankrollAnalysis(PRESET_BASIC_STRATEGY, {
      ...defaultParams,
      minBet: 15,
      bankroll: 5000,
    })
    expect(result.hasEdge).toBe(false)
    expect(result.playerEdge).toBeLessThan(0)
    expect(result.hourlyEV).toBeLessThan(0)
    expect(result.riskOfRuin).toBe(1)
    expect(result.riskLevel).toBe('extreme')
  })

  it('hostile preset has negative edge', () => {
    const result = calculateBankrollAnalysis(PRESET_HOSTILE, {
      bankroll: 10000,
      minBet: 25,
      sessionsPerWeek: 3,
      hoursPerSession: 3,
    })
    expect(result.hasEdge).toBe(false)
    expect(result.hourlyEV).toBeLessThan(0)
  })

  it('risk of ruin is between 0 and 1', () => {
    for (const preset of ALL_PRESETS) {
      const result = calculateBankrollAnalysis(preset, {
        bankroll: preset.defaultBankroll,
        minBet: preset.defaultMinBet,
        sessionsPerWeek: 3,
        hoursPerSession: 3,
      })
      expect(result.riskOfRuin).toBeGreaterThanOrEqual(0)
      expect(result.riskOfRuin).toBeLessThanOrEqual(1)
    }
  })

  it('larger bankroll reduces risk of ruin', () => {
    const small = calculateBankrollAnalysis(PRESET_PROFESSIONAL, { ...defaultParams, bankroll: 10000 })
    const large = calculateBankrollAnalysis(PRESET_PROFESSIONAL, { ...defaultParams, bankroll: 200000 })
    expect(large.riskOfRuin).toBeLessThan(small.riskOfRuin)
  })

  it('higher min bet increases hourly EV (with positive edge)', () => {
    const low = calculateBankrollAnalysis(PRESET_PROFESSIONAL, { ...defaultParams, minBet: 25 })
    const high = calculateBankrollAnalysis(PRESET_PROFESSIONAL, { ...defaultParams, minBet: 200 })
    expect(high.hourlyEV).toBeGreaterThan(low.hourlyEV)
  })

  it('more sessions/week increases monthly EV proportionally', () => {
    const few = calculateBankrollAnalysis(PRESET_PROFESSIONAL, { ...defaultParams, sessionsPerWeek: 1 })
    const many = calculateBankrollAnalysis(PRESET_PROFESSIONAL, { ...defaultParams, sessionsPerWeek: 5 })
    expect(many.monthlyEV).toBeGreaterThan(few.monthlyEV)
    // Should scale roughly linearly (5x sessions = ~5x monthly EV)
    const ratio = many.monthlyEV / few.monthlyEV
    expect(ratio).toBeCloseTo(5, 0)
  })

  it('longer sessions increase monthly EV proportionally', () => {
    const short = calculateBankrollAnalysis(PRESET_PROFESSIONAL, { ...defaultParams, hoursPerSession: 1 })
    const long = calculateBankrollAnalysis(PRESET_PROFESSIONAL, { ...defaultParams, hoursPerSession: 6 })
    const ratio = long.monthlyEV / short.monthlyEV
    expect(ratio).toBeCloseTo(6, 0)
  })

  it('N0 is finite for positive-edge presets', () => {
    const result = calculateBankrollAnalysis(PRESET_PROFESSIONAL, defaultParams)
    expect(result.n0Hands).toBeGreaterThan(0)
    expect(isFinite(result.n0Hands)).toBe(true)
    expect(result.n0Hours).toBeGreaterThan(0)
    expect(isFinite(result.n0Hours)).toBe(true)
  })

  it('N0 is infinite for negative-edge presets', () => {
    const result = calculateBankrollAnalysis(PRESET_BASIC_STRATEGY, {
      ...defaultParams,
      minBet: 15,
      bankroll: 5000,
    })
    expect(result.n0Hands).toBe(Infinity)
  })

  it('recommended bankroll is 0 for negative-edge presets', () => {
    const result = calculateBankrollAnalysis(PRESET_BASIC_STRATEGY, {
      ...defaultParams,
      minBet: 15,
      bankroll: 5000,
    })
    expect(result.recommendedBankroll).toBe(0)
  })

  it('recommended bankroll is positive for positive-edge presets', () => {
    const result = calculateBankrollAnalysis(PRESET_PROFESSIONAL, defaultParams)
    expect(result.recommendedBankroll).toBeGreaterThan(0)
  })

  it('Kelly bet is 0 for negative-edge presets', () => {
    const result = calculateBankrollAnalysis(PRESET_BASIC_STRATEGY, {
      ...defaultParams,
      minBet: 15,
      bankroll: 5000,
    })
    expect(result.kellyBet).toBe(0)
  })

  it('Kelly bet is positive for positive-edge presets', () => {
    const result = calculateBankrollAnalysis(PRESET_PROFESSIONAL, defaultParams)
    expect(result.kellyBet).toBeGreaterThan(0)
  })

  it('max bet equals minBet times highest spread multiplier', () => {
    const result = calculateBankrollAnalysis(PRESET_PROFESSIONAL, defaultParams)
    const maxMult = Math.max(...Object.values(PRESET_PROFESSIONAL.betSpread))
    expect(result.maxBet).toBe(defaultParams.minBet * maxMult)
  })

  it('average bet is between min bet and max bet', () => {
    const result = calculateBankrollAnalysis(PRESET_PROFESSIONAL, defaultParams)
    expect(result.averageBet).toBeGreaterThanOrEqual(defaultParams.minBet)
    expect(result.averageBet).toBeLessThanOrEqual(result.maxBet)
  })

  it('risk level is correctly classified', () => {
    // Low risk: large bankroll, professional
    const low = calculateBankrollAnalysis(PRESET_PROFESSIONAL, { ...defaultParams, bankroll: 500000 })
    expect(low.riskLevel).toBe('low')

    // Extreme risk: no edge
    const extreme = calculateBankrollAnalysis(PRESET_BASIC_STRATEGY, {
      ...defaultParams,
      minBet: 15,
      bankroll: 5000,
    })
    expect(extreme.riskLevel).toBe('extreme')
  })

  it('results are deterministic (same input = same output)', () => {
    const r1 = calculateBankrollAnalysis(PRESET_PROFESSIONAL, defaultParams)
    const r2 = calculateBankrollAnalysis(PRESET_PROFESSIONAL, defaultParams)
    expect(r1.hourlyEV).toBe(r2.hourlyEV)
    expect(r1.riskOfRuin).toBe(r2.riskOfRuin)
    expect(r1.playerEdge).toBe(r2.playerEdge)
    expect(r1.n0Hands).toBe(r2.n0Hands)
    expect(r1.monthlyEV).toBe(r2.monthlyEV)
  })

  it('casual counter has smaller edge than professional', () => {
    const casual = calculateBankrollAnalysis(PRESET_CASUAL, {
      bankroll: 5000,
      minBet: 10,
      sessionsPerWeek: 3,
      hoursPerSession: 3,
    })
    const pro = calculateBankrollAnalysis(PRESET_PROFESSIONAL, defaultParams)
    // Both have favorable rules, but pro has better spread and accuracy
    expect(pro.playerEdge).toBeGreaterThan(casual.playerEdge)
  })

  it('house edge is always negative', () => {
    for (const preset of ALL_PRESETS) {
      const result = calculateBankrollAnalysis(preset, {
        bankroll: preset.defaultBankroll,
        minBet: preset.defaultMinBet,
        sessionsPerWeek: 3,
        hoursPerSession: 3,
      })
      expect(result.houseEdge).toBeLessThan(0)
    }
  })
})

// ---------------------------------------------------------------------------
// calculateAllPresets
// ---------------------------------------------------------------------------

describe('calculateAllPresets', () => {
  it('returns results for all 5 presets', () => {
    const results = calculateAllPresets({ sessionsPerWeek: 3, hoursPerSession: 3 })
    expect(results).toHaveLength(5)
  })

  it('each result contains preset and analysis', () => {
    const results = calculateAllPresets({ sessionsPerWeek: 3, hoursPerSession: 3 })
    for (const { preset, analysis } of results) {
      expect(preset.id).toBeTruthy()
      // `typeof NaN === 'number'`, so a type check would still pass if the
      // maths divided by zero. Assert the properties that actually hold.
      expect(Number.isFinite(analysis.hourlyEV)).toBe(true)
      expect(analysis.riskOfRuin).toBeGreaterThanOrEqual(0)
      expect(analysis.riskOfRuin).toBeLessThanOrEqual(1)
    }
  })

  it('uses each preset default bankroll and minBet', () => {
    const results = calculateAllPresets({ sessionsPerWeek: 3, hoursPerSession: 3 })
    // Professional preset has default bankroll $100,000 and minBet $100
    const pro = results.find(r => r.preset.id === 'professional')!
    expect(pro.analysis.maxBet).toBe(
      pro.preset.defaultMinBet * Math.max(...Object.values(pro.preset.betSpread)),
    )
  })
})

// ---------------------------------------------------------------------------
// getTCBreakdown
// ---------------------------------------------------------------------------

describe('getTCBreakdown', () => {
  it('returns 6 rows (TC 0 through 5)', () => {
    const rows = getTCBreakdown(PRESET_PROFESSIONAL, 100)
    expect(rows).toHaveLength(6)
  })

  it('percentages sum to 1', () => {
    const rows = getTCBreakdown(PRESET_PROFESSIONAL, 100)
    const total = rows.reduce((s, r) => s + r.pct, 0)
    expect(total).toBeCloseTo(1, 6)
  })

  it('bet at TC 0 is minBet (spread maps TC<1 to 1x)', () => {
    const rows = getTCBreakdown(PRESET_PROFESSIONAL, 100)
    // TC 0 maps to 1x (below spread key 1)
    expect(rows[0].bet).toBe(100)
  })

  it('bet increases with TC for professional spread', () => {
    const rows = getTCBreakdown(PRESET_PROFESSIONAL, 100)
    // Each TC level should have bet >= previous level
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i].bet).toBeGreaterThanOrEqual(rows[i - 1].bet)
    }
  })

  it('edge increases with TC', () => {
    const rows = getTCBreakdown(PRESET_PROFESSIONAL, 100)
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i].edge).toBeGreaterThan(rows[i - 1].edge)
    }
  })

  it('flat bet spread shows same bet at all TC levels', () => {
    const rows = getTCBreakdown(PRESET_BASIC_STRATEGY, 15)
    for (const row of rows) {
      expect(row.bet).toBe(15)
    }
  })
})
