/** Suit names as the engine spells them. */
export type CardSuitName = 'Hearts' | 'Diamonds' | 'Clubs' | 'Spades'

/** True for the two red suits. */
export function isRedSuit(suit: string): boolean {
  return suit === 'Hearts' || suit === 'Diamonds'
}

/**
 * Hi-Lo value of a rank: 2–6 count +1, 7–9 count 0, tens, faces and aces −1.
 * For display code that shows a card's tag; the engine has its own tables.
 */
export function hiLoValue(rank: string): -1 | 0 | 1 {
  if (['2', '3', '4', '5', '6'].includes(rank)) return 1
  if (['7', '8', '9'].includes(rank)) return 0
  return -1
}
