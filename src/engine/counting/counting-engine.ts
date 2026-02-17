import type { Card } from '../shoe/types'
import type { CountingSystemConfig, CountingState } from './types'
import { getCountValue, getInitialRunningCount } from './counting-systems'

/**
 * Engine that tracks the running count and true count for a card counting system.
 *
 * Processes dealt cards one at a time, maintains the running count,
 * and computes the true count (RC / remaining decks) for balanced systems.
 * Unbalanced systems (KO, Red 7) return the running count directly as TC.
 */
export class CountingEngine {
  private system: CountingSystemConfig
  private numDecks: number
  private runningCount: number
  private cardsDealt: number

  /**
   * Creates a new CountingEngine.
   * @param system - The counting system configuration to use
   * @param numDecks - Number of decks in the shoe (default: 6)
   */
  constructor(system: CountingSystemConfig, numDecks: number = 6) {
    this.system = system
    this.numDecks = numDecks
    this.runningCount = getInitialRunningCount(system, numDecks)
    this.cardsDealt = 0
  }

  /**
   * Processes a dealt card, updating the running count.
   * @param card - The card that was dealt
   */
  processCard(card: Card): void {
    this.runningCount += getCountValue(card, this.system)
    this.cardsDealt++
  }

  /**
   * Returns the current running count.
   */
  getRunningCount(): number {
    return this.runningCount
  }

  /**
   * Computes the true count based on remaining decks.
   *
   * For balanced systems: TC = RC / remainingDecks, rounded to nearest 0.5.
   * For unbalanced systems (KO, Red 7): returns the running count directly.
   *
   * @param remainingDecks - Number of decks remaining in the shoe
   * @returns The true count
   */
  getTrueCount(remainingDecks: number): number {
    if (!this.system.isBalanced) {
      return this.runningCount
    }
    if (remainingDecks <= 0) {
      return this.runningCount
    }
    const tc = this.runningCount / remainingDecks
    return Math.round(tc * 2) / 2
  }

  /**
   * Resets the engine to the initial state (IRC based on system and numDecks).
   */
  reset(): void {
    this.runningCount = getInitialRunningCount(this.system, this.numDecks)
    this.cardsDealt = 0
  }

  /**
   * Returns the complete counting state snapshot.
   * @param remainingDecks - Number of decks remaining in the shoe
   */
  getState(remainingDecks: number): CountingState {
    return {
      system: this.system.id,
      runningCount: this.runningCount,
      trueCount: this.getTrueCount(remainingDecks),
      cardsDealt: this.cardsDealt,
      remainingDecks,
    }
  }
}
