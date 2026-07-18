import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, within } from '@testing-library/react'
import { FeatureShowcase } from './FeatureShowcase'
import { PRO_BENEFITS } from '../../services/pro-features'

/** Stub matchMedia so Reveal renders its children without motion. */
function stubReducedMotion(): void {
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
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

/** The band a feature sits in is the *only* thing marking it as Free or Pro. */
function bandFor(title: string): HTMLElement {
  const heading = screen.getByRole('heading', { name: title })
  const band = heading.closest('div.grid')
  if (!band) throw new Error(`no band found for "${title}"`)
  return band as HTMLElement
}

describe('FeatureShowcase', () => {
  it('names both tiers as bands', () => {
    stubReducedMotion()
    render(<FeatureShowcase />)
    expect(screen.getByText('Free')).toBeInTheDocument()
    expect(screen.getByText('Pro')).toBeInTheDocument()
  })

  it('groups the paid features under Pro, not as per-card badges', () => {
    stubReducedMotion()
    render(<FeatureShowcase />)

    const proBand = bandFor('Full Casino Session')
    expect(within(proBand).getByRole('heading', { name: 'Deviations on the chart' })).toBeInTheDocument()
    expect(within(proBand).getByRole('heading', { name: 'Bankroll tools' })).toBeInTheDocument()

    // The old treatment stamped a "PRO" pill on individual cards — the band
    // carries the tier now, so no per-card badge should reappear.
    expect(screen.queryByText('PRO')).not.toBeInTheDocument()
  })

  it('keeps the free features out of the Pro band', () => {
    stubReducedMotion()
    render(<FeatureShowcase />)

    const freeBand = bandFor('Speed Drill & Flashcards')
    const proBand = bandFor('Full Casino Session')
    expect(freeBand).not.toBe(proBand)

    for (const title of ['Analytics that don’t lie', 'Levels & achievements']) {
      expect(within(freeBand).getByRole('heading', { name: title })).toBeInTheDocument()
      expect(within(proBand).queryByRole('heading', { name: title })).not.toBeInTheDocument()
    }
  })

  it('shows every paid feature the pricing section promises', () => {
    stubReducedMotion()
    render(<FeatureShowcase />)
    const proBand = bandFor('Full Casino Session')
    // Guards against the showcase and the Pro plan drifting apart: each benefit
    // headline should be represented in the Pro band.
    expect(PRO_BENEFITS.length).toBeGreaterThan(0)
    expect(within(proBand).getAllByRole('heading').length).toBeGreaterThanOrEqual(3)
  })

  it('marks the product visuals as decorative', () => {
    stubReducedMotion()
    const { container } = render(<FeatureShowcase />)
    // Each tile states its meaning in text; the glimpses must not be announced.
    const visuals = container.querySelectorAll('[aria-hidden="true"]')
    expect(visuals.length).toBeGreaterThanOrEqual(4)
  })
})
