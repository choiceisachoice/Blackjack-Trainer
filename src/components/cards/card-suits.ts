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

/** Whether a rank is a picture card. */
export function isCourt(rank: string): boolean {
  return rank === 'J' || rank === 'Q' || rank === 'K'
}

/**
 * The picture of a card: the standard deck, as it lies on any casino table.
 *
 * The product drew its own faces first, and its J, Q and K were a letter in a
 * frame. Darius, 16 Nov 2026: "Picture Card — da ist kein Picture drauf." A
 * court card is its picture, and nobody draws a better king than the one
 * everybody already knows. The images are Byron Knoll's public-domain deck,
 * rendered to 360 × 504 WebP (see `public/cards/LICENSE.txt`), one file per
 * card, fetched only when that card is shown.
 *
 * @param rank - 'A', '2' … '10', 'J', 'Q', 'K'
 * @param suit - The suit's name
 * @returns The image's URL from the site root
 */
export function cardImageUrl(rank: string, suit: string): string {
  return `/cards/${rank}${suit.charAt(0).toUpperCase()}.webp`
}

/**
 * Where the upper figure of a court card lies in its image, in the 250 × 350
 * units every card is drawn in: the part a small card shows.
 */
export const COURT_FIGURE = { x: 33, y: 34, width: 185, height: 141 } as const

/** Each suit drawn in a 100 × 100 box. */
export const SUIT_PATH: Record<CardSuitName, string> = {
  Hearts:
    'M50 90C22 66 8 49 8 31 8 17 19 8 31 8c8 0 15 5 19 12 4-7 11-12 19-12 12 0 23 9 23 23 0 18-14 35-42 59z',
  Diamonds: 'M50 4Q69 30 90 50 69 70 50 96 31 70 10 50 31 30 50 4z',
  Spades:
    'M50 5C62 27 92 42 92 63c0 12-9 20-20 20-8 0-14-4-18-10 1 9 5 16 13 22H33c8-6 12-13 13-22-4 6-10 10-18 10C17 83 8 75 8 63 8 42 38 27 50 5z',
  Clubs:
    'M50 6a21 21 0 0 1 17 33 21 21 0 1 1-13 34c1 9 5 17 13 23H33c8-6 12-14 13-23a21 21 0 1 1-13-34A21 21 0 0 1 50 6z',
}

