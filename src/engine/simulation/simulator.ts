import type { SimulationConfig, SimulationResult, BankrollDataPoint, OutcomeBucket } from './types';
import {
  normalRandom,
  calculateHouseEdge,
  kellyOptimalBet as kellyBet,
  calculateN0,
  EDGE_PER_TC,
  DEVIATION_TC_BONUS,
  HAND_SD,
  HANDS_PER_HOUR,
} from './math-utils';

/** 80% chance of 5 cards per hand, 20% chance of 6 (~5.2 avg) */
const CARDS_PER_HAND_BASE = 5;
const CARDS_PER_HAND_EXTRA_CHANCE = 0.2;

/** Sample bankroll history every N hands */
const HISTORY_SAMPLE_INTERVAL = 50;

/** Number of outcome distribution buckets */
const NUM_BUCKETS = 10;

/** Hi-Lo card distribution per deck */
const LOW_CARDS_PER_DECK = 20;  // 2-6: +1
const NEUTRAL_CARDS_PER_DECK = 12; // 7-9: 0
// HIGH_CARDS_PER_DECK = 20  // 10-A: -1 (fills rest of 52)

/**
 * Create a shuffled shoe of Hi-Lo count values using Int8Array.
 * Fisher-Yates shuffle for O(n) uniform randomness.
 */
function createShoe(numDecks: number): Int8Array {
  const shoeSize = numDecks * 52;
  const shoe = new Int8Array(shoeSize);

  for (let d = 0; d < numDecks; d++) {
    const offset = d * 52;
    let i = 0;
    for (; i < LOW_CARDS_PER_DECK; i++) shoe[offset + i] = 1;
    for (; i < LOW_CARDS_PER_DECK + NEUTRAL_CARDS_PER_DECK; i++) shoe[offset + i] = 0;
    for (; i < 52; i++) shoe[offset + i] = -1;
  }

  // Fisher-Yates shuffle
  for (let i = shoeSize - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const temp = shoe[i];
    shoe[i] = shoe[j];
    shoe[j] = temp;
  }

  return shoe;
}

/**
 * Look up bet multiplier from bet spread for a given true count.
 * Searches keys in descending order, returns first key where tc >= key.
 * Defaults to 1 if no key matches.
 */
export function getBetMultiplier(betSpread: Record<number, number>, tc: number): number {
  const keys = Object.keys(betSpread).map(Number).sort((a, b) => b - a);
  for (const key of keys) {
    if (tc >= key) return betSpread[key];
  }
  return 1;
}

/**
 * Build outcome distribution buckets from per-shoe profit array.
 */
function buildOutcomeDistribution(shoeResults: number[]): OutcomeBucket[] {
  if (shoeResults.length === 0) return [];

  let min = Infinity;
  let max = -Infinity;
  for (const r of shoeResults) {
    if (r < min) min = r;
    if (r > max) max = r;
  }

  if (min === max) {
    return [{
      label: `$${Math.round(min)}`,
      count: shoeResults.length,
      percentage: 100,
    }];
  }

  const range = max - min;
  const bucketSize = range / NUM_BUCKETS;
  const buckets: OutcomeBucket[] = [];

  for (let i = 0; i < NUM_BUCKETS; i++) {
    const low = min + i * bucketSize;
    const high = min + (i + 1) * bucketSize;
    const count = shoeResults.filter(r => {
      if (i === NUM_BUCKETS - 1) return r >= low && r <= high;
      return r >= low && r < high;
    }).length;
    buckets.push({
      label: `$${Math.round(low)} to $${Math.round(high)}`,
      count,
      percentage: (count / shoeResults.length) * 100,
    });
  }

  return buckets;
}

/**
 * Run a bankroll simulation with the given configuration.
 * Simulates continuous play across multiple shoes tracking bankroll progression.
 * Uses Hi-Lo count values for realistic shoe tracking and normal distribution
 * for hand outcome approximation.
 */
export function runSimulation(inputConfig: SimulationConfig): SimulationResult {
  // Deep copy to prevent mutation of caller's config
  const config: SimulationConfig = {
    ...inputConfig,
    betSpread: { ...inputConfig.betSpread },
  };

  // Validate config
  if (!config.bankroll || config.bankroll <= 0) throw new Error('bankroll must be > 0');
  if (!config.minBet || config.minBet <= 0) throw new Error('minBet must be > 0');
  if (!config.numShoes || config.numShoes <= 0) throw new Error('numShoes must be > 0');
  if (!config.penetration || config.penetration <= 0 || config.penetration >= 1)
    throw new Error('penetration must be between 0 and 1');

  // Clamp accuracy values
  const deviationAccuracy = Math.max(0, Math.min(1, config.deviationAccuracy || 0));

  const baseEdge = calculateHouseEdge(config);
  const tcGain = EDGE_PER_TC + DEVIATION_TC_BONUS * deviationAccuracy;

  let bankroll = config.bankroll;
  let peakBankroll = bankroll;
  let minBankroll = bankroll;
  let worstDrawdown = 0;
  let totalHands = 0;
  let totalBet = 0;

  const bankrollHistory: BankrollDataPoint[] = [{ hand: 0, bankroll: config.bankroll }];
  const shoeResults: number[] = [];
  let winningSessions = 0;

  for (let shoe = 0; shoe < config.numShoes; shoe++) {
    const shoeCards = createShoe(config.numDecks);
    const shoeSize = config.numDecks * 52;
    const cutCardPosition = Math.floor(shoeSize * config.penetration);
    let rc = 0;
    let cardsDealt = 0;
    const shoeStartBankroll = bankroll;

    while (cardsDealt < cutCardPosition && bankroll > 0) {
      // Calculate true count
      const remainingDecks = (shoeSize - cardsDealt) / 52;
      const tc = remainingDecks > 0.5 ? Math.round(rc / remainingDecks) : 0;

      // Determine bet from spread
      const betMultiplier = getBetMultiplier(config.betSpread, tc);
      const bet = config.minBet * betMultiplier;

      // Effective edge for this hand (base + TC × gain per TC)
      const effectiveEdge = baseEdge + tc * tcGain;

      // Simulate hand outcome using normal distribution
      const handResult = normalRandom(effectiveEdge * bet, HAND_SD * bet);

      bankroll += handResult;
      totalBet += bet;
      totalHands++;

      if (bankroll > peakBankroll) peakBankroll = bankroll;
      if (bankroll < minBankroll) minBankroll = bankroll;
      const drawdown = peakBankroll - bankroll;
      if (drawdown > worstDrawdown) worstDrawdown = drawdown;

      // Deal cards from shoe (advance pointer, update running count)
      const numCards = Math.random() < CARDS_PER_HAND_EXTRA_CHANCE
        ? CARDS_PER_HAND_BASE + 1
        : CARDS_PER_HAND_BASE;
      for (let c = 0; c < numCards && cardsDealt < shoeSize; c++) {
        rc += shoeCards[cardsDealt];
        cardsDealt++;
      }

      // Sample bankroll history
      if (totalHands % HISTORY_SAMPLE_INTERVAL === 0) {
        bankrollHistory.push({ hand: totalHands, bankroll });
      }
    }

    const shoeProfit = bankroll - shoeStartBankroll;
    shoeResults.push(shoeProfit);
    if (shoeProfit > 0) winningSessions++;

    // If bankrupt, stop simulation
    if (bankroll <= 0) {
      bankroll = 0;
      break;
    }
  }

  // Final bankroll history point
  if (bankrollHistory[bankrollHistory.length - 1].hand !== totalHands) {
    bankrollHistory.push({ hand: totalHands, bankroll });
  }

  // Compute summary statistics
  const averageBet = totalHands > 0 ? totalBet / totalHands : 0;
  const netProfit = bankroll - config.bankroll;
  const evPerHand = totalHands > 0 ? netProfit / totalHands : 0;
  const sdPerHand = HAND_SD * averageBet;
  const hourlyEV = evPerHand * HANDS_PER_HOUR;
  const n0 = evPerHand > 0 ? calculateN0(evPerHand, sdPerHand) : Infinity;

  // Analytical Risk of Ruin: RoR = e^(−2·μ·B / σ²)
  const variance = sdPerHand * sdPerHand;
  const riskOfRuin = evPerHand > 0 && variance > 0
    ? Math.exp((-2 * evPerHand * config.bankroll) / variance)
    : 1;

  // Kelly optimal bet based on observed edge
  const observedEdge = totalBet > 0 ? netProfit / totalBet : 0;
  const kellyOptimal = kellyBet(observedEdge, HAND_SD * HAND_SD, config.bankroll);

  return {
    totalHands,
    finalBankroll: Math.round(bankroll * 100) / 100,
    peakBankroll: Math.round(peakBankroll * 100) / 100,
    minBankroll: Math.round(minBankroll * 100) / 100,
    netProfit: Math.round(netProfit * 100) / 100,
    hourlyEV: Math.round(hourlyEV * 100) / 100,
    riskOfRuin: Math.min(1, Math.max(0, riskOfRuin)),
    n0: Math.round(n0),
    houseEdge: baseEdge,
    bankrollHistory,
    outcomeDistribution: buildOutcomeDistribution(shoeResults),
    percentWinningSessions: shoeResults.length > 0
      ? Math.round((winningSessions / shoeResults.length) * 10000) / 100
      : 0,
    worstDrawdown: Math.round(worstDrawdown * 100) / 100,
    averageBet: Math.round(averageBet * 100) / 100,
    kellyOptimalBet: Math.round(kellyOptimal * 100) / 100,
  };
}
