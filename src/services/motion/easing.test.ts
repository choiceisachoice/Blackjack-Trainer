import { describe, it, expect } from 'vitest'
import { cubicBezier, EASE } from './easing'

/**
 * The curves are the piece.
 *
 * Duration decides how long something takes; the curve decides what it *feels*
 * like, and it is the half that cannot be judged by reading the code. So the
 * properties that distinguish a real easing implementation from a plausible one
 * get asserted here: endpoints, monotonicity in time, and — the one that
 * actually matters — that overshoot survives.
 */
describe('cubicBezier', () => {
  it('pins both endpoints exactly', () => {
    const e = EASE.emphasizedDecelerate
    expect(e(0)).toBe(0)
    expect(e(1)).toBe(1)
  })

  it('clamps outside the domain rather than extrapolating', () => {
    const e = EASE.standard
    expect(e(-0.5)).toBe(0)
    expect(e(1.5)).toBe(1)
  })

  it('short-circuits the straight line', () => {
    const e = cubicBezier(0, 0, 1, 1)
    for (const x of [0.1, 0.25, 0.5, 0.75, 0.9]) expect(e(x)).toBeCloseTo(x, 10)
  })

  it('decelerating curves are ahead of linear for most of the run', () => {
    // The defining property of an ease-out: it covers ground early. If this
    // inverts, the curve is an ease-*in* and everything using it will feel
    // like it is being dragged rather than arriving.
    const e = EASE.emphasizedDecelerate
    for (const x of [0.2, 0.4, 0.6]) expect(e(x)).toBeGreaterThan(x)
  })

  it('accelerating curves lag linear for most of the run', () => {
    const e = EASE.emphasizedAccelerate
    for (const x of [0.2, 0.4, 0.6]) expect(e(x)).toBeLessThan(x)
  })

  it('lets spring-derived curves overshoot past 1', () => {
    // The whole point of the y > 1 control points. A clamp here would silently
    // flatten every bounce in the piece while every test still passed.
    const peak = Math.max(
      ...Array.from({ length: 99 }, (_, i) => EASE.expressiveFastSpatial((i + 1) / 100)),
    )
    expect(peak).toBeGreaterThan(1)
  })

  it('keeps effects curves inside 0…1 — a fade must never bounce', () => {
    for (const e of [EASE.standardEffects, EASE.expressiveEffects]) {
      for (let i = 0; i <= 100; i++) {
        const y = e(i / 100)
        expect(y).toBeGreaterThanOrEqual(0)
        expect(y).toBeLessThanOrEqual(1)
      }
    }
  })

  it('advances monotonically in time for the non-overshooting curves', () => {
    for (const e of [EASE.standard, EASE.standardDecelerate, EASE.standardAccelerate]) {
      let prev = -Infinity
      for (let i = 0; i <= 100; i++) {
        const y = e(i / 100)
        expect(y).toBeGreaterThanOrEqual(prev - 1e-9)
        prev = y
      }
    }
  })

  it('solves the flat-slope curve without diverging', () => {
    // x-control points at 0 and 1 flatten the derivative at both ends, which is
    // where Newton–Raphson divides by ~zero. The bisection fallback covers it.
    const e = cubicBezier(0, 0.7, 1, 0.3)
    for (let i = 0; i <= 20; i++) {
      const y = e(i / 20)
      expect(Number.isFinite(y)).toBe(true)
    }
  })
})
