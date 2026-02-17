import type { Card } from '../shoe/types'
import { Rank } from '../shoe/types'

/** Map of rank to its numeric value (Ace = 1 for hard count). */
const RANK_VALUE: Record<Rank, number> = {
  [Rank.Two]: 2,
  [Rank.Three]: 3,
  [Rank.Four]: 4,
  [Rank.Five]: 5,
  [Rank.Six]: 6,
  [Rank.Seven]: 7,
  [Rank.Eight]: 8,
  [Rank.Nine]: 9,
  [Rank.Ten]: 10,
  [Rank.Jack]: 10,
  [Rank.Queen]: 10,
  [Rank.King]: 10,
  [Rank.Ace]: 1,
}

/**
 * Calculates hard, soft, and best totals for a hand.
 *
 * - **hard**: all Aces count as 1
 * - **soft**: one Ace counts as 11 (if present), regardless of bust
 * - **best**: soft if ≤ 21, otherwise hard
 *
 * @param cards - Array of cards in the hand
 * @returns Object with hard, soft, and best totals
 */
export function getHandValue(cards: Card[]): {
  hard: number
  soft: number
  best: number
} {
  let hard = 0
  let hasAce = false

  for (const card of cards) {
    hard += RANK_VALUE[card.rank]
    if (card.rank === Rank.Ace) {
      hasAce = true
    }
  }

  const soft = hasAce ? hard + 10 : hard
  const best = soft <= 21 ? soft : hard

  return { hard, soft, best }
}

/**
 * Checks if a hand has busted (best value exceeds 21).
 * @param cards - Array of cards in the hand
 * @returns true if the hand's best value is over 21
 */
export function isBust(cards: Card[]): boolean {
  return getHandValue(cards).best > 21
}

/**
 * Checks if a hand is a natural blackjack (exactly 2 cards totaling 21).
 * @param cards - Array of cards in the hand
 * @returns true if the hand has exactly 2 cards with a best value of 21
 */
export function isBlackjack(cards: Card[]): boolean {
  return cards.length === 2 && getHandValue(cards).best === 21
}

/**
 * Checks if a hand is soft (has a usable Ace counting as 11).
 * A hand is soft when the soft total differs from the hard total
 * and the soft total does not exceed 21.
 * @param cards - Array of cards in the hand
 * @returns true if the hand has an Ace that can count as 11 without busting
 */
export function isSoft(cards: Card[]): boolean {
  const { hard, soft } = getHandValue(cards)
  return soft !== hard && soft <= 21
}

/**
 * Checks if a hand is a pair (exactly 2 cards of the same rank).
 * @param cards - Array of cards in the hand
 * @returns true if the hand has exactly 2 cards with matching ranks
 */
export function isPair(cards: Card[]): boolean {
  return cards.length === 2 && cards[0].rank === cards[1].rank
}
