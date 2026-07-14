import { render } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { HeroCanvas } from './HeroCanvas'

describe('HeroCanvas', () => {
  it('renders a decorative canvas and no-ops without WebGL (jsdom has no GL)', () => {
    const { container } = render(<HeroCanvas className="hero-bg" />)
    const canvas = container.querySelector('canvas')
    expect(canvas).toBeInTheDocument()
    expect(canvas).toHaveClass('hero-bg')
    // Decorative background — hidden from assistive tech.
    expect(canvas).toHaveAttribute('aria-hidden', 'true')
  })
})
