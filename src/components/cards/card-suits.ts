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


/** Pip positions on a 250 × 350 card: [x, y, upside-down]. */
const L = 82, C = 125, R = 168
const T = 78, B = 272, M = 175
const U = 142.7, D = 207.3
export type Spot = [number, number, boolean]
export const PIPS: Record<string, Spot[]> = {
  '2': [[C, T, false], [C, B, true]],
  '3': [[C, T, false], [C, M, false], [C, B, true]],
  '4': [[L, T, false], [R, T, false], [L, B, true], [R, B, true]],
  '5': [[L, T, false], [R, T, false], [C, M, false], [L, B, true], [R, B, true]],
  '6': [[L, T, false], [R, T, false], [L, M, false], [R, M, false], [L, B, true], [R, B, true]],
  '7': [[L, T, false], [R, T, false], [C, 126, false], [L, M, false], [R, M, false], [L, B, true], [R, B, true]],
  '8': [[L, T, false], [R, T, false], [C, 126, false], [L, M, false], [R, M, false], [C, 224, true], [L, B, true], [R, B, true]],
  '9': [[L, T, false], [R, T, false], [L, U, false], [R, U, false], [C, M, false], [L, D, true], [R, D, true], [L, B, true], [R, B, true]],
  '10': [[L, T, false], [R, T, false], [C, 110, false], [L, U, false], [R, U, false], [L, D, true], [R, D, true], [C, 240, true], [L, B, true], [R, B, true]],
}


/** The middle of the card, where an ace's one pip sits. */
export const PIP_CENTRE = { x: C, y: M } as const
