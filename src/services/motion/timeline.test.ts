import { describe, it, expect } from 'vitest'
import { at, lerp, track, stagger, during } from './timeline'
import { EASE } from './easing'

/**
 * The property the whole piece rests on: **the frame is a function of the
 * clock and nothing else.**
 *
 * If that ever stops being true, the piece stops being seekable — and a motion
 * piece that cannot be stopped and sampled cannot be checked, only admired or
 * doubted.
 */
describe('at', () => {
  it('is 0 before the track starts and 1 after it ends', () => {
    expect(at(0, 500, 300)).toBe(0)
    expect(at(499, 500, 300)).toBe(0)
    expect(at(800, 500, 300)).toBe(1)
    expect(at(9999, 500, 300)).toBe(1)
  })

  it('treats a zero duration as an instant switch, not a division by zero', () => {
    expect(at(99, 100, 0)).toBe(0)
    expect(at(100, 100, 0)).toBe(1)
    expect(Number.isFinite(at(100, 100, 0))).toBe(true)
  })

  it('returns the same value for the same clock, every time', () => {
    const sample = () => at(640, 400, 620, EASE.emphasizedDecelerate)
    const first = sample()
    for (let i = 0; i < 5; i++) expect(sample()).toBe(first)
  })
})

describe('track', () => {
  it('carries overshoot through to the mapped value', () => {
    // A spatial spring must be able to pass its target and settle back. If
    // `track` clamped, this would top out at exactly 100 and the bounce would
    // be gone with no test failing anywhere.
    const peak = Math.max(
      ...Array.from({ length: 60 }, (_, i) => track(i * 10, 0, 600, 0, 100, EASE.expressiveFastSpatial)),
    )
    expect(peak).toBeGreaterThan(100)
  })

  it('lands exactly on the target, overshoot notwithstanding', () => {
    expect(track(600, 0, 600, 0, 100, EASE.expressiveFastSpatial)).toBe(100)
  })

  it('runs backwards as happily as forwards', () => {
    expect(track(0, 0, 400, 40, 0)).toBe(40)
    expect(track(400, 0, 400, 40, 0)).toBe(0)
  })
})

describe('lerp', () => {
  it('interpolates, and does not clamp', () => {
    expect(lerp(0, 10, 0.5)).toBe(5)
    expect(lerp(0, 10, 1.2)).toBeCloseTo(12)
    expect(lerp(0, 10, -0.2)).toBeCloseTo(-2)
  })
})

describe('stagger', () => {
  it('spaces items evenly from the group start', () => {
    expect(stagger(1000, 0, 180)).toBe(1000)
    expect(stagger(1000, 3, 180)).toBe(1540)
  })

  it('keeps a table-sized group inside the 500 ms budget at 20 ms', () => {
    // The rule from Carbon is the budget, not the step: with enough items the
    // step has to shrink. This asserts the shape of the rule so a future change
    // to the step gets measured against the thing that actually matters.
    const rows = 20
    expect(stagger(0, rows - 1, 20)).toBeLessThan(500)
  })
})

describe('during', () => {
  it('is a half-open window, so adjacent beats cannot both be live', () => {
    expect(during(999, 1000, 2000)).toBe(false)
    expect(during(1000, 1000, 2000)).toBe(true)
    expect(during(1999, 1000, 2000)).toBe(true)
    expect(during(2000, 1000, 2000)).toBe(false)
  })
})
