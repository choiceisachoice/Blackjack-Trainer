import type { Card, ShoeConfig } from './types'
import { Rank, Suit } from './types'

const MIN_PENETRATION = 0.65
const MAX_PENETRATION = 0.85
const DEFAULT_PENETRATION = 0.75

/**
 * Creates a standard 52-card deck.
 * @returns Array of 52 unique Card objects (13 ranks × 4 suits)
 */
function createDeck(): Card[] {
  const cards: Card[] = []
  for (const suit of Object.values(Suit)) {
    for (const rank of Object.values(Rank)) {
      cards.push({ rank, suit })
    }
  }
  return cards
}

/**
 * Fisher-Yates (Durstenfeld) in-place shuffle.
 * Runs in O(n) time with uniform distribution.
 * @param array - The array to shuffle in place
 */
function fisherYatesShuffle<T>(array: T[]): void {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]]
  }
}

/**
 * Represents a multi-deck shoe used in Blackjack.
 *
 * Uses an index pointer (`dealIndex`) for O(1) card dealing instead of
 * array mutations like `shift()` or `splice()`.
 *
 * Supports configurable deck count and penetration (0.65–0.85), with
 * optional penetration variance of ±5%.
 */
export class Shoe {
  private cards: Card[] = []
  private dealIndex = 0
  private readonly config: Required<ShoeConfig>
  private cutCardIndex: number

  /**
   * Creates a new Shoe instance.
   * @param config - Configuration with number of decks and penetration (0.65–0.85)
   * @param penetrationVariance - Optional variance applied to penetration (default: 0, max: 0.05)
   * @throws Error if penetration is outside the 0.65–0.85 range
   */
  constructor(config: ShoeConfig, penetrationVariance = 0) {
    const penetration = config.penetration ?? DEFAULT_PENETRATION

    if (penetration < MIN_PENETRATION || penetration > MAX_PENETRATION) {
      throw new Error(
        `Penetration must be between ${MIN_PENETRATION} and ${MAX_PENETRATION}, got ${penetration}`
      )
    }

    this.config = { numDecks: config.numDecks, penetration }
    this.buildAndShuffle()
    this.cutCardIndex = this.calculateCutCardIndex(penetrationVariance)
  }

  /**
   * Deals the next card from the shoe in O(1) time.
   * @returns The next Card in the shoe
   * @throws Error if no cards remain
   */
  deal(): Card {
    if (this.dealIndex >= this.cards.length) {
      throw new Error('No cards remaining in shoe')
    }
    return this.cards[this.dealIndex++]
  }

  /**
   * Returns the number of cards remaining (not yet dealt).
   * @returns Number of undealt cards
   */
  remaining(): number {
    return this.cards.length - this.dealIndex
  }

  /**
   * Returns the approximate number of remaining decks.
   * @returns Remaining cards expressed as a decimal number of decks
   */
  remainingDecks(): number {
    return this.remaining() / 52
  }

  /**
   * Checks whether the cut card position has been reached or passed.
   * @returns true if the number of dealt cards meets or exceeds the cut card index
   */
  cutCardReached(): boolean {
    return this.dealIndex >= this.cutCardIndex
  }

  /**
   * Reshuffles the shoe and resets the deal index to 0.
   * Recalculates the cut card position (with optional variance).
   */
  reset(): void {
    this.dealIndex = 0
    this.cutCardIndex = this.calculateCutCardIndex(0)
    fisherYatesShuffle(this.cards)
  }

  private buildAndShuffle(): void {
    this.cards = []
    for (let i = 0; i < this.config.numDecks; i++) {
      this.cards.push(...createDeck())
    }
    fisherYatesShuffle(this.cards)
  }

  private calculateCutCardIndex(variance: number): number {
    const clampedVariance = Math.min(Math.abs(variance), 0.05)
    const offset = (Math.random() * 2 - 1) * clampedVariance
    const effectivePenetration = Math.max(
      MIN_PENETRATION,
      Math.min(MAX_PENETRATION, this.config.penetration + offset)
    )
    return Math.floor(this.cards.length * effectivePenetration)
  }
}
