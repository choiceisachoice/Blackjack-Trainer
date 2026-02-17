import { describe, it, expect } from 'vitest'
import { getHandValue, isBust, isBlackjack, isSoft, isPair } from './hand-utils'
import { Rank, Suit } from '../shoe/types'
import type { Card } from '../shoe/types'

const c = (rank: Rank, suit: Suit = Suit.Spades): Card => ({ rank, suit })

describe('getHandValue', () => {
  it('Ace + 10 = Blackjack (21, soft)', () => {
    const result = getHandValue([c(Rank.Ace), c(Rank.Ten)])
    expect(result).toEqual({ hard: 11, soft: 21, best: 21 })
  })

  it('Ace + 5 = Soft 16 (hard 6, soft 16, best 16)', () => {
    const result = getHandValue([c(Rank.Ace), c(Rank.Five)])
    expect(result).toEqual({ hard: 6, soft: 16, best: 16 })
  })

  it('Ace + 5 + 10 = Hard 16 (soft would be 26, so hard 16)', () => {
    const result = getHandValue([c(Rank.Ace), c(Rank.Five), c(Rank.Ten)])
    expect(result).toEqual({ hard: 16, soft: 26, best: 16 })
  })

  it('10 + 6 = Hard 16', () => {
    const result = getHandValue([c(Rank.Ten), c(Rank.Six)])
    expect(result).toEqual({ hard: 16, soft: 16, best: 16 })
  })

  it('10 + 6 + 10 = Bust (26)', () => {
    const result = getHandValue([c(Rank.Ten), c(Rank.Six), c(Rank.Ten)])
    expect(result).toEqual({ hard: 26, soft: 26, best: 26 })
  })

  it('Ace + Ace = Soft 12 (hard 2, soft 12)', () => {
    const result = getHandValue([c(Rank.Ace), c(Rank.Ace)])
    expect(result).toEqual({ hard: 2, soft: 12, best: 12 })
  })
})

describe('isBust', () => {
  it('returns true for hand over 21', () => {
    expect(isBust([c(Rank.Ten), c(Rank.Six), c(Rank.Ten)])).toBe(true)
  })

  it('returns false for hand at 21', () => {
    expect(isBust([c(Rank.Ten), c(Rank.Ace)])).toBe(false)
  })
})

describe('isBlackjack', () => {
  it('true for Ace+King', () => {
    expect(isBlackjack([c(Rank.Ace), c(Rank.King)])).toBe(true)
  })

  it('true for King+Ace (order independent)', () => {
    expect(isBlackjack([c(Rank.King), c(Rank.Ace)])).toBe(true)
  })

  it('false for Ace+5+5 (21 but 3 cards)', () => {
    expect(isBlackjack([c(Rank.Ace), c(Rank.Five), c(Rank.Five)])).toBe(false)
  })

  it('false for 10+5 (not 21)', () => {
    expect(isBlackjack([c(Rank.Ten), c(Rank.Five)])).toBe(false)
  })
})

describe('isPair', () => {
  it('true for 8+8', () => {
    expect(isPair([c(Rank.Eight, Suit.Spades), c(Rank.Eight, Suit.Hearts)])).toBe(true)
  })

  it('false for 8+9', () => {
    expect(isPair([c(Rank.Eight), c(Rank.Nine)])).toBe(false)
  })

  it('false for 3 cards even if first two match', () => {
    expect(isPair([c(Rank.Eight), c(Rank.Eight), c(Rank.Three)])).toBe(false)
  })
})

describe('isSoft', () => {
  it('true for Ace+6', () => {
    expect(isSoft([c(Rank.Ace), c(Rank.Six)])).toBe(true)
  })

  it('false for Ace+6+10 (ace must count as 1)', () => {
    expect(isSoft([c(Rank.Ace), c(Rank.Six), c(Rank.Ten)])).toBe(false)
  })

  it('false for 10+6 (no ace)', () => {
    expect(isSoft([c(Rank.Ten), c(Rank.Six)])).toBe(false)
  })
})
