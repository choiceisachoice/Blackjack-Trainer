import type { Card } from '../shoe/types'
import type { CountingSystemId } from '../counting/types'

// ─── Session Configuration ─────────────────────────────

/** Configuration for a casino session training run. */
export interface CasinoSessionConfig {
  /** Whether the session ends after a hand count or a time limit. */
  sessionMode: 'hands' | 'time'
  /** Target number of hands to play (used when sessionMode = 'hands'). */
  targetHands: number
  /** Target session duration in minutes (used when sessionMode = 'time'). */
  targetMinutes: number

  /** Number of bot players at the table (0–5). */
  numBots: number
  /** Seat index (0-based) where the human player sits. Bots fill other seats. */
  playerSeatIndex: number

  /** Starting bankroll for the human player. */
  startingBankroll: number
  /** Table minimum bet. */
  minBet: number
  /** Table maximum bet. */
  maxBet: number

  /** Number of decks in the shoe (2, 6, or 8). */
  numDecks: number
  /** Whether the dealer hits on soft 17 (true = H17, false = S17). */
  dealerHitsSoft17: boolean
  /** Whether doubling after a split is allowed. */
  doubleAfterSplit: boolean
  /** Whether late surrender is allowed. */
  surrenderAllowed: boolean
  /** Blackjack payout multiplier (1.5 for 3:2, 1.2 for 6:5). */
  blackjackPays: number
  /** Shoe penetration before reshuffle (0.65–0.85). */
  penetration: number
  /** Maximum number of hands a player can hold after splitting. */
  maxSplitHands: number

  /** Whether to show feedback after every hand. */
  trainingMode: boolean
  /** How often the player is asked to input their running/true count. */
  countCheckFrequency: 'every' | 'every5' | 'every10' | 'never'
  /** Whether to show deviation hints after a hand with a deviation situation. */
  showDeviationHints: boolean

  /** The card counting system to use. */
  countingSystem: CountingSystemId

  /** Whether to play casino ambient sound during the session. */
  casinoAmbience: boolean
}

// ─── Bot Player ────────────────────────────────────────

/** Skill level for a bot player. */
export type BotSkillLevel = 'basic_strategy'

/** Betting pattern for a bot player. */
export type BotBettingPattern = 'flat'

/** A computer-controlled player at the table. */
export interface BotPlayer {
  /** Unique identifier (e.g. "bot-0", "bot-1"). */
  id: string
  /** Display name for the bot. */
  name: string
  /** Seat index at the table (0–5). */
  seatIndex: number
  /** Current bankroll. */
  bankroll: number
  /** Current bet for this round. */
  currentBet: number
  /** Current hand(s) for this round (multiple after splits). */
  hands: BotHand[]
  /** Whether the bot is actively playing. */
  isActive: boolean

  /** Bot always plays perfect basic strategy. */
  skillLevel: BotSkillLevel
  /** Bot always bets the same amount. */
  bettingPattern: BotBettingPattern
  /** The flat bet amount the bot uses every hand. */
  flatBetAmount: number
}

/** A single hand belonging to a bot player. */
export interface BotHand {
  /** Cards in this hand. */
  cards: Card[]
  /** Bet amount for this hand. */
  bet: number
  /** Whether the bot doubled down. */
  isDoubled: boolean
  /** Whether this hand resulted from a split. */
  isSplit: boolean
  /** Whether this hand has busted. */
  isBusted: boolean
  /** Whether the bot is standing. */
  isStanding: boolean
  /** Result after settlement. */
  result?: 'win' | 'loss' | 'push' | 'blackjack' | 'surrender'
  /** Profit/loss for this hand. */
  profit?: number
}

// ─── Play Decision ─────────────────────────────────────

/** A single play decision made during a hand. */
export interface PlayDecision {
  /** The action taken by the player. */
  action: string
  /** The correct action according to strategy. */
  correctAction: string
  /** Whether the player's action was correct. */
  isCorrect: boolean
  /** The card received after a hit or double (if applicable). */
  cardReceived?: Card
  /** The hand value after this decision. */
  handValueAfter: number
}

// ─── Human Player Hand Record ──────────────────────────

/** Complete record of a single hand played by the human player. */
export interface PlayerHandRecord {
  /** Sequential hand number within the session. */
  handNumber: number

  // Pre-Deal count state
  /** True count at the time the bet was placed. */
  trueCountAtBet: number
  /** Running count at the time the bet was placed. */
  runningCountAtBet: number
  /** Remaining decks at the time the bet was placed. */
  remainingDecks: number
  /** The bet the player placed. */
  playerBet: number
  /** The correct bet based on the true count. */
  correctBet: number
  /** Whether the player's bet was correct (within tolerance). */
  betCorrect: boolean
  /** The difference between the player's bet and the correct bet. */
  betError: number

  // Cards
  /** Cards dealt to the player. */
  playerCards: Card[]
  /** The dealer's face-up card. */
  dealerUpCard: Card
  /** The dealer's face-down card. */
  dealerHoleCard: Card
  /** All dealer cards after the dealer plays. */
  dealerFinalCards: Card[]

  // Play Decisions
  /** All decisions made during the hand (hit, stand, double, etc.). */
  decisions: PlayDecision[]

  /** The first action taken by the player. */
  firstAction: string
  /** The correct first action. */
  correctFirstAction: string
  /** Whether the first action was correct. */
  firstActionCorrect: boolean

  // Deviation
  /** Whether this hand was a deviation situation. */
  wasDeviationSituation: boolean
  /** Name of the deviation (e.g. "I18 #2: 16 vs 10"). */
  deviationName?: string
  /** The correct deviation action. */
  deviationCorrectAction?: string
  /** Whether the player followed the deviation. */
  playerFollowedDeviation?: boolean

  // Insurance
  /** Whether insurance was offered this hand. */
  insuranceOffered: boolean
  /** Whether the player took insurance. */
  playerTookInsurance?: boolean
  /** Whether the insurance decision was correct. */
  correctInsuranceDecision?: boolean
  /** True count when insurance was offered. */
  trueCountAtInsurance?: number

  // Count Check
  /** Whether the player's count was checked after this hand. */
  countChecked: boolean
  /** The running count entered by the player. */
  playerRC?: number
  /** The actual running count. */
  actualRC: number
  /** The true count entered by the player. */
  playerTC?: number
  /** The actual true count. */
  actualTC: number
  /** Whether the player's running count was correct. */
  rcCorrect?: boolean
  /** Whether the player's true count was correct. */
  tcCorrect?: boolean
  /** Absolute error in running count. */
  rcError?: number
  /** Absolute error in true count. */
  tcError?: number

  // Outcome
  /** The player's final hand value. */
  playerHandValue: number
  /** The dealer's final hand value. */
  dealerHandValue: number
  /** The result of the hand. */
  result: 'win' | 'loss' | 'push' | 'blackjack' | 'surrender'
  /** Profit/loss for this hand. */
  profit: number
  /** Player bankroll after this hand. */
  bankrollAfter: number

  // Bot context
  /** Summary of bot results for this round. */
  botResults: BotRoundResult[]
}

/** Summary of a bot's result in a single round. */
export interface BotRoundResult {
  /** Bot's unique identifier. */
  id: string
  /** Bot's display name. */
  name: string
  /** Cards in the bot's hand. */
  cards: Card[]
  /** The bot's final hand value. */
  handValue: number
  /** The result of the hand. */
  result: string
  /** Profit/loss for the bot. */
  profit: number
}

// ─── Session Result ────────────────────────────────────

/** Complete result of a casino session training run. */
export interface CasinoSessionResult {
  /** The configuration used for this session. */
  config: CasinoSessionConfig
  /** Record of every hand played. */
  hands: PlayerHandRecord[]

  // Timing
  /** Session start timestamp (ms). */
  startTime: number
  /** Session end timestamp (ms). */
  endTime: number
  /** Session duration in seconds. */
  durationSeconds: number

  // Bankroll
  /** Starting bankroll. */
  startingBankroll: number
  /** Bankroll at session end. */
  finalBankroll: number
  /** Net profit/loss. */
  netProfit: number
  /** Highest bankroll reached. */
  peakBankroll: number
  /** Worst drawdown from peak. */
  worstDrawdown: number

  // Accuracy Scores (0–100)
  /** Betting accuracy score. */
  betAccuracy: number
  /** Play accuracy score. */
  playAccuracy: number
  /** Count accuracy score. */
  countAccuracy: number
  /** Deviation accuracy score. */
  deviationAccuracy: number
  /** Insurance accuracy score. */
  insuranceAccuracy: number
  /** Weighted overall score. */
  overallScore: number

  // Detailed Counting Stats
  /** Total number of count checks. */
  totalCountChecks: number
  /** Number of correct running count checks. */
  correctRCChecks: number
  /** Number of correct true count checks. */
  correctTCChecks: number
  /** Average absolute error in running count. */
  avgRCError: number
  /** Average absolute error in true count. */
  avgTCError: number

  // Detailed Play Stats
  /** Total play decisions made. */
  totalPlayDecisions: number
  /** Number of correct play decisions. */
  correctPlayDecisions: number
  /** Total deviation situations encountered. */
  totalDeviationSituations: number
  /** Number of deviations played correctly. */
  correctDeviations: number
  /** Names of deviations the player missed. */
  missedDeviations: string[]

  // Detailed Bet Stats
  /** Total betting decisions made. */
  totalBetDecisions: number
  /** Number of correct betting decisions. */
  correctBetDecisions: number
  /** Average overbet amount (when betting too much). */
  avgOverbetAmount: number
  /** Average underbet amount (when betting too little). */
  avgUnderbetAmount: number

  // Insurance
  /** Total times insurance was offered. */
  totalInsuranceOffers: number
  /** Number of correct insurance decisions. */
  correctInsuranceDecisions: number

  // Grade
  /** Letter grade (A+, A, B+, B, C, D, F). */
  grade: string
  /** CSS color for the grade. */
  gradeColor: string
}

// ─── Deal Result ───────────────────────────────────────

/** Result of dealing a new round to all players. */
export interface DealResult {
  /** The human player's two cards. */
  humanCards: Card[]
  /** The dealer's face-up card. */
  dealerUpCard: Card
  /** The dealer's face-down (hole) card. */
  dealerHoleCard: Card
  /** Map of bot ID to their two dealt cards. */
  botHands: Map<string, Card[]>
  /** Whether the shoe was reshuffled before this deal. */
  reshuffled: boolean
  /** All cards dealt in order (for counting verification). */
  allDealtCards: Card[]
}
