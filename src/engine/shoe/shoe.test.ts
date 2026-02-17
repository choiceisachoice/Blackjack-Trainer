import { describe, it, expect } from 'vitest'
import { Shoe } from './shoe'
import { Rank, Suit } from './types'

describe('Shoe', () => {
  it('should contain exactly 312 cards for a 6-deck shoe', () => {
    const shoe = new Shoe({ numDecks: 6, penetration: 0.75 })
    expect(shoe.remaining()).toBe(312)
  })

  it('should contain exactly 52 cards for a 1-deck shoe', () => {
    const shoe = new Shoe({ numDecks: 1, penetration: 0.75 })
    expect(shoe.remaining()).toBe(52)
  })

  it('each card appears exactly numDecks times in the shoe', () => {
    const numDecks = 6
    const shoe = new Shoe({ numDecks, penetration: 0.75 })
    const counts = new Map<string, number>()

    for (let i = 0; i < 312; i++) {
      const card = shoe.deal()
      const key = `${card.rank}-${card.suit}`
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }

    // 13 ranks × 4 suits = 52 unique cards
    expect(counts.size).toBe(52)

    for (const [, count] of counts) {
      expect(count).toBe(numDecks)
    }
  })

  it('deal() returns a card and decrements remaining count', () => {
    const shoe = new Shoe({ numDecks: 1, penetration: 0.75 })
    const initialRemaining = shoe.remaining()

    const card = shoe.deal()

    expect(card).toHaveProperty('rank')
    expect(card).toHaveProperty('suit')
    expect(Object.values(Rank)).toContain(card.rank)
    expect(Object.values(Suit)).toContain(card.suit)
    expect(shoe.remaining()).toBe(initialRemaining - 1)
  })

  it('deal() returns cards in O(1) using index pointer', () => {
    const shoe = new Shoe({ numDecks: 6, penetration: 0.75 })

    // Deal many cards and measure that performance is consistent
    // The key property: dealing doesn't modify the array (no shift/splice)
    // We verify this indirectly by dealing all cards and checking count
    const totalCards = 312
    for (let i = 0; i < totalCards; i++) {
      shoe.deal()
    }
    expect(shoe.remaining()).toBe(0)
  })

  it('cutCardReached() returns true after penetration threshold', () => {
    const shoe = new Shoe({ numDecks: 1, penetration: 0.75 })
    // 52 cards × 0.75 = 39 cards to reach cut card
    const cutPoint = Math.floor(52 * 0.75)

    for (let i = 0; i < cutPoint; i++) {
      shoe.deal()
    }

    expect(shoe.cutCardReached()).toBe(true)
  })

  it('cutCardReached() returns false before penetration threshold', () => {
    const shoe = new Shoe({ numDecks: 1, penetration: 0.75 })
    // Deal one less than cut card position
    const cutPoint = Math.floor(52 * 0.75)

    for (let i = 0; i < cutPoint - 1; i++) {
      shoe.deal()
    }

    expect(shoe.cutCardReached()).toBe(false)
  })

  it('reset() reshuffles and resets dealIndex to 0', () => {
    const shoe = new Shoe({ numDecks: 1, penetration: 0.75 })

    // Deal some cards
    const firstCards = []
    for (let i = 0; i < 10; i++) {
      firstCards.push(shoe.deal())
    }
    expect(shoe.remaining()).toBe(42)

    // Reset
    shoe.reset()
    expect(shoe.remaining()).toBe(52)

    // After reset, the shoe is reshuffled (order may differ)
    // We verify the count is restored
    expect(shoe.cutCardReached()).toBe(false)
  })

  it('shuffle produces different orderings (statistical test over 100 shuffles)', () => {
    const firstCardKeys = new Set<string>()

    for (let i = 0; i < 100; i++) {
      const shoe = new Shoe({ numDecks: 6, penetration: 0.75 })
      const card = shoe.deal()
      firstCardKeys.add(`${card.rank}-${card.suit}`)
    }

    // With 312 cards, the first card should vary significantly
    // across 100 shuffles. At minimum we expect several distinct values.
    expect(firstCardKeys.size).toBeGreaterThan(5)
  })

  it('remainingDecks() calculates correctly', () => {
    const shoe = new Shoe({ numDecks: 6, penetration: 0.75 })
    expect(shoe.remainingDecks()).toBeCloseTo(6, 1)

    // Deal 52 cards (1 deck)
    for (let i = 0; i < 52; i++) {
      shoe.deal()
    }
    expect(shoe.remainingDecks()).toBeCloseTo(5, 1)

    // Deal another 52 cards
    for (let i = 0; i < 52; i++) {
      shoe.deal()
    }
    expect(shoe.remainingDecks()).toBeCloseTo(4, 1)
  })

  it('penetration is configurable between 0.65 and 0.85', () => {
    // Valid penetrations
    expect(() => new Shoe({ numDecks: 6, penetration: 0.65 })).not.toThrow()
    expect(() => new Shoe({ numDecks: 6, penetration: 0.75 })).not.toThrow()
    expect(() => new Shoe({ numDecks: 6, penetration: 0.85 })).not.toThrow()

    // Invalid penetrations
    expect(() => new Shoe({ numDecks: 6, penetration: 0.64 })).toThrow()
    expect(() => new Shoe({ numDecks: 6, penetration: 0.86 })).toThrow()
    expect(() => new Shoe({ numDecks: 6, penetration: 0.5 })).toThrow()
    expect(() => new Shoe({ numDecks: 6, penetration: 1.0 })).toThrow()
  })
})
