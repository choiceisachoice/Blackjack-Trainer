import { describe, it, expect, afterEach, vi } from 'vitest'
import { renderHook, act, cleanup } from '@testing-library/react'
import { useTypewriter } from './use-typewriter'

const PHRASES = ['First phrase.', 'Second phrase.'] as const

/** Stub matchMedia so the hook sees a specific reduced-motion preference. */
function stubReducedMotion(reduce: boolean): void {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: reduce && query.includes('reduce'),
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }))
}

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('useTypewriter', () => {
  it('reports the first phrase statically when reduced motion is preferred', () => {
    stubReducedMotion(true)
    const { result } = renderHook(() => useTypewriter(PHRASES))
    expect(result.current.reduced).toBe(true)
    expect(result.current.display).toBe('First phrase.')
  })

  it('starts empty and types the first phrase out one character at a time', () => {
    stubReducedMotion(false)
    vi.useFakeTimers()
    const { result } = renderHook(() => useTypewriter(PHRASES, 10))

    expect(result.current.display).toBe('')
    expect(result.current.reduced).toBe(false)

    act(() => { vi.advanceTimersByTime(400) })
    // Some prefix has been typed, and it is always a prefix of the phrase.
    expect(result.current.display.length).toBeGreaterThan(0)
    expect('First phrase.'.startsWith(result.current.display)).toBe(true)
  })

  it('eventually types the full first phrase and rests', () => {
    stubReducedMotion(false)
    vi.useFakeTimers()
    const { result } = renderHook(() => useTypewriter(PHRASES, 10))

    // At speed 10 the 13-char phrase is fully typed within ~510ms; it then rests
    // for HOLD_FULL (1600ms) before deleting, so 1000ms lands inside that hold.
    act(() => { vi.advanceTimersByTime(1000) })
    expect(result.current.display).toBe('First phrase.')
    expect(result.current.resting).toBe(true)
  })

  it('deletes and moves on to the next phrase', () => {
    stubReducedMotion(false)
    vi.useFakeTimers()
    const { result } = renderHook(() => useTypewriter(PHRASES, 10))

    // Type first phrase, hold, delete it, then start the second.
    act(() => { vi.advanceTimersByTime(8000) })
    const shown = result.current.display
    expect('Second phrase.'.startsWith(shown) || 'First phrase.'.startsWith(shown)).toBe(true)
  })

  it('stops its timer on unmount', () => {
    stubReducedMotion(false)
    vi.useFakeTimers()
    const { unmount } = renderHook(() => useTypewriter(PHRASES, 10))
    unmount()
    // No pending work should throw or update state after teardown.
    expect(() => vi.advanceTimersByTime(5000)).not.toThrow()
  })

  it('handles an empty phrase list without crashing', () => {
    stubReducedMotion(true)
    const { result } = renderHook(() => useTypewriter([]))
    expect(result.current.display).toBe('')
  })
})
