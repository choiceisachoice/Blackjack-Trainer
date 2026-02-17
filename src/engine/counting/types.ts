import { Action } from '../rules/types'

/** Supported card counting systems. */
export enum CountingSystemId {
  HiLo = 'HiLo',
  KO = 'KO',
  OmegaII = 'OmegaII',
  ZenCount = 'ZenCount',
  WongHalves = 'WongHalves',
  Red7 = 'Red7',
}

/**
 * Configuration for a card counting system.
 *
 * Each system defines card values, difficulty level, balance type,
 * and statistical correlation metrics.
 */
export interface CountingSystemConfig {
  /** Unique identifier for the system. */
  id: CountingSystemId
  /** Human-readable display name (e.g. "Hi-Lo"). */
  name: string
  /** Difficulty level: 1 (easy), 2 (moderate), 3 (hard). */
  level: 1 | 2 | 3
  /** Whether the system is balanced (full deck sums to 0). */
  isBalanced: boolean
  /** How well the system predicts favorable betting situations (0–1). */
  bettingCorrelation: number
  /** How well the system predicts correct strategy deviations (0–1). */
  playingEfficiency: number
  /** Map of card rank → count value. Uses Rank enum values as keys. */
  values: Record<string, number>
  /** Whether the system uses card color (true only for Red 7). */
  colorDependent: boolean
  /** Base initial running count (0 for balanced; actual IRC depends on numDecks). */
  initialRunningCount: number
}

/**
 * Current state of a counting engine.
 */
export interface CountingState {
  /** Active counting system. */
  system: CountingSystemId
  /** Current running count. */
  runningCount: number
  /** Current true count (RC / remaining decks, rounded to 0.5). */
  trueCount: number
  /** Number of cards processed since last reset. */
  cardsDealt: number
  /** Remaining decks in the shoe. */
  remainingDecks: number
}

/**
 * A strategy deviation that overrides Basic Strategy at a specific true count.
 *
 * When True Count ≥ threshold → use actionAbove instead of actionBelow (Basic Strategy).
 */
export interface Deviation {
  /** Descriptive name (e.g. "Insurance", "16 vs 10"). */
  name: string
  /** Player hand key: hard total ("16"), pair ("10,10"), soft ("A,7"), or "*" for any. */
  playerHand: string
  /** Dealer upcard key: "2"–"10" or "A". */
  dealerUpcard: string
  /** True count threshold for the deviation. */
  trueCountThreshold: number
  /** Action to take when TC ≥ threshold (deviation from Basic Strategy). */
  actionAbove: Action
  /** Action to take when TC < threshold (Basic Strategy action). */
  actionBelow: Action
  /** Whether this deviation is part of the Illustrious 18. */
  isIllustrious18: boolean
  /** Whether this deviation is part of the Fab 4. */
  isFab4: boolean
}
