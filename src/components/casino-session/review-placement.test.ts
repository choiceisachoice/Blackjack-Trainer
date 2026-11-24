import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { reviewSide, sideDock, useReviewPlacement } from './review-placement'

describe('reviewSide', () => {
  it('never covers the player’s own hands when the other end is free of them', () => {
    expect(reviewSide([4])).toBe('left')
    expect(reviewSide([5], [0, 1])).toBe('left')
    expect(reviewSide([0], [4, 5])).toBe('right')
  })

  it('otherwise covers the end with fewer other players — empty seats first', () => {
    // The default table: the player in seat 4, two players in seats 5 and 6.
    expect(reviewSide([3], [4, 5])).toBe('left')
    expect(reviewSide([2], [0, 1])).toBe('right')
    // A tie goes right.
    expect(reviewSide([3])).toBe('right')
    expect(reviewSide([3], [0, 5])).toBe('right')
    // Hands at both ends: one of them is covered either way.
    expect(reviewSide([0, 5], [4])).toBe('left')
  })
})

describe('sideDock', () => {
  it('sits in the room beside the felt when there is enough of it', () => {
    // 2000px wide, a 1170px felt in the middle: 415px either side.
    const box = { width: 2000, height: 544 }
    const felt = { left: 415, top: 4, right: 1585, bottom: 540 }
    const style = sideDock(box, felt, 'right')
    expect(style.width).toBeLessThanOrEqual(415 - 28)
    expect(style.width).toBeGreaterThanOrEqual(320)
    // Clear of the felt.
    expect(2000 - (style.right as number) - (style.width as number)).toBeGreaterThanOrEqual(1585)
    expect(style.maxHeight).toBeLessThanOrEqual(540)
  })

  it('overlaps the felt’s edge, at a readable width, when there is not', () => {
    const box = { width: 1440, height: 730 }
    const felt = { left: 8, top: 8, right: 1432, bottom: 722 }
    const style = sideDock(box, felt, 'left')
    expect(style.left).toBe(18)
    expect(style.width).toBe(368)
    expect(style.right).toBeUndefined()
  })

  it('never grows wider than its maximum on a very wide screen', () => {
    const style = sideDock({ width: 3440, height: 900 }, { left: 900, top: 0, right: 2540, bottom: 900 }, 'right')
    expect(style.width).toBe(440)
  })
})

describe('useReviewPlacement', () => {
  const original = window.matchMedia
  afterEach(() => { window.matchMedia = original })

  const media = (matching: string[]) => {
    window.matchMedia = vi.fn((query: string) => ({
      matches: matching.includes(query), media: query, onchange: null,
      addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn(),
    })) as unknown as typeof window.matchMedia
  }

  it('is beside the felt on a desktop', () => {
    media(['(min-width: 1024px)'])
    expect(renderHook(() => useReviewPlacement()).result.current).toBe('side')
  })

  it('is a sheet on an upright phone', () => {
    media([])
    expect(renderHook(() => useReviewPlacement()).result.current).toBe('sheet')
  })

  it('is the controls column on a phone held sideways', () => {
    media(['(max-height: 520px) and (orientation: landscape)'])
    expect(renderHook(() => useReviewPlacement()).result.current).toBe('column')
  })
})
