import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, afterEach, vi } from 'vitest'
import { useCompactTable, COMPACT_TABLE_QUERY } from './useCompactTable'

const original = window.matchMedia

afterEach(() => {
  window.matchMedia = original
})

/** A `matchMedia` whose answer can be changed, as a rotation would. */
function fakeMatchMedia(initial: boolean) {
  let matches = initial
  const listeners = new Set<() => void>()
  window.matchMedia = vi.fn((query: string) => ({
    get matches() { return matches },
    media: query,
    addEventListener: (_: string, fn: () => void) => listeners.add(fn),
    removeEventListener: (_: string, fn: () => void) => listeners.delete(fn),
  })) as unknown as typeof window.matchMedia
  return (next: boolean) => { matches = next; listeners.forEach(fn => fn()) }
}

describe('useCompactTable', () => {
  it('is false where the browser cannot be asked', () => {
    window.matchMedia = undefined as unknown as typeof window.matchMedia
    expect(renderHook(() => useCompactTable()).result.current).toBe(false)
  })

  it('asks for a phone either way up', () => {
    fakeMatchMedia(true)
    expect(renderHook(() => useCompactTable()).result.current).toBe(true)
    expect(window.matchMedia).toHaveBeenCalledWith(COMPACT_TABLE_QUERY)
    expect(COMPACT_TABLE_QUERY).toContain('max-width: 639px')
    expect(COMPACT_TABLE_QUERY).toContain('orientation: landscape')
  })

  it('follows the screen when it changes', () => {
    const set = fakeMatchMedia(false)
    const { result } = renderHook(() => useCompactTable())
    expect(result.current).toBe(false)
    act(() => set(true))
    expect(result.current).toBe(true)
  })
})
