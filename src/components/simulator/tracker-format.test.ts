import { describe, it, expect } from 'vitest'
import { axisDollars, introDollars } from './tracker-format'

describe('tracker formats', () => {
  it('formats dollars with a sign only when asked', () => {
    expect(introDollars(1200)).toBe('$1,200')
    expect(introDollars(1200, true)).toBe('+$1,200')
    expect(introDollars(-35, true)).toBe('-$35')
    expect(introDollars(0, true)).toBe('$0')
  })

  it('gives every axis tick its own label, even on a small bankroll', () => {
    const ticks = [1100, 1650, 2200].map(axisDollars)
    expect(new Set(ticks).size).toBe(3)
    expect(axisDollars(12000)).toBe('$12K')
  })
})
