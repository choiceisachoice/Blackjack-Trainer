import { describe, it, expect } from 'vitest'
import { Rank, Suit } from '../shoe/types'
import type { Card } from '../shoe/types'
import {
  HI_LO, KO, OMEGA_II, ZEN_COUNT, WONG_HALVES, RED_7,
  getCountValue, getAllSystems, getSystemById, getInitialRunningCount,
} from './counting-systems'
import { CountingSystemId } from './types'

/** Creates a complete 52-card single deck. */
function createSingleDeck(): Card[] {
  const cards: Card[] = []
  for (const suit of Object.values(Suit)) {
    for (const rank of Object.values(Rank)) {
      cards.push({ rank, suit })
    }
  }
  return cards
}

/** Sums count values for an entire deck using a given system. */
function sumDeck(system: typeof HI_LO): number {
  let sum = 0
  for (const card of createSingleDeck()) {
    sum += getCountValue(card, system)
  }
  return sum
}

// ── Balanced Systems: full deck sums to 0 ─────────────────────────

describe('Balanced Systems', () => {
  it('Hi-Lo: full single deck = RC 0 (balanced)', () => {
    expect(sumDeck(HI_LO)).toBe(0)
  })

  it('Hi-Lo: full 6-deck shoe = RC 0 (balanced)', () => {
    expect(sumDeck(HI_LO) * 6).toBe(0)
  })

  it('Omega II: full single deck = RC 0 (balanced)', () => {
    expect(sumDeck(OMEGA_II)).toBe(0)
  })

  it('Zen Count: full single deck = RC 0 (balanced)', () => {
    expect(sumDeck(ZEN_COUNT)).toBe(0)
  })

  it('Wong Halves: full single deck = RC 0 (balanced)', () => {
    expect(sumDeck(WONG_HALVES)).toBe(0)
  })
})

// ── Unbalanced Systems ────────────────────────────────────────────

describe('Unbalanced Systems', () => {
  it('KO: full single deck = RC +4 (unbalanced)', () => {
    expect(sumDeck(KO)).toBe(4)
  })

  it('KO: full 6-deck shoe = RC +24 (unbalanced, +4 per deck)', () => {
    expect(sumDeck(KO) * 6).toBe(24)
  })

  it('KO: initial running count for 6 decks = -20', () => {
    expect(getInitialRunningCount(KO, 6)).toBe(-20)
  })

  it('Red 7: full single deck != 0 (unbalanced)', () => {
    const sum = sumDeck(RED_7)
    expect(sum).not.toBe(0)
    // Red 7 sums to +2 per deck (2 red 7s × +1 each, rest same as Hi-Lo)
    expect(sum).toBe(2)
  })
})

// ── Red 7 Color Dependency ────────────────────────────────────────

describe('Red 7 Color Dependency', () => {
  it('Red 7: red 7 counts +1, black 7 counts 0', () => {
    expect(getCountValue({ rank: Rank.Seven, suit: Suit.Hearts }, RED_7)).toBe(1)
    expect(getCountValue({ rank: Rank.Seven, suit: Suit.Diamonds }, RED_7)).toBe(1)
    expect(getCountValue({ rank: Rank.Seven, suit: Suit.Clubs }, RED_7)).toBe(0)
    expect(getCountValue({ rank: Rank.Seven, suit: Suit.Spades }, RED_7)).toBe(0)
  })
})

// ── Wong Halves Fractional Values ─────────────────────────────────

describe('Wong Halves Fractional Values', () => {
  it('Wong Halves: correctly uses fractional values', () => {
    expect(getCountValue({ rank: Rank.Two, suit: Suit.Spades }, WONG_HALVES)).toBe(0.5)
    expect(getCountValue({ rank: Rank.Five, suit: Suit.Spades }, WONG_HALVES)).toBe(1.5)
    expect(getCountValue({ rank: Rank.Seven, suit: Suit.Spades }, WONG_HALVES)).toBe(0.5)
    expect(getCountValue({ rank: Rank.Nine, suit: Suit.Spades }, WONG_HALVES)).toBe(-0.5)
  })
})

// ── getCountValue: all cards, all systems ─────────────────────────

describe('getCountValue', () => {
  it('returns correct value for each card in each system', () => {
    for (const system of getAllSystems()) {
      // Low cards (2–6) should be positive in all systems
      expect(getCountValue({ rank: Rank.Two, suit: Suit.Spades }, system)).toBeGreaterThanOrEqual(0)
      expect(getCountValue({ rank: Rank.Five, suit: Suit.Spades }, system)).toBeGreaterThan(0)

      // High cards (10, J, Q, K) should be negative or zero in all systems
      expect(getCountValue({ rank: Rank.Ten, suit: Suit.Spades }, system)).toBeLessThanOrEqual(0)
      expect(getCountValue({ rank: Rank.Jack, suit: Suit.Spades }, system)).toBeLessThanOrEqual(0)

      // 8 should always be 0
      expect(getCountValue({ rank: Rank.Eight, suit: Suit.Spades }, system)).toBe(0)
    }
  })
})

// ── Helper Functions ──────────────────────────────────────────────

describe('Helper Functions', () => {
  it('getAllSystems returns all 6 systems', () => {
    const systems = getAllSystems()
    expect(systems).toHaveLength(6)
    const ids = systems.map(s => s.id)
    expect(ids).toContain(CountingSystemId.HiLo)
    expect(ids).toContain(CountingSystemId.KO)
    expect(ids).toContain(CountingSystemId.OmegaII)
    expect(ids).toContain(CountingSystemId.ZenCount)
    expect(ids).toContain(CountingSystemId.WongHalves)
    expect(ids).toContain(CountingSystemId.Red7)
  })

  it('getSystemById returns correct system', () => {
    expect(getSystemById(CountingSystemId.HiLo)).toBe(HI_LO)
    expect(getSystemById(CountingSystemId.KO)).toBe(KO)
    expect(getSystemById(CountingSystemId.Red7)).toBe(RED_7)
  })

  it('getSystemById throws for unknown ID', () => {
    expect(() => getSystemById('Unknown' as CountingSystemId)).toThrow('Unknown counting system')
  })

  it('getInitialRunningCount returns 0 for balanced systems', () => {
    expect(getInitialRunningCount(HI_LO, 6)).toBe(0)
    expect(getInitialRunningCount(OMEGA_II, 8)).toBe(0)
    expect(getInitialRunningCount(ZEN_COUNT, 2)).toBe(0)
    expect(getInitialRunningCount(WONG_HALVES, 1)).toBe(0)
  })

  it('getInitialRunningCount computes IRC for KO', () => {
    expect(getInitialRunningCount(KO, 1)).toBe(0)    // -4 × (1-1) = 0
    expect(getInitialRunningCount(KO, 2)).toBe(-4)   // -4 × (2-1) = -4
    expect(getInitialRunningCount(KO, 6)).toBe(-20)  // -4 × (6-1) = -20
    expect(getInitialRunningCount(KO, 8)).toBe(-28)  // -4 × (8-1) = -28
  })

  it('getInitialRunningCount computes IRC for Red 7', () => {
    expect(getInitialRunningCount(RED_7, 1)).toBe(-2)   // -2 × 1
    expect(getInitialRunningCount(RED_7, 2)).toBe(-4)   // -2 × 2
    expect(getInitialRunningCount(RED_7, 6)).toBe(-12)  // -2 × 6
    expect(getInitialRunningCount(RED_7, 8)).toBe(-16)  // -2 × 8
  })
})
