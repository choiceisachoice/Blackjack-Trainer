import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { TypewriterHeadline, HEADLINE_PHRASES } from './TypewriterHeadline'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('HEADLINE_PHRASES', () => {
  it('provides 20 phrases with the brand title first', () => {
    expect(HEADLINE_PHRASES).toHaveLength(20)
    expect(HEADLINE_PHRASES[0]).toBe('Blackjack Card Counting Trainer')
  })

  it('has no empty phrases', () => {
    for (const p of HEADLINE_PHRASES) {
      expect(p.trim().length).toBeGreaterThan(0)
    }
  })
})

describe('TypewriterHeadline', () => {
  it('exposes the brand title as the heading accessible name', () => {
    render(<TypewriterHeadline />)
    // The animation never drives the accessible name — it stays the brand title.
    expect(
      screen.getByRole('heading', { name: 'Blackjack Card Counting Trainer' })
    ).toBeInTheDocument()
  })

  it('renders the full brand title statically when reduced motion is preferred', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query.includes('reduce'),
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }))

    render(<TypewriterHeadline />)
    expect(screen.getByText('Blackjack Card Counting Trainer')).toBeInTheDocument()
  })
})
