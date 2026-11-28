import { describe, it, expect, vi, afterEach } from 'vitest'
import { shouldLoadHeroCanvas, whenIdle, type HeroCanvasEnv } from './hero-canvas-gate'

/** A matchMedia that answers from a fixed set of matching queries. */
function media(width: number, reducedMotion = false): HeroCanvasEnv['matchMedia'] {
  return (q: string) => {
    const min = /min-width:\s*(\d+)px/.exec(q)
    if (min) return { matches: width >= Number(min[1]) }
    if (q.includes('prefers-reduced-motion')) return { matches: reducedMotion }
    return { matches: false }
  }
}

describe('shouldLoadHeroCanvas', () => {
  it('loads on a wide screen with cores to spare', () => {
    expect(shouldLoadHeroCanvas({ matchMedia: media(1440), hardwareConcurrency: 8 })).toBe(true)
  })

  it('does not load below md, where the hero sits under the phone scrim', () => {
    expect(shouldLoadHeroCanvas({ matchMedia: media(767), hardwareConcurrency: 8 })).toBe(false)
    expect(shouldLoadHeroCanvas({ matchMedia: media(768), hardwareConcurrency: 8 })).toBe(true)
  })

  it('respects reduced motion and save-data', () => {
    expect(shouldLoadHeroCanvas({ matchMedia: media(1440, true), hardwareConcurrency: 8 })).toBe(false)
    expect(shouldLoadHeroCanvas({ matchMedia: media(1440), hardwareConcurrency: 8, saveData: true })).toBe(false)
  })

  it('skips four cores or fewer, and treats an unreported count as enough', () => {
    expect(shouldLoadHeroCanvas({ matchMedia: media(1440), hardwareConcurrency: 4 })).toBe(false)
    expect(shouldLoadHeroCanvas({ matchMedia: media(1440), hardwareConcurrency: 2 })).toBe(false)
    expect(shouldLoadHeroCanvas({ matchMedia: media(1440) })).toBe(true)
  })

  it('declines where nothing can be read', () => {
    expect(shouldLoadHeroCanvas({})).toBe(false)
  })
})

describe('whenIdle', () => {
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

  it('falls back to a timeout without requestIdleCallback, and can be cancelled', () => {
    vi.useFakeTimers()
    vi.stubGlobal('requestIdleCallback', undefined)
    const fn = vi.fn()
    whenIdle(fn, 100)
    vi.advanceTimersByTime(100)
    expect(fn).toHaveBeenCalledOnce()

    const never = vi.fn()
    const cancel = whenIdle(never, 100)
    cancel()
    vi.advanceTimersByTime(500)
    expect(never).not.toHaveBeenCalled()
  })

  it('uses requestIdleCallback when there is one', () => {
    const ric = vi.fn((cb: () => void) => { cb(); return 1 })
    vi.stubGlobal('requestIdleCallback', ric)
    const fn = vi.fn()
    whenIdle(fn)
    expect(ric).toHaveBeenCalledOnce()
    expect(fn).toHaveBeenCalledOnce()
  })
})
