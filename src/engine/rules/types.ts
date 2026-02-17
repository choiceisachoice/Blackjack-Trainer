import type { Card } from '../shoe/types'

/**
 * Abstraction for a card-dealing source.
 * The Shoe class structurally satisfies this interface.
 */
export interface CardSource {
  deal(): Card
  remaining(): number
  remainingDecks(): number
  cutCardReached(): boolean
  reset(): void
}

/** Available player/game actions during a round. */
export enum Action {
  Hit = 'Hit',
  Stand = 'Stand',
  Double = 'Double',
  Split = 'Split',
  Surrender = 'Surrender',
  Insurance = 'Insurance',
}

/** Outcome of a settled hand. */
export enum HandResult {
  Win = 'Win',
  Loss = 'Loss',
  Push = 'Push',
  Blackjack = 'Blackjack',
  Surrender = 'Surrender',
}

/** The phase of a game round. */
export type GamePhase =
  | 'betting'
  | 'dealing'
  | 'playerTurn'
  | 'dealerTurn'
  | 'settlement'

/** Configurable casino rule set. */
export interface CasinoRules {
  /** Number of decks in the shoe (1–8). */
  numDecks: number
  /** Fraction of shoe dealt before reshuffle (0.65–0.85). */
  penetration: number
  /** true = H17 (dealer hits soft 17), false = S17 (dealer stands). */
  dealerHitsSoft17: boolean
  /** Blackjack payout multiplier (1.5 = 3:2, 1.2 = 6:5). */
  blackjackPayout: number
  /** Allow doubling after a split. */
  doubleAfterSplit: boolean
  /** Allow re-splitting pairs. */
  resplitAllowed: boolean
  /** Maximum number of hands after splitting. */
  maxSplitHands: number
  /** Allow hitting after splitting aces. */
  hitSplitAces: boolean
  /** Surrender rule: none, early, or late. */
  surrenderAllowed: 'none' | 'early' | 'late'
  /** Allow insurance side bet when dealer shows Ace. */
  insuranceAllowed: boolean
}

/** Standard Las Vegas Strip rules. */
export const DEFAULT_RULES: CasinoRules = {
  numDecks: 6,
  penetration: 0.75,
  dealerHitsSoft17: false,
  blackjackPayout: 1.5,
  doubleAfterSplit: true,
  resplitAllowed: true,
  maxSplitHands: 4,
  hitSplitAces: false,
  surrenderAllowed: 'late',
  insuranceAllowed: true,
}

/** A single hand (player or dealer). */
export interface Hand {
  cards: Card[]
  bet: number
  isDoubled: boolean
  isSplit: boolean
  isStanding: boolean
  result?: HandResult
}

/** Complete state of a game round (immutable per method call). */
export interface GameState {
  shoe: CardSource
  dealerHand: Hand
  playerHands: Hand[]
  currentHandIndex: number
  isRoundOver: boolean
  phase: GamePhase
  insuranceBet: number
}
