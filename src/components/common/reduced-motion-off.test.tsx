import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { BotStatusBadge } from '../casino-session/CardComponents'

/**
 * The guard on the other side: motion must not be flattened for visitors who
 * never asked for it.
 *
 * Its own file on purpose. `useReducedMotion` reads the media query once and
 * caches it, so a stub applied after the first call does nothing — the two
 * directions cannot be tested in one module. Vitest gives each file a fresh
 * registry, which is the cheapest honest way to assert both.
 */
beforeEach(() => {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false, media: query, onchange: null,
    addListener: () => {}, removeListener: () => {},
    addEventListener: () => {}, removeEventListener: () => {},
    dispatchEvent: () => false,
  }))
})
afterEach(() => { vi.unstubAllGlobals() })

describe('with no reduced-motion preference', () => {
  it('still declares the entrance', () => {
    render(<BotStatusBadge status="bust" />)
    expect(screen.getByTestId('bot-status').style.transform).toMatch(/scale\(0\.8\)/)
  })
})
