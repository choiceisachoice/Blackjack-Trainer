import { describe, it, expect } from 'vitest'
import { isNaturalBlackjack } from './helpers'
import type { Card } from '../../engine/shoe/types'
import { Rank, Suit } from '../../engine/shoe/types'

const c = (rank: Rank, suit: Suit = Suit.Spades): Card => ({ rank, suit })

describe('isNaturalBlackjack', () => {
  it('is a blackjack for an unsplit Ace + ten-value card', () => {
    expect(isNaturalBlackjack(1, [c(Rank.Ace), c(Rank.King)])).toBe(true)
    expect(isNaturalBlackjack(1, [c(Rank.Ten), c(Rank.Ace)])).toBe(true)
  })

  it('is NOT a blackjack for two aces (soft 12 — the hand should be split)', () => {
    expect(isNaturalBlackjack(1, [c(Rank.Ace), c(Rank.Ace)])).toBe(false)
  })

  it('is NOT a natural blackjack after a split — a split A+10 is a plain 21', () => {
    // The exact reported bug: a split-ace hand that draws a ten is 21, not BJ.
    expect(isNaturalBlackjack(2, [c(Rank.Ace), c(Rank.Ten)])).toBe(false)
    expect(isNaturalBlackjack(3, [c(Rank.Ace), c(Rank.Queen)])).toBe(false)
  })

  it('is NOT a blackjack for a non-21 two-card hand', () => {
    expect(isNaturalBlackjack(1, [c(Rank.Nine), c(Rank.Seven)])).toBe(false)
  })
})
