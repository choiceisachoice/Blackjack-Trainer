import type { SimulationConfig } from './types';

/** Base house edge for 6-deck H17 (player perspective, negative = house wins) */
const BASE_EDGE = -0.0064;
/** S17 advantage over H17 for the player */
const S17_MODIFIER = 0.0022;
/** DAS advantage for the player */
const DAS_MODIFIER = 0.0013;
/** Late surrender advantage for the player */
const SURRENDER_MODIFIER = 0.0007;
/** Penalty for 6:5 blackjack vs 3:2 */
const SIX_FIVE_MODIFIER = -0.0136;
/** Penalty for 8-deck vs 6-deck */
const EIGHT_DECK_MODIFIER = -0.0003;
/** Bonus for 2-deck vs 6-deck */
const TWO_DECK_MODIFIER = 0.0019;

/** Player edge gain per true count unit (without deviations) */
export const EDGE_PER_TC = 0.005;
/** Extra TC gain per unit of deviation accuracy (0.50% → 0.52% at perfect) */
export const DEVIATION_TC_BONUS = 0.0002;
/** Standard deviation per hand in units of bet */
export const HAND_SD = 1.15;
/** Assumed hands per hour for hourly EV */
export const HANDS_PER_HOUR = 100;

/**
 * Generate a normally distributed random number using Box-Muller transform.
 * @param mean - Center of the distribution (default 0)
 * @param stdDev - Standard deviation (default 1)
 */
export function normalRandom(mean: number = 0, stdDev: number = 1): number {
  let u1 = Math.random();
  const u2 = Math.random();
  while (u1 === 0) u1 = Math.random(); // avoid log(0)
  const z0 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return z0 * stdDev + mean;
}

/**
 * Calculate the base house edge for given casino rules (player perspective).
 * Negative return value means house has the advantage.
 */
export function calculateHouseEdge(
  config: Pick<SimulationConfig, 'dealerHitsSoft17' | 'doubleAfterSplit' | 'surrenderAllowed' | 'blackjackPays' | 'numDecks'>,
): number {
  let edge = BASE_EDGE;
  if (!config.dealerHitsSoft17) edge += S17_MODIFIER;
  if (config.doubleAfterSplit) edge += DAS_MODIFIER;
  if (config.surrenderAllowed) edge += SURRENDER_MODIFIER;
  if (config.blackjackPays < 1.5) edge += SIX_FIVE_MODIFIER;
  if (config.numDecks >= 8) edge += EIGHT_DECK_MODIFIER;
  if (config.numDecks === 2) edge += TWO_DECK_MODIFIER;
  return edge;
}

/**
 * Calculate Kelly Criterion optimal bet size.
 * Returns 0 if edge is non-positive (no advantage to exploit).
 * @param edge - Player edge as a decimal (e.g. 0.01 = 1%)
 * @param variance - Variance of hand outcomes (SD²)
 * @param bankroll - Current bankroll
 */
export function kellyOptimalBet(edge: number, variance: number, bankroll: number): number {
  if (edge <= 0) return 0;
  return (edge / variance) * bankroll;
}

/**
 * Calculate N-Zero: hands needed to overcome variance.
 * Returns Infinity if EV per hand is zero or negative.
 * @param evPerHand - Expected value per hand in dollars
 * @param sdPerHand - Standard deviation per hand in dollars
 */
export function calculateN0(evPerHand: number, sdPerHand: number): number {
  if (evPerHand <= 0) return Infinity;
  return (sdPerHand / evPerHand) ** 2;
}

/** TC distribution for 6-deck shoes (standard approximation) */
export const TC_DISTRIBUTION: { tc: number; pct: number }[] = [
  { tc: 0, pct: 0.56 },
  { tc: 1, pct: 0.18 },
  { tc: 2, pct: 0.12 },
  { tc: 3, pct: 0.07 },
  { tc: 4, pct: 0.04 },
  { tc: 5, pct: 0.03 },
];

/**
 * Calculate the weighted player edge accounting for bet spread and counting skill.
 * Formula: Σ(edgeAtTC × betSize × pct) / Σ(betSize × pct)
 * @param config - Simulation config with rules, bet spread, and accuracy values
 * @param getBetMult - Function to look up bet multiplier from spread for a given TC
 */
export function calculateWeightedPlayerEdge(
  config: Pick<SimulationConfig, 'dealerHitsSoft17' | 'doubleAfterSplit' | 'surrenderAllowed' | 'blackjackPays' | 'numDecks' | 'betSpread' | 'deviationAccuracy' | 'countingAccuracy'>,
  getBetMult: (spread: Record<number, number>, tc: number) => number,
): number {
  const baseEdge = calculateHouseEdge(config);
  const countingAccuracy = config.countingAccuracy ?? 1;
  const deviationAccuracy = config.deviationAccuracy ?? 0;
  const tcGain = EDGE_PER_TC + DEVIATION_TC_BONUS * deviationAccuracy;

  let weightedEV = 0;
  let weightedBet = 0;

  for (const { tc, pct } of TC_DISTRIBUTION) {
    const edgeAtTC = baseEdge + tc * tcGain * countingAccuracy;
    const betMult = getBetMult(config.betSpread, tc);
    weightedEV += edgeAtTC * betMult * pct;
    weightedBet += betMult * pct;
  }

  return weightedBet > 0 ? weightedEV / weightedBet : baseEdge;
}
