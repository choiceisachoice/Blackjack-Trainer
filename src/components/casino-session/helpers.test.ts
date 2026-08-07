import { describe, it, expect } from 'vitest'
import {
  isNaturalBlackjack,
  fitTable,
  TABLE_DESIGN,
  TABLE_MAX_SCALE,
  TABLE_MIN_HEIGHT,
} from './helpers'
import type { Card } from '../../engine/shoe/types'
import { Rank, Suit } from '../../engine/shoe/types'

const c = (rank: Rank, suit: Suit = Suit.Spades): Card => ({ rank, suit })

describe('fitTable — sizing the table to the screen', () => {
  /** Real viewports, minus the app chrome the table does not get. */
  const ULTRAWIDE = { width: 3400, height: 1240 }
  const FULL_HD = { width: 1860, height: 880 }
  const LAPTOP = { width: 1400, height: 700 }
  const LAPTOP_SHORT = { width: 1250, height: 520 }
  const DESIGN_BOX = { width: TABLE_DESIGN.width, height: TABLE_DESIGN.height }

  it('leaves a design-sized box exactly as it is', () => {
    expect(fitTable(DESIGN_BOX).scale).toBe(1)
  })

  it('grows the table on a large screen instead of stranding it', () => {
    // The report that prompted this: on a 3440px monitor the table stopped at
    // its 1120px cap while every card inside kept its hard-coded pixel size.
    expect(fitTable(ULTRAWIDE).scale).toBeGreaterThan(1.5)
  })

  it('never shrinks a screen that was not the problem', () => {
    // The regression this design exists to avoid. Fitting *both* axes made a
    // short laptop 19% smaller than before; the width-led fit must not.
    for (const box of [LAPTOP, LAPTOP_SHORT, FULL_HD]) {
      expect(fitTable(box).scale, `${box.width}x${box.height}`).toBeGreaterThanOrEqual(1)
    }
  })

  it('never exceeds the ceiling, however much room there is', () => {
    expect(fitTable({ width: 10_000, height: 10_000 }).scale).toBe(TABLE_MAX_SCALE)
  })

  it('fills the box exactly, so no felt is left stretched or clipped', () => {
    for (const box of [ULTRAWIDE, FULL_HD, LAPTOP, DESIGN_BOX]) {
      const { scale, sceneHeight } = fitTable(box)
      expect(TABLE_DESIGN.width * scale, `w @ ${box.width}`).toBeLessThanOrEqual(box.width + 0.5)
      expect(sceneHeight * scale, `h @ ${box.width}`).toBeCloseTo(box.height, 0)
    }
  })

  it('compresses rather than clipping the seats on a very short window', () => {
    const { scale, sceneHeight } = fitTable({ width: 1400, height: 200 })
    expect(sceneHeight).toBe(TABLE_MIN_HEIGHT)
    // Below the floor the scene is taller than the box on purpose: the middle
    // band absorbs it. Losing the seats off the bottom would be worse.
    expect(sceneHeight * scale).toBeGreaterThan(200)
  })

  it('shrinks to fit a narrow screen rather than cropping', () => {
    const { scale } = fitTable({ width: 700, height: 1000 })
    expect(scale).toBeCloseTo(700 / TABLE_DESIGN.width, 5)
    expect(TABLE_DESIGN.width * scale).toBeLessThanOrEqual(700)
  })

  it('returns a usable fit for an unmeasured box rather than collapsing', () => {
    // Before the first measurement the box is 0x0. A scale of 0 paints nothing.
    expect(fitTable({ width: 0, height: 0 })).toEqual({ scale: 1, sceneHeight: TABLE_DESIGN.height })
    expect(fitTable({ width: 0, height: 800 }).scale).toBe(1)
  })

  it('survives nonsense input without producing NaN', () => {
    for (const box of [{ width: NaN, height: NaN }, { width: -100, height: -100 }]) {
      const fit = fitTable(box)
      expect(Number.isFinite(fit.scale)).toBe(true)
      expect(Number.isFinite(fit.sceneHeight)).toBe(true)
      expect(fit.scale).toBe(1)
    }
    expect(fitTable({ width: 800, height: 600 }, { width: 0, height: 0 }).scale).toBe(1)
  })

  it('has a design size with a sane table shape', () => {
    const ratio = TABLE_DESIGN.width / TABLE_DESIGN.height
    expect(ratio).toBeGreaterThan(1.2)
    expect(ratio).toBeLessThan(2.2)
  })
})

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
