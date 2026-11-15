import { describe, it, expect } from 'vitest'
import { isRedSuit, hiLoValue } from './card-suits'

describe('card-suits', () => {
  it('hearts and diamonds are red, clubs and spades black', () => {
    expect(['Hearts', 'Diamonds', 'Clubs', 'Spades'].map(isRedSuit)).toEqual([true, true, false, false])
  })

  it('follows Hi-Lo: 2–6 plus one, 7–9 nothing, tens and aces minus one', () => {
    for (const r of ['2', '3', '4', '5', '6']) expect(hiLoValue(r)).toBe(1)
    for (const r of ['7', '8', '9']) expect(hiLoValue(r)).toBe(0)
    for (const r of ['10', 'J', 'Q', 'K', 'A']) expect(hiLoValue(r)).toBe(-1)
  })
})
