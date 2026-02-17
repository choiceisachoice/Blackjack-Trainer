import { describe, it, expect } from 'vitest'
import { Rank, Suit } from '../shoe/types'
import type { Card } from '../shoe/types'
import { CountingEngine } from './counting-engine'
import { HI_LO, KO, WONG_HALVES, getCountValue } from './counting-systems'
import { CountingSystemId } from './types'

const c = (rank: Rank, suit: Suit = Suit.Spades): Card => ({ rank, suit })

describe('CountingEngine', () => {
  it('processCard updates running count correctly', () => {
    const engine = new CountingEngine(HI_LO, 6)
    expect(engine.getRunningCount()).toBe(0)

    engine.processCard(c(Rank.Two))   // +1
    expect(engine.getRunningCount()).toBe(1)

    engine.processCard(c(Rank.Five))  // +1
    expect(engine.getRunningCount()).toBe(2)

    engine.processCard(c(Rank.Ten))   // -1
    expect(engine.getRunningCount()).toBe(1)

    engine.processCard(c(Rank.Ace))   // -1
    expect(engine.getRunningCount()).toBe(0)
  })

  it('True Count = RC / remaining decks', () => {
    const engine = new CountingEngine(HI_LO, 6)
    // Process 6 low cards to get RC = +6
    for (let i = 0; i < 6; i++) {
      engine.processCard(c(Rank.Two))
    }
    expect(engine.getRunningCount()).toBe(6)
    // TC = 6 / 3 = 2.0
    expect(engine.getTrueCount(3)).toBe(2)
  })

  it('True Count rounded to nearest 0.5', () => {
    const engine = new CountingEngine(HI_LO, 6)
    // Process 7 low cards to get RC = +7
    for (let i = 0; i < 7; i++) {
      engine.processCard(c(Rank.Two))
    }
    expect(engine.getRunningCount()).toBe(7)
    // TC = 7 / 3 = 2.333... → rounds to 2.5
    expect(engine.getTrueCount(3)).toBe(2.5)

    // RC = 5, remaining = 3 → TC = 1.667 → rounds to 1.5
    const engine2 = new CountingEngine(HI_LO, 6)
    for (let i = 0; i < 5; i++) {
      engine2.processCard(c(Rank.Two))
    }
    expect(engine2.getTrueCount(3)).toBe(1.5)
  })

  it('True Count at RC +6, 3 remaining decks = +2', () => {
    const engine = new CountingEngine(HI_LO, 6)
    for (let i = 0; i < 6; i++) {
      engine.processCard(c(Rank.Three)) // +1 each
    }
    expect(engine.getTrueCount(3)).toBe(2)
  })

  it('True Count at RC +9, 3 remaining decks = +3', () => {
    const engine = new CountingEngine(HI_LO, 6)
    for (let i = 0; i < 9; i++) {
      engine.processCard(c(Rank.Four)) // +1 each
    }
    expect(engine.getTrueCount(3)).toBe(3)
  })

  it('KO system returns running count as-is (no true count conversion)', () => {
    const engine = new CountingEngine(KO, 6)
    // KO IRC for 6 decks = -20
    expect(engine.getRunningCount()).toBe(-20)

    // Process 5 low cards (+1 each) → RC = -20 + 5 = -15
    for (let i = 0; i < 5; i++) {
      engine.processCard(c(Rank.Two))
    }
    expect(engine.getRunningCount()).toBe(-15)

    // getTrueCount for unbalanced system returns RC directly
    expect(engine.getTrueCount(4)).toBe(-15)
    expect(engine.getTrueCount(2)).toBe(-15)
  })

  it('reset() sets RC to initial running count', () => {
    const engine = new CountingEngine(HI_LO, 6)
    engine.processCard(c(Rank.Two))
    engine.processCard(c(Rank.Three))
    expect(engine.getRunningCount()).toBe(2)

    engine.reset()
    expect(engine.getRunningCount()).toBe(0)

    // KO reset
    const koEngine = new CountingEngine(KO, 6)
    koEngine.processCard(c(Rank.Ten))
    expect(koEngine.getRunningCount()).toBe(-21) // -20 + (-1)

    koEngine.reset()
    expect(koEngine.getRunningCount()).toBe(-20)
  })

  it('1000 random cards counted correctly against manual calculation', () => {
    const engine = new CountingEngine(HI_LO, 6)
    let expectedRC = 0
    const ranks = Object.values(Rank)
    const suits = Object.values(Suit)

    // Deterministic pseudo-random sequence
    let seed = 42
    for (let i = 0; i < 1000; i++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff
      const rank = ranks[seed % ranks.length]
      seed = (seed * 1103515245 + 12345) & 0x7fffffff
      const suit = suits[seed % suits.length]
      const card: Card = { rank, suit }

      engine.processCard(card)
      expectedRC += getCountValue(card, HI_LO)
    }

    expect(engine.getRunningCount()).toBe(expectedRC)
  })

  it('getState returns complete counting state', () => {
    const engine = new CountingEngine(HI_LO, 6)
    engine.processCard(c(Rank.Two))
    engine.processCard(c(Rank.Five))
    engine.processCard(c(Rank.Ten))

    const state = engine.getState(5)
    expect(state.system).toBe(CountingSystemId.HiLo)
    expect(state.runningCount).toBe(1) // +1 +1 -1
    expect(state.trueCount).toBe(0) // 1/5 = 0.2 → rounds to 0
    expect(state.cardsDealt).toBe(3)
    expect(state.remainingDecks).toBe(5)
  })

  it('Wong Halves fractional running count', () => {
    const engine = new CountingEngine(WONG_HALVES, 6)
    engine.processCard(c(Rank.Two))  // +0.5
    expect(engine.getRunningCount()).toBe(0.5)

    engine.processCard(c(Rank.Five)) // +1.5
    expect(engine.getRunningCount()).toBe(2)

    engine.processCard(c(Rank.Nine)) // -0.5
    expect(engine.getRunningCount()).toBe(1.5)
  })
})
