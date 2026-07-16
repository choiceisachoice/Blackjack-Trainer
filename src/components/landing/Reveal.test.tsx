import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { Reveal } from './Reveal'

/** Stub matchMedia so useReducedMotion sees a specific preference. */
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

describe('Reveal', () => {
  it('always renders its children (content never depends on the animation)', () => {
    stubReducedMotion(false)
    render(<Reveal><p>Readable content</p></Reveal>)
    expect(screen.getByText('Readable content')).toBeInTheDocument()
  })

  it('renders children statically when reduced motion is preferred', () => {
    stubReducedMotion(true)
    render(<Reveal delay={0.2}><p>Static content</p></Reveal>)
    expect(screen.getByText('Static content')).toBeInTheDocument()
  })

  it('passes its className through', () => {
    stubReducedMotion(true)
    const { container } = render(<Reveal className="test-class"><span>x</span></Reveal>)
    expect(container.querySelector('.test-class')).not.toBeNull()
  })
})
