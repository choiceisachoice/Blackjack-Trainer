import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { Reveal } from './Reveal'
import { beginPrerenderedBoot, endPrerenderedBoot } from '../../boot/prerendered-boot'

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

/**
 * The mount that replaces the prerendered page. The visitor is already
 * looking at these sections; the report was that the page "loads twice".
 */
describe('Reveal over a prerendered page', () => {
  let observed: { callback: IntersectionObserverCallback; threshold: unknown }[] = []

  function stubLayout(top: number, height = 400) {
    observed = []
    vi.stubGlobal('IntersectionObserver', class {
      constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
        observed.push({ callback, threshold: options?.threshold })
      }
      observe() {}
      disconnect() {}
    })
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(
      { top, height, bottom: top + height, left: 0, right: 0, width: 0, x: 0, y: top, toJSON: () => ({}) },
    )
  }

  afterEach(() => endPrerenderedBoot())

  it('leaves a section that is on screen exactly as it was painted', () => {
    stubReducedMotion(false)
    stubLayout(120)
    beginPrerenderedBoot()
    const { container } = render(<Reveal className="section"><p>Already read</p></Reveal>)
    const el = container.querySelector<HTMLElement>('.section')!
    // No opacity, no transform, nothing waiting on a scroll: the same markup
    // the server wrote, so replacing it changes no pixel.
    expect(el.style.opacity).toBe('')
    expect(el.style.transform).toBe('')
    expect(observed).toHaveLength(0)
  })

  it('still gives a section below the fold its entrance, the first time it scrolls in', () => {
    stubReducedMotion(false)
    stubLayout(window.innerHeight + 300)
    beginPrerenderedBoot()
    const { container } = render(<Reveal className="section" delay={0.06}><p>Further down</p></Reveal>)
    const el = container.querySelector<HTMLElement>('.section')!
    expect(el.style.opacity).toBe('0')
    expect(observed).toHaveLength(1)

    observed[0].callback([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver)
    expect(el.style.opacity).toBe('')
    expect(el.style.transform).toBe('')
    expect(el.style.transition).toContain('opacity')
  })

  it('asks for less than a quarter of a section too tall to ever show a quarter', () => {
    // A 6000px section on an 800px screen can never have 25% in view; with the
    // ordinary threshold it would stay invisible for good.
    stubReducedMotion(false)
    stubLayout(window.innerHeight + 10, 6000)
    beginPrerenderedBoot()
    render(<Reveal><p>Tall</p></Reveal>)
    expect(observed[0].threshold).toBeLessThan(0.25)
    expect(observed[0].threshold).toBeGreaterThan(0)
  })

  it('goes back to the ordinary entrance once the first commit is over', () => {
    stubReducedMotion(false)
    stubLayout(120)
    beginPrerenderedBoot()
    endPrerenderedBoot()
    const { container } = render(<Reveal className="section"><p>Navigated to</p></Reveal>)
    // framer-motion's initial state, written inline: hidden until in view.
    expect(container.querySelector<HTMLElement>('.section')!.style.opacity).toBe('0')
  })
})
