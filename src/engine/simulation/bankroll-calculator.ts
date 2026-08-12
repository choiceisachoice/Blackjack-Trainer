import type { BankrollPreset, BankrollParams, BankrollAnalysis } from './types'
import {
  calculateHouseEdge,
  calculateWeightedPlayerEdge,
  kellyOptimalBet,
  calculateN0,
  TC_DISTRIBUTION,
  HAND_SD,
  EDGE_PER_TC,
  DEVIATION_TC_BONUS,
} from './math-utils'

// ─── 5 Skill-Level Presets ──────────────────────────────────────

/**
 * Basic Strategy Only — no counting, flat betting.
 * House edge: ~-0.22% (S17/DAS/Surr/3:2/6-deck)
 * Hourly EV: negative (no counting edge)
 */
export const PRESET_BASIC_STRATEGY: BankrollPreset = {
  id: 'basicStrategy',
  labelKey: 'sim.preset.basic.label',
  descKey: 'sim.preset.basic.desc',
  icon: '\uD83C\uDCCF',
  rules: {
    numDecks: 6,
    penetration: 0.75,
    dealerHitsSoft17: false,
    doubleAfterSplit: true,
    surrenderAllowed: true,
    blackjackPays: 1.5,
  },
  betSpread: { 1: 1, 2: 1, 3: 1, 4: 1, 5: 1 }, // flat bet
  countingAccuracy: 0,
  deviationAccuracy: 0,
  handsPerHour: 80,
  defaultBankroll: 5000,
  defaultMinBet: 15,
}

/**
 * Casual Counter — learning Hi-Lo, small spread.
 * Counting accuracy: 80%, no deviations
 * Spread: 1-5 ($15-$75)
 */
export const PRESET_CASUAL: BankrollPreset = {
  id: 'casual',
  labelKey: 'sim.preset.casual.label',
  descKey: 'sim.preset.casual.desc',
  icon: '\uD83C\uDF31',
  rules: {
    numDecks: 6,
    penetration: 0.75,
    dealerHitsSoft17: false,
    doubleAfterSplit: true,
    surrenderAllowed: true,
    blackjackPays: 1.5,
  },
  betSpread: { 1: 1, 2: 2, 3: 3, 4: 4, 5: 5 },
  countingAccuracy: 0.80,
  deviationAccuracy: 0,
  handsPerHour: 70,
  defaultBankroll: 5000,
  defaultMinBet: 10,
}

/**
 * Serious Player — solid counting, moderate spread.
 * Counting accuracy: 90%, deviations at 85%
 * Spread: 1-12 ($25-$300)
 */
export const PRESET_SERIOUS: BankrollPreset = {
  id: 'serious',
  labelKey: 'sim.preset.serious.label',
  descKey: 'sim.preset.serious.desc',
  icon: '\uD83C\uDFAF',
  rules: {
    numDecks: 6,
    penetration: 0.75,
    dealerHitsSoft17: false,
    doubleAfterSplit: true,
    surrenderAllowed: true,
    blackjackPays: 1.5,
  },
  betSpread: { 1: 2, 2: 4, 3: 8, 4: 10, 5: 12 },
  countingAccuracy: 0.90,
  deviationAccuracy: 0.85,
  handsPerHour: 80,
  defaultBankroll: 20000,
  defaultMinBet: 25,
}

/**
 * Professional — near-perfect counting, aggressive spread.
 * Counting accuracy: 95%, deviations at 95%
 * Spread: 1-16 ($100-$1,600)
 */
export const PRESET_PROFESSIONAL: BankrollPreset = {
  id: 'professional',
  labelKey: 'sim.preset.pro.label',
  descKey: 'sim.preset.pro.desc',
  icon: '\uD83D\uDC8E',
  rules: {
    numDecks: 6,
    penetration: 0.80,
    dealerHitsSoft17: false,
    doubleAfterSplit: true,
    surrenderAllowed: true,
    blackjackPays: 1.5,
  },
  betSpread: { 1: 2, 2: 4, 3: 8, 4: 12, 5: 16 },
  countingAccuracy: 0.95,
  deviationAccuracy: 0.95,
  handsPerHour: 100,
  defaultBankroll: 100000,
  defaultMinBet: 100,
}

/**
 * Hostile Table — worst common casino conditions.
 * H17, 6:5 BJ, no DAS, no surrender, 8 decks, shallow penetration
 */
export const PRESET_HOSTILE: BankrollPreset = {
  id: 'hostile',
  labelKey: 'sim.preset.hostile.label',
  descKey: 'sim.preset.hostile.desc',
  icon: '\u2620\uFE0F',
  rules: {
    numDecks: 8,
    penetration: 0.65,
    dealerHitsSoft17: true,
    doubleAfterSplit: false,
    surrenderAllowed: false,
    blackjackPays: 1.2,
  },
  betSpread: { 1: 2, 2: 4, 3: 8, 4: 12, 5: 16 },
  countingAccuracy: 0.90,
  deviationAccuracy: 0.85,
  handsPerHour: 80,
  defaultBankroll: 10000,
  defaultMinBet: 25,
}

/** All 5 presets in display order. */
export const ALL_PRESETS: BankrollPreset[] = [
  PRESET_BASIC_STRATEGY,
  PRESET_CASUAL,
  PRESET_SERIOUS,
  PRESET_PROFESSIONAL,
  PRESET_HOSTILE,
]

// ─── Bet Multiplier Lookup ──────────────────────────────────────

/**
 * Look up bet multiplier from bet spread for a given true count.
 * Searches keys in descending order, returns first key where tc >= key.
 */
export function getBetMultiplier(betSpread: Record<number, number>, tc: number): number {
  const keys = Object.keys(betSpread).map(Number).sort((a, b) => b - a)
  for (const key of keys) {
    if (tc >= key) return betSpread[key]
  }
  return 1
}

// ─── Analytical Calculator ──────────────────────────────────────

/**
 * Calculate bankroll analysis from a preset and user-adjustable parameters.
 * All results are deterministic — no Monte Carlo randomness.
 */
export function calculateBankrollAnalysis(
  preset: BankrollPreset,
  params: BankrollParams,
): BankrollAnalysis {
  const { rules, betSpread, countingAccuracy, deviationAccuracy, handsPerHour } = preset
  const { bankroll, minBet, sessionsPerWeek, hoursPerSession } = params

  // Base house edge from casino rules
  const houseEdge = calculateHouseEdge(rules)

  // Weighted player edge accounting for bet spread, counting, deviations
  const playerEdge = calculateWeightedPlayerEdge(
    {
      ...rules,
      betSpread,
      deviationAccuracy,
      countingAccuracy,
    },
    getBetMultiplier,
  )

  // Theoretical average bet from TC distribution
  let averageBet = 0
  for (const { tc, pct } of TC_DISTRIBUTION) {
    averageBet += minBet * getBetMultiplier(betSpread, tc) * pct
  }

  // Max bet at highest TC
  const maxMult = Math.max(...Object.values(betSpread))
  const maxBet = minBet * maxMult

  // Per-hand metrics
  const evPerHand = playerEdge * averageBet
  const sdPerHand = HAND_SD * averageBet

  // Time-based metrics
  const hourlyEV = evPerHand * handsPerHour
  const hoursPerWeek = sessionsPerWeek * hoursPerSession
  const weeklyEV = hourlyEV * hoursPerWeek
  const monthlyEV = weeklyEV * 4.33 // avg weeks per month
  const yearlyEV = weeklyEV * 52

  const hasEdge = playerEdge > 0

  // N-Zero: hands and hours to overcome variance
  const n0Hands = evPerHand > 0 ? calculateN0(evPerHand, sdPerHand) : Infinity
  const n0Hours = isFinite(n0Hands) ? n0Hands / handsPerHour : Infinity

  // Analytical Risk of Ruin: RoR = e^(-2 * EV * Bankroll / Variance)
  const variance = sdPerHand * sdPerHand
  const riskOfRuin = evPerHand > 0 && variance > 0
    ? Math.min(1, Math.max(0, Math.exp((-2 * evPerHand * bankroll) / variance)))
    : 1

  // Recommended bankroll for <5% risk of ruin
  // From RoR formula: B = -variance * ln(0.05) / (2 * EV)
  const recommendedBankroll = evPerHand > 0 && variance > 0
    ? Math.ceil((-variance * Math.log(0.05)) / (2 * evPerHand))
    : Infinity

  // Kelly criterion optimal bet
  const kellyBet = kellyOptimalBet(playerEdge, HAND_SD * HAND_SD, bankroll)

  // Risk level assessment
  let riskLevel: BankrollAnalysis['riskLevel']
  if (!hasEdge) {
    riskLevel = 'extreme'
  } else if (riskOfRuin < 0.05) {
    riskLevel = 'low'
  } else if (riskOfRuin <= 0.15) {
    riskLevel = 'moderate'
  } else {
    riskLevel = 'high'
  }

  return {
    houseEdge,
    playerEdge,
    evPerHand,
    sdPerHand,
    hourlyEV,
    monthlyEV,
    yearlyEV,
    riskOfRuin,
    n0Hands: Math.round(n0Hands),
    n0Hours: Math.round(n0Hours),
    recommendedBankroll: isFinite(recommendedBankroll) ? recommendedBankroll : 0,
    kellyBet,
    averageBet,
    maxBet,
    hasEdge,
    riskLevel,
  }
}

/**
 * Calculate analysis for all 5 presets with the same user params,
 * using each preset's default bankroll and minBet.
 * Useful for the comparison table.
 */
export function calculateAllPresets(
  params: Pick<BankrollParams, 'sessionsPerWeek' | 'hoursPerSession'>,
): { preset: BankrollPreset; analysis: BankrollAnalysis }[] {
  return ALL_PRESETS.map(preset => ({
    preset,
    analysis: calculateBankrollAnalysis(preset, {
      bankroll: preset.defaultBankroll,
      minBet: preset.defaultMinBet,
      sessionsPerWeek: params.sessionsPerWeek,
      hoursPerSession: params.hoursPerSession,
    }),
  }))
}

/**
 * Get the TC breakdown table for a preset with given min bet.
 * Shows edge, bet size, and EV per hand at each true count.
 */
export function getTCBreakdown(
  preset: BankrollPreset,
  minBet: number,
): { tc: number; label: string; pct: number; bet: number; edge: number; evPerHand: number }[] {
  const baseEdge = calculateHouseEdge(preset.rules)
  const tcGain = EDGE_PER_TC + DEVIATION_TC_BONUS * preset.deviationAccuracy

  const TC_LABELS: Record<number, string> = {
    0: '\u2264 0', 1: '+1', 2: '+2', 3: '+3', 4: '+4', 5: '+5+',
  }

  return TC_DISTRIBUTION.map(({ tc, pct }) => {
    const mult = getBetMultiplier(preset.betSpread, tc)
    const bet = minBet * mult
    const edge = baseEdge + tc * tcGain * preset.countingAccuracy
    const evPerHand = edge * bet
    return {
      tc,
      label: TC_LABELS[tc] ?? `+${tc}`,
      pct,
      bet,
      edge,
      evPerHand,
    }
  })
}
