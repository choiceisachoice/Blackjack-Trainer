export enum Suit {
  Hearts = 'Hearts',
  Diamonds = 'Diamonds',
  Clubs = 'Clubs',
  Spades = 'Spades',
}

export enum Rank {
  Two = '2',
  Three = '3',
  Four = '4',
  Five = '5',
  Six = '6',
  Seven = '7',
  Eight = '8',
  Nine = '9',
  Ten = '10',
  Jack = 'J',
  Queen = 'Q',
  King = 'K',
  Ace = 'A',
}

export interface Card {
  rank: Rank
  suit: Suit
}

export interface ShoeConfig {
  numDecks: number
  penetration: number
}

/**
 * A shoe as plain data, for saving a table and putting it back.
 *
 * Cards are numbers 0–51 (suit × 13 + rank, in the order of the enums above):
 * 312 small numbers instead of 312 objects.
 */
export interface ShoeSnapshot {
  /** Every card of the shoe in its current order, dealt ones included. */
  cards: number[]
  /** How many cards have been dealt. */
  dealIndex: number
  /** Where the cut card sits. */
  cutCardIndex: number
}
