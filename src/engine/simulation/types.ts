// ─── Bankroll Preset & Analytical Types ───────────────────────────

/** A skill-level preset with fixed casino rules and player parameters. */
export interface BankrollPreset {
  /** Unique identifier */
  id: string
  /** Display label */
  label: string
  /** Short description */
  description: string
  /** Emoji icon for the preset card */
  icon: string
  /** Casino rule parameters */
  rules: {
    numDecks: number
    penetration: number
    dealerHitsSoft17: boolean
    doubleAfterSplit: boolean
    surrenderAllowed: boolean
    blackjackPays: number
  }
  /** Bet spread multipliers by true count threshold */
  betSpread: Record<number, number>
  /** Player counting accuracy (0-1) */
  countingAccuracy: number
  /** Player deviation accuracy (0-1, 0 = no deviations used) */
  deviationAccuracy: number
  /** Hands dealt per hour */
  handsPerHour: number
  /** Default bankroll for this preset */
  defaultBankroll: number
  /** Default minimum bet for this preset */
  defaultMinBet: number
}

/** User-adjustable parameters that overlay a preset. */
export interface BankrollParams {
  /** Starting bankroll in dollars */
  bankroll: number
  /** Minimum bet in dollars */
  minBet: number
  /** Number of sessions per week */
  sessionsPerWeek: number
  /** Hours per session */
  hoursPerSession: number
}

/** Results from pure analytical bankroll calculation. */
export interface BankrollAnalysis {
  /** Base house edge from rules (negative = house advantage) */
  houseEdge: number
  /** Weighted player edge accounting for bet spread and counting */
  playerEdge: number
  /** Expected value per hand in dollars */
  evPerHand: number
  /** Standard deviation per hand in dollars */
  sdPerHand: number
  /** Expected hourly win in dollars */
  hourlyEV: number
  /** Expected monthly win in dollars */
  monthlyEV: number
  /** Expected yearly win in dollars */
  yearlyEV: number
  /** Analytical risk of ruin (0-1) */
  riskOfRuin: number
  /** N-Zero: hands needed to overcome variance */
  n0Hands: number
  /** N-Zero in hours */
  n0Hours: number
  /** Recommended bankroll for <5% risk of ruin */
  recommendedBankroll: number
  /** Kelly criterion optimal bet */
  kellyBet: number
  /** Theoretical average bet from TC distribution */
  averageBet: number
  /** Maximum bet at highest TC */
  maxBet: number
  /** Whether the player has a mathematical edge */
  hasEdge: boolean
  /** Risk assessment level */
  riskLevel: 'low' | 'moderate' | 'high' | 'extreme'
}

// ─── Legacy Types (kept for achievement engine compatibility) ─────

/** Configuration for a bankroll simulation run */
export interface SimulationConfig {
  bankroll: number
  minBet: number
  numShoes: number
  numDecks: number
  penetration: number
  betSpread: Record<number, number>
  countingSystem: string
  dealerHitsSoft17: boolean
  doubleAfterSplit: boolean
  surrenderAllowed: boolean
  blackjackPays: number
  deviationAccuracy: number
  countingAccuracy: number
}

/** A single data point in the bankroll progression */
export interface BankrollDataPoint {
  hand: number
  bankroll: number
}

/** A bucket in the per-shoe outcome distribution */
export interface OutcomeBucket {
  label: string
  count: number
  percentage: number
}

/** Results returned from a bankroll simulation (legacy, used by achievement engine) */
export interface SimulationResult {
  totalHands: number
  finalBankroll: number
  peakBankroll: number
  minBankroll: number
  netProfit: number
  hourlyEV: number
  riskOfRuin: number
  n0: number
  houseEdge: number
  weightedPlayerEdge: number
  bankrollHistory: BankrollDataPoint[]
  outcomeDistribution: OutcomeBucket[]
  percentWinningSessions: number
  worstDrawdown: number
  averageBet: number
  kellyOptimalBet: number
}
