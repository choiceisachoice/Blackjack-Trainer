/** Configuration for a bankroll simulation run */
export interface SimulationConfig {
  /** Starting bankroll in dollars */
  bankroll: number;
  /** Minimum bet size in dollars */
  minBet: number;
  /** Number of shoes to simulate */
  numShoes: number;
  /** Number of decks per shoe (typically 6 or 8) */
  numDecks: number;
  /** Deck penetration (0.0–1.0, typically 0.65–0.85) */
  penetration: number;
  /** Bet spread: true count threshold → bet multiplier */
  betSpread: Record<number, number>;
  /** Counting system name (for reference) */
  countingSystem: string;
  /** Whether dealer hits on soft 17 */
  dealerHitsSoft17: boolean;
  /** Whether double after split is allowed */
  doubleAfterSplit: boolean;
  /** Whether late surrender is allowed */
  surrenderAllowed: boolean;
  /** Blackjack payout multiplier (1.5 for 3:2, 1.2 for 6:5) */
  blackjackPays: number;
  /** Player's deviation accuracy (0–1) */
  deviationAccuracy: number;
}

/** A single data point in the bankroll progression */
export interface BankrollDataPoint {
  /** Hand number (0 = starting point) */
  hand: number;
  /** Bankroll value at this point */
  bankroll: number;
}

/** A bucket in the per-shoe outcome distribution */
export interface OutcomeBucket {
  /** Range label (e.g. "-$500 to -$250") */
  label: string;
  /** Number of shoes in this bucket */
  count: number;
  /** Percentage of total shoes */
  percentage: number;
}

/** Results returned from a bankroll simulation */
export interface SimulationResult {
  /** Total number of hands played */
  totalHands: number;
  /** Final bankroll after simulation */
  finalBankroll: number;
  /** Highest bankroll reached */
  peakBankroll: number;
  /** Lowest bankroll reached */
  minBankroll: number;
  /** Net profit (finalBankroll − startingBankroll) */
  netProfit: number;
  /** Expected hourly earnings at 100 hands/hour */
  hourlyEV: number;
  /** Analytical risk of ruin: e^(−2·μ·B / σ²) */
  riskOfRuin: number;
  /** Hands needed to overcome variance (N-Zero) */
  n0: number;
  /** Base house edge from rules (negative = house advantage) */
  houseEdge: number;
  /** Bankroll progression over time (sampled every 50 hands) */
  bankrollHistory: BankrollDataPoint[];
  /** Distribution of per-shoe outcomes */
  outcomeDistribution: OutcomeBucket[];
  /** Percentage of shoes that ended with profit (0–100) */
  percentWinningSessions: number;
  /** Worst peak-to-trough drawdown (positive value) */
  worstDrawdown: number;
  /** Average bet size placed */
  averageBet: number;
  /** Kelly criterion recommended bet size */
  kellyOptimalBet: number;
}
