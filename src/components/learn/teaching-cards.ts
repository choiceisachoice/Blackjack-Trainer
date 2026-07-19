import { Rank, Suit } from '../../engine/shoe/types'
import type { Card } from '../../engine/shoe/types'

/**
 * Card shorthands for lesson content, kept out of the component file so that
 * module only exports components (Fast Refresh requirement).
 */

/** Build a card: `c(R.Ace)`, `c(R.Ten, S.Hearts)`. */
export function c(rank: Rank, suit: Suit = Suit.Spades): Card {
  return { rank, suit }
}

/** Short aliases so lesson markup stays readable. */
export const R = Rank
export const S = Suit
