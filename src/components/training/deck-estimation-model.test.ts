import { describe, it, expect } from 'vitest'
import {
  DECK_TOLERANCE, deckOptions, formatDecks, generateRemainingCards, isAcceptable,
  levelY, separateLabels, signedError, tcSkew,
} from './deck-estimation-model'

describe('the answer options', () => {
  it('runs in half decks from 0.5 to the shoe', () => {
    expect(deckOptions(6, 'half')).toEqual([0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6])
    expect(deckOptions(8, 'half')).toHaveLength(16)
  })

  it('runs in whole decks from 1', () => {
    expect(deckOptions(6, 'whole')).toEqual([1, 2, 3, 4, 5, 6])
  })
})

describe('scoring', () => {
  it('accepts an answer within half a deck, the tolerance the drill scores with', () => {
    expect(DECK_TOLERANCE).toBe(0.5)
    expect(isAcceptable(3.5, 3.31)).toBe(true)
    expect(isAcceptable(3, 3.5)).toBe(true)
    expect(isAcceptable(4, 3.31)).toBe(false)
  })

  it('signs the error: below zero is fewer decks guessed than remain', () => {
    expect(signedError(2.5, 3.6)).toBeCloseTo(-1.1)
    expect(signedError(4, 3)).toBe(1)
  })
})

describe('what an estimate does to a true count', () => {
  it('reads too high when fewer decks are guessed than remain', () => {
    const s = tcSkew(3, 6)
    expect(s.kind).toBe('high')
    expect(s.fraction).toBeCloseTo(1)
  })

  it('reads too low when more decks are guessed than remain', () => {
    const s = tcSkew(4, 3)
    expect(s.kind).toBe('low')
    expect(s.fraction).toBeCloseTo(0.25)
  })

  it('is the same factor at any running count: RC 6 over 2.5 vs over 3', () => {
    const s = tcSkew(2.5, 3)
    expect(6 / 2.5).toBeCloseTo((6 / 3) * (1 + s.fraction))
  })

  it('calls an almost exact estimate exact', () => {
    expect(tcSkew(3, 3.01)).toEqual({ kind: 'exact', fraction: 0 })
  })
})

describe('the tray geometry', () => {
  it('puts none left at the top and the whole shoe at the bottom', () => {
    expect(levelY(0, 6, 300)).toBe(0)
    expect(levelY(6, 6, 300)).toBe(300)
    expect(levelY(3, 6, 300)).toBe(150)
  })

  it('clamps outside the tray', () => {
    expect(levelY(-1, 6, 300)).toBe(0)
    expect(levelY(9, 6, 300)).toBe(300)
  })

  it('keeps labels where they are when they do not touch', () => {
    expect(separateLabels(40, 120, 24, 300)).toEqual([40, 120])
  })

  it('pushes touching labels apart around their middle, in their order', () => {
    const [a, b] = separateLabels(100, 110, 24, 300)
    expect(b - a).toBe(24)
    expect((a + b) / 2).toBe(105)
    const [c, d] = separateLabels(110, 100, 24, 300)
    expect(c - d).toBe(24)
  })

  it('keeps pushed labels inside the tray', () => {
    const [a, b] = separateLabels(2, 6, 24, 300)
    expect(a).toBeGreaterThanOrEqual(12)
    expect(b - a).toBe(24)
  })
})

describe('the questions', () => {
  it('lands most rounds between 30 and 80 % of the shoe left', () => {
    const seq = [0.5, 0.5]
    let i = 0
    expect(generateRemainingCards(312, () => seq[i++ % 2])).toBe(172)
  })

  it('never leaves an empty shoe', () => {
    expect(generateRemainingCards(52, () => 0.99)).toBeGreaterThanOrEqual(1)
  })
})

describe('formatting', () => {
  it('writes decks the way the language does', () => {
    expect(formatDecks(1.5, 'en')).toBe('1.5')
    expect(formatDecks(1.5, 'de')).toBe('1,5')
    expect(formatDecks(2, 'en', true)).toBe('2.0')
  })
})
