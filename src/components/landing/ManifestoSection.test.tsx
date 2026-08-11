import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { ManifestoSection } from './ManifestoSection'
import en from '../../i18n/messages/en.json'

/**
 * The phrases moved into the translations, so the tests read them from there.
 * Their own module is gone: two lists of taglines, one translated and one not,
 * is a drift waiting to happen — and the untranslated one would keep passing.
 */
const MANIFESTO_PHRASES = en.landing.manifesto.phrases

/** Stub matchMedia so the typewriter/Reveal see a specific motion preference. */
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
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('the manifesto phrases', () => {
  it('carries the marketing taglines without the app brand title', () => {
    expect(MANIFESTO_PHRASES.length).toBeGreaterThan(10)
    // The brand title is an app concern — it must not leak into the landing loop.
    expect(MANIFESTO_PHRASES).not.toContain('Blackjack Card Counting Trainer')
  })

  it('has no empty phrases', () => {
    for (const p of MANIFESTO_PHRASES) {
      expect(p.trim().length).toBeGreaterThan(0)
    }
  })
})

describe('ManifestoSection', () => {
  it('exposes a stable accessible name, never a half-typed string', () => {
    stubReducedMotion(false)
    render(<ManifestoSection />)
    expect(screen.getByRole('heading', { name: MANIFESTO_PHRASES[0] })).toBeInTheDocument()
  })

  it('renders a complete phrase statically when reduced motion is preferred', () => {
    stubReducedMotion(true)
    render(<ManifestoSection />)
    expect(screen.getByText(MANIFESTO_PHRASES[0])).toBeInTheDocument()
  })

  it('renders the supporting copy regardless of motion preference', () => {
    stubReducedMotion(true)
    render(<ManifestoSection />)
    expect(screen.getByText(new RegExp('small, measurable edge'))).toBeInTheDocument()
    expect(screen.getByText(new RegExp('reflexes are trained'))).toBeInTheDocument()
  })
})
