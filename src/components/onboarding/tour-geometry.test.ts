import { describe, it, expect } from 'vitest'
import {
  placeCallout,
  chooseSide,
  clamp,
  clampToViewport,
  type Rect,
  type Size,
} from './tour-geometry'

const VIEWPORT: Size = { width: 1280, height: 800 }
const CALLOUT: Size = { width: 320, height: 160 }
const GAP = 16
const MARGIN = 12

/** A target in the middle of the screen, where every side has room. */
const middle: Rect = { top: 300, left: 500, width: 200, height: 80 }

describe('clamp', () => {
  it('keeps a value inside the range', () => {
    expect(clamp(5, 0, 10)).toBe(5)
    expect(clamp(-3, 0, 10)).toBe(0)
    expect(clamp(99, 0, 10)).toBe(10)
  })

  it('returns the minimum for an inverted range instead of a nonsense value', () => {
    // Happens when the callout is taller than the viewport: maxTop < margin.
    // Returning `min` keeps the callout's top edge on screen, which is the
    // half a user can actually read.
    expect(clamp(50, 12, -40)).toBe(12)
  })
})

describe('trimming an oversized target', () => {
  it('cuts a page-tall container down to what is on screen', () => {
    // The real number that prompted this: the plan wrapper measured
    // 1235x3954 at a 1280x800 viewport, which spotlit the entire page and
    // sent the arrow 1250px below the fold.
    const plan: Rect = { top: -17, left: 12, width: 1235, height: 3954 }
    const t = clampToViewport(plan, VIEWPORT)

    expect(t.top).toBeGreaterThanOrEqual(0)
    expect(t.left).toBeGreaterThanOrEqual(0)
    expect(t.top + t.height).toBeLessThanOrEqual(VIEWPORT.height)
    expect(t.left + t.width).toBeLessThanOrEqual(VIEWPORT.width)
  })

  it('leaves a target that already fits untouched', () => {
    expect(clampToViewport(middle, VIEWPORT)).toEqual(middle)
  })

  it('never produces a negative width or height', () => {
    const offscreen: Rect = { top: -5000, left: -5000, width: 100, height: 100 }
    const below: Rect = { top: 9000, left: 9000, width: 100, height: 100 }
    for (const r of [offscreen, below]) {
      const t = clampToViewport(r, VIEWPORT)
      expect(t.width).toBeGreaterThanOrEqual(0)
      expect(t.height).toBeGreaterThanOrEqual(0)
    }
  })

  it('keeps the arrow on screen once the target is trimmed', () => {
    const plan: Rect = { top: -17, left: 12, width: 1235, height: 3954 }
    const p = placeCallout(clampToViewport(plan, VIEWPORT), CALLOUT, VIEWPORT, GAP, MARGIN)
    expect(p.arrowY).toBeGreaterThanOrEqual(0)
    expect(p.arrowY).toBeLessThanOrEqual(VIEWPORT.height)
    expect(p.arrowX).toBeGreaterThanOrEqual(0)
    expect(p.arrowX).toBeLessThanOrEqual(VIEWPORT.width)
  })
})

describe('choosing a side', () => {
  it('prefers below when there is room', () => {
    expect(chooseSide(middle, CALLOUT, VIEWPORT, GAP)).toBe('bottom')
  })

  it('goes above when the target is near the bottom', () => {
    const low: Rect = { top: 700, left: 500, width: 200, height: 80 }
    expect(chooseSide(low, CALLOUT, VIEWPORT, GAP)).toBe('top')
  })

  it('goes beside when neither above nor below fits', () => {
    // A tall target leaves no vertical room but plenty to the right.
    const tall: Rect = { top: 20, left: 40, width: 120, height: 760 }
    expect(chooseSide(tall, CALLOUT, VIEWPORT, GAP)).toBe('right')
  })

  it('takes the roomiest side when nothing fits at all', () => {
    const cramped: Size = { width: 400, height: 400 }
    const huge: Rect = { top: 100, left: 100, width: 1000, height: 500 }
    // Above has 84px, below has 184px, left 88px, right 164px → below wins.
    expect(chooseSide(huge, cramped, VIEWPORT, GAP)).toBe('bottom')
  })
})

describe('placing the callout', () => {
  it('centres it under a target that has room below', () => {
    const p = placeCallout(middle, CALLOUT, VIEWPORT, GAP, MARGIN)
    expect(p.side).toBe('bottom')
    expect(p.top).toBe(middle.top + middle.height + GAP)
    expect(p.left).toBe(middle.left + middle.width / 2 - CALLOUT.width / 2)
  })

  it('never lets the callout leave the viewport', () => {
    // Every corner and both extremes, including targets already off-screen.
    const cases: Rect[] = [
      { top: 0, left: 0, width: 50, height: 50 },
      { top: 0, left: 1230, width: 50, height: 50 },
      { top: 750, left: 0, width: 50, height: 50 },
      { top: 750, left: 1230, width: 50, height: 50 },
      { top: -200, left: -200, width: 40, height: 40 },
      { top: 2000, left: 3000, width: 40, height: 40 },
    ]

    for (const target of cases) {
      const p = placeCallout(target, CALLOUT, VIEWPORT, GAP, MARGIN)
      expect(p.left).toBeGreaterThanOrEqual(MARGIN)
      expect(p.top).toBeGreaterThanOrEqual(MARGIN)
      expect(p.left + CALLOUT.width).toBeLessThanOrEqual(VIEWPORT.width - MARGIN)
      expect(p.top + CALLOUT.height).toBeLessThanOrEqual(VIEWPORT.height - MARGIN)
    }
  })

  it('keeps the arrow on the target even when the callout gets clamped', () => {
    // A target hard against the left edge pushes the callout right; the arrow
    // must stay attached to the thing being pointed at, not travel with it.
    const edge: Rect = { top: 300, left: 0, width: 40, height: 40 }
    const p = placeCallout(edge, CALLOUT, VIEWPORT, GAP, MARGIN)
    expect(p.arrowX).toBeGreaterThanOrEqual(edge.left)
    expect(p.arrowX).toBeLessThanOrEqual(edge.left + edge.width)
  })

  it('points the arrow at the edge facing the callout', () => {
    const below = placeCallout(middle, CALLOUT, VIEWPORT, GAP, MARGIN)
    expect(below.side).toBe('bottom')
    expect(below.arrowY).toBe(middle.top + middle.height)

    const low: Rect = { top: 700, left: 500, width: 200, height: 80 }
    const above = placeCallout(low, CALLOUT, VIEWPORT, GAP, MARGIN)
    expect(above.side).toBe('top')
    expect(above.arrowY).toBe(low.top)
  })

  it('survives a callout larger than the viewport without going negative', () => {
    const giant: Size = { width: 2000, height: 1200 }
    const p = placeCallout(middle, giant, VIEWPORT, GAP, MARGIN)
    expect(p.top).toBe(MARGIN)
    expect(p.left).toBe(MARGIN)
  })

  it('handles a phone-sized viewport', () => {
    const phone: Size = { width: 375, height: 667 }
    const card: Size = { width: 320, height: 180 }
    const target: Rect = { top: 40, left: 16, width: 343, height: 96 }
    const p = placeCallout(target, card, phone, GAP, MARGIN)
    expect(p.left).toBeGreaterThanOrEqual(MARGIN)
    expect(p.left + card.width).toBeLessThanOrEqual(phone.width - MARGIN)
    expect(p.top + card.height).toBeLessThanOrEqual(phone.height - MARGIN)
  })
})
